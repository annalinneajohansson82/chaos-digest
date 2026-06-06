import fs from "node:fs/promises";
import { execSync } from "node:child_process";
import Parser from "rss-parser";
import { GoogleGenAI } from "@google/genai";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import config from "./config.js";

const today = new Date().toISOString().split("T")[0];
const { WINDOW_HOURS, MAX_ITEMS_PER_FEED, N_EXAMPLES, SNIPPET_MAX_CHARS,
        R2_REGION, R2_BUCKET, R2_DIGEST_PREFIX, R2_INTERESTING_PREFIX,
        GEMINI_MODEL, YOUTUBE_BASE_URL, YOUTUBE_RSS_BASE_URL } = config;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const FAILURE_THRESHOLD = 3;

const parser = new Parser({ timeout: 15000 });

// ---------------------------------------------------------------------------
// 1. Load feed config and failure tracking
// ---------------------------------------------------------------------------
async function loadFeeds() {
  const raw = await fs.readFile(new URL("./feeds.json", import.meta.url), "utf8");
  const config = JSON.parse(raw);
  // Flatten all groups (keys starting with "_" are comments) into one list
  return Object.entries(config)
    .filter(([key]) => !key.startsWith("_"))
    .flatMap(([, entries]) => entries);
}

async function loadFailures() {
  try {
    const raw = await fs.readFile(new URL("./feed-failures.json", import.meta.url), "utf8");
    return JSON.parse(raw);
  } catch {
    return { _comment: "Tracks consecutive days a feed has failed." };
  }
}

async function saveFailures(failures) {
  await fs.writeFile(
    new URL("./feed-failures.json", import.meta.url),
    JSON.stringify(failures, null, 2)
  );
}

function updateFailure(failures, feedName, didFail) {
  if (didFail) {
    if (!failures[feedName]) {
      failures[feedName] = { failed_since: today, error: "" };
    } else if (failures[feedName].failed_since === today) {
      // Already recorded today
    } else {
      const prevDate = new Date(failures[feedName].failed_since);
      const daysDiff = Math.floor((new Date(today) - prevDate) / (24 * 60 * 60 * 1000));
      if (daysDiff !== 1) {
        // Gap in failures, reset counter
        failures[feedName] = { failed_since: today, error: "" };
      }
    }
  } else {
    delete failures[feedName];
  }
}

function isReadyForRemoval(failures, feedName) {
  const failure = failures[feedName];
  if (!failure) return false;
  const failedSinceDate = new Date(failure.failed_since);
  const daysFailed = Math.floor((new Date(today) - failedSinceDate) / (24 * 60 * 60 * 1000)) + 1;
  return daysFailed >= FAILURE_THRESHOLD;
}

