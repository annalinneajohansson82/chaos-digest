# Chaos Digest

A personal daily content aggregator that pulls from RSS/Atom feeds, Reddit communities, and YouTube channels, filters everything through an LLM via OpenRouter, and uploads a curated Markdown digest to Cloudflare R2 — where it lands directly in an Obsidian vault.

Runs on a schedule via GitHub Actions. The digest is tuned to a specific content strategy (AuDHD + software development), but that strategy lives in one place in the code and is straightforward to replace.

## How it works

1. Fetches items from ~30 sources published within the last 28 hours — RSS/Atom blogs, Reddit (with spoofed UA to avoid blocks), and YouTube channels resolved from `@handles` at runtime
2. Loads up to 15 previously saved "interesting" items from R2 as few-shot signal
3. Sends everything to an LLM via [OpenRouter](https://openrouter.ai), which filters down to a small set of strong matches and formats them as structured Markdown. A three-model free fallback chain is tried in order within a single request
4. Uploads the digest to R2 at `obsidian/AI Digests/YYYY-MM-DD.md`; if a digest already exists for today, new content is appended with a timestamp rather than overwriting

Feed failures are tracked across days. After 3 consecutive failures, the feed is automatically removed from `feeds.json` and a GitHub PR is opened.

## Project structure

```
scripts/
├── daily-digest.js       # Full pipeline: fetch → filter → upload
├── update-schedule.js    # Translates a human-readable schedule string to cron and patches the workflow file
├── llm.js                # OpenRouter API call (native fetch, no SDK); exports callModel()
├── config.js             # All tunable values: window, MODELS fallback chain, R2 paths, schedule, content strategy
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
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `R2_ENDPOINT` or `S3_ENDPOINT` | Cloudflare R2 (or S3-compatible) endpoint URL |
| `R2_ACCESS_KEY_ID` or `S3_ACCESS_KEY_ID` | Access key ID |
| `R2_SECRET_ACCESS_KEY` or `S3_SECRET_ACCESS_KEY` | Secret access key |

The code reads `S3_*` first and falls back to `R2_*` automatically — set whichever you have.

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

The content strategy — what gets included, what gets filtered out — is the `CONTENT_STRATEGY` field in `config.js`, alongside all other tunable values. Edit it to match your niche.

Previously saved items act as few-shot examples for the model. Drop Markdown files into the `obsidian/AI Digests/Interesting/` prefix in your R2 bucket and they'll be picked up on the next run and used to calibrate the filter.

## Web UI

**Architecture:** Angular 18 SPA (`web/`) deployed to Cloudflare Pages; private Hono API (`worker/`) runs as a Cloudflare Worker with R2 binding for the `notes` bucket. Auth is zero-code: Cloudflare Access policy on the Pages hostname covers both the UI and the proxied API.

**Local development:**

Terminal 1 (Worker):
```bash
cd worker && npx wrangler dev
```

Terminal 2 (Web):
```bash
cd web && npm start
```
App runs on `localhost:4200`; `/api` requests proxy to the Worker on `localhost:8787`.

**Seed data** (one-time, from `worker/`, if using local R2):
```bash
npm run seed
```
(seeds example digests and an interesting item into the local R2 state)

**Deploy:**

1. **Worker:** From `worker/` directory:
   ```bash
   npx wrangler deploy
   ```
   Remains private (`workers_dev = false`, no public routes).

2. **Pages project:** In Cloudflare dashboard, create a Git-integrated Pages project:
   - Root directory: `web`
   - Build command: `npm ci && npm run build`
   - Build output: `dist/web/browser`

3. **Service binding:** Pages project Settings → Functions → Add a service binding:
   - Name: `API`
   - Service: `chaos-digest-api` (the private Worker)

4. **Access control:** Cloudflare Zero Trust → Create an Access application covering the Pages hostname. Include preview URLs (`*.pages.dev`) in the policy to protect both production and preview deployments.

**Module federation:** The app is a Native Federation remote exposing `./routes` in `remoteEntry.json`. A future host application can mount it using `loadRemoteModule('chaos-digest', './routes')` and may override the `API_BASE_URL` injection token to point to its own API; standalone deployment is unaffected.
