import Anthropic from "@anthropic-ai/sdk";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const today = new Date().toISOString().split("T")[0];

const CONTENT_STRATEGY = `
Blog: chaosgoblin.xyz
Niche: Software developer with AuDHD (autism + ADHD) writing about the intersection
of neurodivergence and software development. Not just ADHD, not just autism, not just
"being a developer". The intersection specifically.

Core topics:
- Debugging, code review, pair programming, deadlines, meetings
- Hyperfocus, context-switching, executive dysfunction
- Sensory load, masking at work, the "10x organized engineer" myth
- AI tools and workflows as they relate to cognitive load and neurodivergent dev work

What fits:
- Smaller/indie/open source AI dev tools
- Workflow hacks, unconventional AI use in coding
- Tools addressing cognitive load, context management, focus, task-switching
- Research or discourse on neurodivergence in tech
- Major model releases (include briefly regardless of niche fit)

What does NOT fit:
- Generic productivity tips with no dev or neurodivergence angle
- Enterprise/business software news
- Pure marketing with no technical substance
- Generic "AI will change everything" takes
`;

const DIGEST_PROMPT = `
You are a research assistant for the blog chaosgoblin.xyz. Today is ${today}.

Search broadly across multiple source types for the latest AI and dev tooling news
(last 24-48 hours; expand to last week if the news cycle is slow):

- YouTube: new tool demos, workflow videos, developer tutorials
- Reddit: r/LocalLLaMA, r/MachineLearning, r/programming, r/ChatGPT, r/ADHD, r/neurodivergent
- Hacker News: Show HN posts, new releases, discussions
- GitHub: trending repos, new releases, interesting open source projects
- Twitter/X: indie devs, AI researchers, open source maintainers (not just verified accounts)
- Smaller tech blogs and newsletters, not just major outlets
- Any significant model or lab announcements

Prioritize in this order:
1. Smaller, lesser-known, indie, or open source tools and projects
2. Workflow hacks and unconventional uses of AI in development
3. Anything with a clear neurodivergent developer angle
4. Open source releases
5. Major model/lab news (include regardless of niche fit, but keep brief)

Filter everything against this content strategy:
${CONTENT_STRATEGY}

Output the following markdown structure exactly:

# AI Digest — ${today}

## Strong matches
(Clear angles for the blog niche. Be selective. 3-5 items max. Quality over quantity.)

### [Item title]
**Source:** [URL or platform + handle/channel if applicable]
**What it is:** [1-2 sentences, factual, no hype]
**Why it fits:** [1 sentence connecting specifically to AuDHD/dev intersection]
**Possible angle:** [1 sentence on a concrete post hook, not generic]

---

## Worth watching
(Relevant but angle needs more development, or only tangentially on-niche)

### [Item title]
**Source:** [URL or platform]
**What it is:** [1-2 sentences]
**Why it might fit:** [1 sentence]

---

## Big news
(Major releases or announcements, brief regardless of niche fit)

- [Item]: [1 sentence]

---

*No strong matches today.* — use this if nothing fits rather than padding.

Rules:
- Never invent sources or URLs. Only include things you actually found.
- If a day is genuinely slow, say so clearly.
- Smaller and weirder is more interesting than big and obvious.
`;

async function generateDigest() {
  console.log(`Generating digest for ${today}...`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: DIGEST_PROMPT }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Empty response from API");
  return text;
}

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

async function main() {
  try {
    const digest = await generateDigest();
    await uploadToR2(digest);
    console.log("Done.");
  } catch (err) {
    console.error("Digest failed:", err);
    process.exit(1);
  }
}

main();