// ---------------------------------------------------------------------------
// 2. Resolve YouTube @handles to channel RSS feeds
// ---------------------------------------------------------------------------
async function resolveYouTube(handle) {
  const url = `${YOUTUBE_BASE_URL}${handle}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (chaosgoblin-digest)" },
  });
  if (!res.ok) throw new Error(`YouTube fetch ${res.status}`);
  const html = await res.text();
  const match =
    html.match(/"channelId":"(UC[\w-]+)"/) ||
    html.match(/channel\/(UC[\w-]+)/);
  if (!match) throw new Error("channelId not found");
  return `${YOUTUBE_RSS_BASE_URL}${match[1]}`;
}

// ---------------------------------------------------------------------------
// 3. Fetch + parse a single feed, return recent items (dead feeds -> [])
// ---------------------------------------------------------------------------
function isRecent(item) {
  const ts = item.isoDate || item.pubDate;
  if (!ts) return true; // keep undated items rather than lose them
  const ageHours = (Date.now() - new Date(ts).getTime()) / 36e5;
  return ageHours <= WINDOW_HOURS;
}

async function fetchFeed(entry) {
  try {
    let url = entry.url;
    if (entry.type === "youtube_handle") {
      url = await resolveYouTube(entry.handle);
    }
    let feed;
    if (entry.type === "reddit_rss") {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0" },
      });
      if (!res.ok) throw new Error(`Reddit fetch ${res.status}`);
      const body = await res.text();
      feed = await parser.parseString(body);
    } else {
      feed = await parser.parseURL(url);
    }
    const items = (feed.items || [])
      .filter(isRecent)
      .slice(0, MAX_ITEMS_PER_FEED)
      .map((i) => ({
        source: entry.name,
        title: (i.title || "").trim(),
        link: i.link || "",
        date: i.isoDate || i.pubDate || "",
        snippet: (i.contentSnippet || i.content || "")
          .replace(/\s+/g, " ")
          .slice(0, SNIPPET_MAX_CHARS),
      }));
    return { items, name: entry.name, failed: false };
  } catch (err) {
    console.warn(`  skip "${entry.name}": ${err.message}`);
    return { items: [], name: entry.name, failed: true, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// 4. R2 client (created once in main, passed to functions that need it)
// ---------------------------------------------------------------------------
function createR2Client() {
  return new S3Client({
    region: R2_REGION,
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

// ---------------------------------------------------------------------------
// 5. Frontmatter helpers
// ---------------------------------------------------------------------------
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (key) meta[key] = val;
  }
  return { meta, body: match[2] };
}

function serializeWithFrontmatter(meta, body) {
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

// ---------------------------------------------------------------------------
// 6. Read AI Digests/Interesting/, stamp new files, return N most recent bodies
//    Fails gracefully: errors here never abort the main digest run.
// ---------------------------------------------------------------------------
async function loadInterestingItems(r2) {
  let contents;
  try {
    const res = await r2.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: R2_INTERESTING_PREFIX })
    );
    contents = res.Contents ?? [];
  } catch (err) {
    console.warn(`  Could not list Interesting/ folder: ${err.message}`);
    return [];
  }

  const keys = contents
    .map((obj) => obj.Key)
    .filter((k) => k !== R2_INTERESTING_PREFIX && !k.endsWith("/"));

  if (keys.length === 0) return [];
  console.log(`  Found ${keys.length} item(s) in Interesting/`);

  const processed = [];
  for (const key of keys) {
    try {
      const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      const raw = await res.Body.transformToString("utf-8");
      const { meta, body } = parseFrontmatter(raw);

      if (!meta.digest_seen) {
        // First time this file has been seen — stamp it and write back
        meta.digest_seen = today;
        const updated = serializeWithFrontmatter(meta, body);
        await r2.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: updated,
            ContentType: "text/markdown; charset=utf-8",
          })
        );
        console.log(`  Stamped: ${key}`);
      }

      processed.push({ body: body.trim(), digest_seen: meta.digest_seen });
    } catch (err) {
      console.warn(`  Could not process ${key}: ${err.message}`);
    }
  }

  // Most-recent-first by digest_seen date, capped at N_EXAMPLES
  processed.sort((a, b) => b.digest_seen.localeCompare(a.digest_seen));
  return processed.slice(0, N_EXAMPLES).map((item) => item.body);
}

// ---------------------------------------------------------------------------
// 7. Build the filter prompt + call Gemini Flash (free tier)
// ---------------------------------------------------------------------------
const CONTENT_STRATEGY = `
Blog: chaosgoblin.xyz
Niche: A software developer with AuDHD (autism + ADHD) writing about the
intersection of the two: what dev work is actually like from inside an AuDHD
brain. The strongest angles are specific to AuDHD + dev, not just ADHD, not
just autism, not just "being a developer".

Recurring territory: debugging, code review, pair programming, deadlines,
meetings, hyperfocus, context-switching, sensory load of open offices,
executive dysfunction vs the "10x organized engineer" myth, masking at work.

What fits:
- Smaller/indie/open source AI dev tools, especially workflow hacks
- Tools or techniques touching cognitive load, context management, focus, task-switching
- Discourse on neurodivergence in tech work
- Major model/lab releases (include briefly regardless of niche fit)

What does NOT fit:
- Generic productivity tips with no dev or neurodivergence angle
- Inspirational / awareness-campaign tone
- Enterprise/business software news, pure marketing
- Generic "AI changes everything" takes
`;

function buildPrompt(items, examples = []) {
  const list = items
    .map(
      (i, n) =>
        `[${n + 1}] ${i.source} | ${i.title}\n    ${i.link}\n    ${i.snippet}`
    )
    .join("\n\n");

  const examplesSection =
    examples.length > 0
      ? `\n## Previously valued by Anna\nThese are items Anna saved as worth reading. Use them to calibrate topic and\nangle weighting — bias toward surfacing similar content. They do not override\nthe content strategy above; treat them as a soft signal, not a hard filter.\n\n${examples.map((e, i) => `[${i + 1}]\n${e}`).join("\n\n---\n\n")}\n\n`
      : "";

  return `You are a research assistant for the blog chaosgoblin.xyz. Today is ${today}.

Below are ${items.length} items pulled from the blog's RSS sources in the last
${WINDOW_HOURS} hours. Filter them against this content strategy:
${CONTENT_STRATEGY}
${examplesSection}Prioritize: smaller/indie/open source tools and workflow hacks over Big Tech.
Include major model releases briefly even if off-niche. Be selective: 3-5 strong
matches beats ten mediocre ones. Never invent items or links; only use what is
listed. If nothing fits, say so plainly.

ITEMS:
${list}

Output this markdown structure exactly:

# AI Digest — ${today}

## Strong matches
### [Title]
**Source:** [source + link]
**What it is:** [1-2 factual sentences, no hype]
**Why it fits:** [1 sentence tying to the AuDHD + dev intersection]
**Possible angle:** [1 concrete post hook, not generic]

---

## Worth watching
### [Title]
**Source:** [source + link]
**What it is:** [1-2 sentences]
**Why it might fit:** [1 sentence]

---

## Big news
- [Item]: [1 sentence + link]

---

If there are no strong matches, write "*No strong matches today.*" under that
heading instead of padding.`;
}

