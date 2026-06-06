# Chaos Digest

A personal daily content aggregator that pulls from RSS/Atom feeds, Reddit communities, and YouTube channels, filters everything through Google Gemini, and uploads a curated Markdown digest to Cloudflare R2 — where it lands directly in an Obsidian vault.

Runs on a schedule via GitHub Actions. The digest is tuned to a specific content strategy (AuDHD + software development), but that strategy lives in one place in the code and is straightforward to replace.

## How it works

1. Fetches items from ~30 sources published within the last 28 hours — RSS/Atom blogs, Reddit (with spoofed UA to avoid blocks), and YouTube channels resolved from `@handles` at runtime
2. Loads up to 15 previously saved "interesting" items from R2 as few-shot signal
3. Sends everything to Gemini (gemini-2.5-flash), which filters down to a small set of strong matches and formats them as structured Markdown
4. Uploads the digest to R2 at `obsidian/AI Digests/YYYY-MM-DD.md`; if a digest already exists for today, new content is appended with a timestamp rather than overwriting

Feed failures are tracked across days. After 3 consecutive failures, the feed is automatically removed from `feeds.json` and a GitHub PR is opened.

## Project structure

```
scripts/
├── daily-digest.js       # Full pipeline: fetch → filter → upload
├── update-schedule.js    # Translates a human-readable schedule string to cron and patches the workflow file
├── config.js             # All tunable values: window, model, R2 paths, schedule
├── feeds.json            # Feed sources grouped by category
├── feed-failures.json    # Consecutive failure tracking (committed by the bot)
└── package.json
.github/workflows/
└── daily-digest.yml      # Runs on schedule + manual trigger
```

## Setup

**Install dependencies:**

```bash
cd scripts && npm install
```

**Required environment variables** (set as GitHub Actions secrets for scheduled runs):

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |

**Run manually:**

```bash
node scripts/daily-digest.js
```

**Change the schedule:**

Edit `SCHEDULE` in `config.js`, then run:

```bash
node scripts/update-schedule.js
```

This translates the human-readable string to a cron expression and patches the workflow file automatically.

## Feeds

Sources are defined in `scripts/feeds.json` grouped into categories. Three types are supported:

| Type | How it works |
|---|---|
| `rss` | Parsed directly via rss-parser |
| `reddit_rss` | Fetched with a browser User-Agent to avoid Reddit blocks |
| `youtube_handle` | `@handle` resolved to a channel RSS URL at runtime |

## Personalising

The content strategy — what gets included, what gets filtered out — is a single string constant (`CONTENT_STRATEGY`) in `daily-digest.js`. Edit it to match your niche.

Previously saved items act as few-shot examples for the model. Drop Markdown files into the `obsidian/AI Digests/Interesting/` prefix in your R2 bucket and they'll be picked up on the next run and used to calibrate the filter.
