# Chaos Digest

An automated AI-powered content aggregator that generates a daily curated digest for [chaosgoblin.xyz](https://chaosgoblin.xyz) — a blog about neurodivergence (AuDHD) and software development.

## How it works

1. Fetches items from ~30 RSS feeds (tech blogs, YouTube channels, Reddit communities, research labs) published in the last 28 hours
2. Loads up to 15 previously marked "interesting" items from R2 storage as few-shot examples
3. Sends everything to Google Gemini (gemini-2.5-flash), which filters down to ~3–5 strong matches aligned with the blog's niche: debugging, code review, cognitive load, context-switching, neurodivergence
4. Uploads the resulting Markdown digest to Cloudflare R2 (synced with an Obsidian vault)

Runs daily at 7am UTC via GitHub Actions.

## Project structure

```
scripts/
├── daily-digest.js       # Main pipeline: fetch → filter → upload
├── update-schedule.js    # Translates human-readable schedule to cron via Gemini
├── config.js             # Window size, model, storage paths, schedule
├── feeds.json            # Feed sources organized by category
└── feed-failures.json    # Tracks consecutive failures per feed
.github/workflows/
└── daily-digest.yml      # Scheduled and manual trigger workflow
```

## Setup

**Install dependencies:**

```bash
cd scripts && npm install
```

**Required environment variables:**

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |

**Run manually:**

```bash
node scripts/daily-digest.js
```

## Feed management

Feeds that fail 3 consecutive days are automatically removed — the script opens a GitHub PR with the change so nothing breaks silently.

If a digest has already run today, new content is appended with a timestamp rather than overwriting.
