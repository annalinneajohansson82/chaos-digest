import fs from "node:fs/promises";
import Parser from "rss-parser";
import { GoogleGenAI } from "@google/genai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const today = new Date().toISOString().split("T")[0];
const WINDOW_HOURS = 28; // a little over 24h to absorb run-timing drift
const MAX_ITEMS_PER_FEED = 15; // cap noisy feeds (Reddit, HN)

const parser = new Parser({ timeout: 15000 });

// ---------------------------------------------------------------------------
// 1. Load feed config
// ---------------------------------------------------------------------------
async function loadFeeds() {
  const raw = await fs.readFile(new URL("./feeds.json", import.meta.url), "utf8");
  const config = JSON.parse(raw);
  // Flatten all groups (keys starting with "_" are comments) into one list
  return Object.entries(config)
    .filter(([key]) => !key.startsWith("_"))
    .flatMap(([, entries]) => entries);
}

// ---------------------------------------------------------------------------
// 2. Resolve YouTube @handles to channel RSS feeds
// ---------------------------------------------------------------------------
async function resolveYouTube(handle) {
  const url = `https://www.youtube.com/${handle}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (chaosgoblin-digest)" },
  });
  if (!res.ok) throw new Error(`YouTube fetch ${res.status}`);
  const html = await res.text();
  const match =
    html.match(/"channelId":"(UC[\w-]+)"/) ||
    html.match(/channel\/(UC[\w-]+)/);
  if (!match) throw new Error("channelId not found");
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${match[1]}`;
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
    const feed = await parser.parseURL(url);
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
          .slice(0, 400),
      }));
    return items;
  } catch (err) {
    console.warn(`  skip "${entry.name}": ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 4. Build the filter prompt + call Gemini Flash (free tier)
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

function buildPrompt(items) {
  const list = items
    .map(
      (i, n) =>
        `[${n + 1}] ${i.source} | ${i.title}\n    ${i.link}\n    ${i.snippet}`
    )
    .join("\n\n");

  return `You are a research assistant for the blog chaosgoblin.xyz. Today is ${today}.

Below are ${items.length} items pulled from the blog's RSS sources in the last
${WINDOW_HOURS} hours. Filter them against this content strategy:
${CONTENT_STRATEGY}

Prioritize: smaller/indie/open source tools and workflow hacks over Big Tech.
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

async function generateDigest(items) {
  if (items.length === 0) {
    return `# AI Digest — ${today}\n\n## Strong matches\n\n*No items pulled from feeds today (all feeds empty or unreachable).*\n`;
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: buildPrompt(items),
  });
  const text = (response.text || "").trim();
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

// ---------------------------------------------------------------------------
// 5. Upload to R2
// ---------------------------------------------------------------------------
async function uploadToR2(content) {
  const client = new S3Client({
    region: "auto",
    endpoint:
      "https://9a55ca892783d4a47da198e9ff6a5daa.r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const key = `AI Digests/${today}.md`;
  await client.send(
    new PutObjectCommand({
      Bucket: "notes",
      Key: key,
      Body: content,
      ContentType: "text/markdown; charset=utf-8",
    })
  );
  console.log(`Uploaded: ${key}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  try {
    const feeds = await loadFeeds();
    console.log(`Fetching ${feeds.length} feeds...`);

    const results = await Promise.all(feeds.map(fetchFeed));
    const items = results.flat();
    console.log(`Collected ${items.length} recent items.`);

    const digest = await generateDigest(items);
    await uploadToR2(digest);
    console.log("Done.");
  } catch (err) {
    console.error("Digest failed:", err);
    process.exit(1);
  }
}

main();
