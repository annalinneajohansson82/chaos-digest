// =============================================================================
// chaos-digest configuration
// Edit values here; run `node update-schedule.js` after changing SCHEDULE.
// =============================================================================

export default {
  // ---------------------------------------------------------------------------
  // Feed fetching
  // ---------------------------------------------------------------------------

  // How many hours back to look for feed items (slightly over 24h to absorb
  // timing drift between runs).
  WINDOW_HOURS: 28,

  // Maximum items kept per feed — caps noisy sources like Reddit / Hacker News.
  MAX_ITEMS_PER_FEED: 15,

  // Character limit for item snippets sent to the AI model.
  SNIPPET_MAX_CHARS: 400,

  // ---------------------------------------------------------------------------
  // AI / model
  // ---------------------------------------------------------------------------

  // LLM provider: "gemini" or "anthropic"
  LLM_PROVIDER: "gemini",

  // Model ID for the chosen provider.
  // Gemini example:    "gemini-2.5-flash"
  // Anthropic example: "claude-opus-4-8"
  LLM_MODEL: "gemini-2.5-flash",

  // Number of previously-saved "interesting" items used as few-shot signal.
  N_EXAMPLES: 15,

  // ---------------------------------------------------------------------------
  // Storage — S3-compatible (Cloudflare R2, MinIO, AWS S3, etc.)
  // Endpoint and credentials are read from env vars S3_ENDPOINT,
  // S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (repo secrets).
  // ---------------------------------------------------------------------------

  S3_REGION: "auto",  // use "auto" for Cloudflare R2; set a real region (e.g. "us-east-1") for AWS S3 or MinIO
  S3_BUCKET: "notes",

  // Key prefix where generated digests are stored.
  S3_DIGEST_PREFIX: "obsidian/AI Digests/",

  // Key prefix for items manually marked as interesting (few-shot signal).
  S3_INTERESTING_PREFIX: "obsidian/AI Digests/Interesting/",

  // ---------------------------------------------------------------------------
  // YouTube
  // ---------------------------------------------------------------------------

  YOUTUBE_BASE_URL: "https://www.youtube.com/",
  YOUTUBE_RSS_BASE_URL: "https://www.youtube.com/feeds/videos.xml?channel_id=",

  // ---------------------------------------------------------------------------
  // Schedule
  // After changing this value run: node scripts/update-schedule.js
  // That script translates this string into a cron expression and updates
  // .github/workflows/daily-digest.yml automatically.
  //
  // Note: Node.js version is set on line 17 of .github/workflows/daily-digest.yml.
  // ---------------------------------------------------------------------------

  SCHEDULE: "once daily at 7am UTC",
};
