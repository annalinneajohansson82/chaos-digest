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

  // Gemini model used for content generation.
  GEMINI_MODEL: "gemini-2.5-flash",

  // Number of previously-saved "interesting" items used as few-shot signal.
  N_EXAMPLES: 15,

  // ---------------------------------------------------------------------------
  // Storage — Cloudflare R2
  // ---------------------------------------------------------------------------

  R2_REGION: "auto",
  // R2_ENDPOINT is read from the R2_ENDPOINT environment variable (repo secret)
  R2_BUCKET: "notes",

  // R2 key prefix where generated digests are stored.
  R2_DIGEST_PREFIX: "obsidian/AI Digests/",

  // R2 key prefix for items manually marked as interesting (few-shot signal).
  R2_INTERESTING_PREFIX: "obsidian/AI Digests/Interesting/",

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