async function generateDigest(items, examples = []) {
  if (items.length === 0) {
    return `# AI Digest — ${today}\n\n## Strong matches\n\n*No items pulled from feeds today (all feeds empty or unreachable).*\n`;
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildPrompt(items, examples),
  });
  const text = (response.text || "").trim();
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

// ---------------------------------------------------------------------------
// 8. Upload digest to R2
// ---------------------------------------------------------------------------
async function uploadToR2(r2, content) {
  const key = `${R2_DIGEST_PREFIX}${today}.md`;
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: content,
      ContentType: "text/markdown; charset=utf-8",
    })
  );
  console.log(`Uploaded: ${key}`);
}

// ---------------------------------------------------------------------------
// 9. Handle feed removal for sources that failed N consecutive days
// ---------------------------------------------------------------------------
async function removeBrokenFeeds(feedsToRemove) {
  if (feedsToRemove.length === 0) return;

  const feedsPath = new URL("./feeds.json", import.meta.url).pathname;
  const raw = await fs.readFile(feedsPath, "utf8");
  const feedsConfig = JSON.parse(raw);

  let removed = 0;
  for (const [section, entries] of Object.entries(feedsConfig)) {
    if (section.startsWith("_")) continue;
    feedsConfig[section] = entries.filter((entry) => {
      if (feedsToRemove.includes(entry.name)) {
        console.log(`  Removing broken feed: ${entry.name}`);
        removed++;
        return false;
      }
      return true;
    });
  }

  if (removed > 0) {
    await fs.writeFile(feedsPath, JSON.stringify(feedsConfig, null, 2));

    const failuresPath = new URL("./feed-failures.json", import.meta.url).pathname;
    const failures = await loadFailures();
    for (const name of feedsToRemove) {
      delete failures[name];
    }
    await saveFailures(failures);

    // Commit and push
    try {
      execSync("git config user.name 'Claude Digest Bot'", { cwd: process.cwd() });
      execSync("git config user.email 'noreply@anthropic.com'", { cwd: process.cwd() });
      execSync("git add scripts/feeds.json scripts/feed-failures.json", { cwd: process.cwd() });
      const branchName = `auto/remove-broken-feeds-${today}`;
      execSync(`git checkout -b ${branchName}`, { cwd: process.cwd() });
      execSync(`git commit -m "Remove ${removed} broken feed(s)\\n\\nAutomatically removed feeds that failed for ${FAILURE_THRESHOLD} consecutive days.\\nRemoved: ${feedsToRemove.join(', ')}"`, { cwd: process.cwd() });
      execSync(`git push origin ${branchName}`, { cwd: process.cwd() });

      // Create PR with auto-merge using gh CLI (available in GitHub Actions)
      const prTitle = `Remove ${removed} broken feed(s)`;
      const prBody = `Automatically removed ${removed} feed(s) that failed for ${FAILURE_THRESHOLD} consecutive days.\\n\\nRemoved feeds:\\n${feedsToRemove.map((f) => `- ${f}`).join('\\n')}`;
      execSync(`gh pr create --base main --head ${branchName} --title "${prTitle}" --body "${prBody}" --auto-merge`, { cwd: process.cwd() });
      console.log(`Created PR from ${branchName} with auto-merge enabled`);
    } catch (err) {
      console.warn(`  Could not create removal PR: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  try {
    const r2 = createR2Client();

    const feeds = await loadFeeds();
    console.log(`Fetching ${feeds.length} feeds...`);
    const results = await Promise.all(feeds.map(fetchFeed));

    let failures = await loadFailures();
    const feedsToRemove = [];

    for (const result of results) {
      updateFailure(failures, result.name, result.failed);
      if (result.failed && isReadyForRemoval(failures, result.name)) {
        feedsToRemove.push(result.name);
      }
    }

    if (feedsToRemove.length > 0) {
      await removeBrokenFeeds(feedsToRemove);
    } else {
      await saveFailures(failures);
    }

    const items = results
      .filter((r) => !feedsToRemove.includes(r.name))
      .flatMap((r) => r.items);
    console.log(`Collected ${items.length} recent items.`);

    console.log("Loading interesting items for signal...");
    const examples = await loadInterestingItems(r2);
    console.log(`Signal: ${examples.length} example(s) loaded.`);

    const digest = await generateDigest(items, examples);
    await uploadToR2(r2, digest);
    console.log("Done.");
  } catch (err) {
    console.error("Digest failed:", err);
    process.exit(1);
  }
}

main();
