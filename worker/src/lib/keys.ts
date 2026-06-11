/**
 * Key constants and helpers for R2 path construction and validation.
 *
 * Layout in the `notes` bucket mirrors scripts/config.js:
 *   Digests   → obsidian/AI Digests/YYYY-MM-DD.md
 *   Interesting → obsidian/AI Digests/Interesting/<id>.md
 *
 * All functions are pure; no I/O.
 */

// ---------------------------------------------------------------------------
// 1. Prefix constants
// ---------------------------------------------------------------------------

/** Top-level prefix shared by all digest-related objects. */
export const DIGEST_PREFIX = "obsidian/AI Digests/";

/** Prefix for manually-curated "interesting" items (few-shot signal). */
export const INTERESTING_PREFIX = "obsidian/AI Digests/Interesting/";

// ---------------------------------------------------------------------------
// 2. Digest helpers
// ---------------------------------------------------------------------------

/** Returns true if `date` is a bare ISO calendar date (YYYY-MM-DD). */
export function isValidDigestDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/** Returns the full R2 key for a digest by date, e.g. `obsidian/AI Digests/2026-06-10.md`. */
export function digestKey(date: string): string {
  return DIGEST_PREFIX + date + ".md";
}

/**
 * Extracts the YYYY-MM-DD date from a full R2 key.
 * Returns `null` when the key doesn't match the expected shape
 * (e.g. a key inside the `Interesting/` subfolder).
 */
export function digestDateFromKey(key: string): string | null {
  const m = key.match(/^obsidian\/AI Digests\/(\d{4}-\d{2}-\d{2})\.md$/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// 3. Interesting-item helpers  (consumed by Phase 3; defined now for completeness)
// ---------------------------------------------------------------------------

/**
 * Returns true when `id` is a safe storage identifier.
 *
 * Rules (key-traversal guard):
 *   - Matches ^[a-zA-Z0-9._ -]+$  (spaces and uppercase allowed for
 *     backward-compat with hand-created files)
 *   - Must NOT contain `/` or `\`
 *   - Must NOT start with `.`
 */
export function isValidInterestingId(id: string): boolean {
  if (!id || id.startsWith(".")) return false;
  if (id.includes("/") || id.includes("\\")) return false;
  return /^[a-zA-Z0-9._ -]+$/.test(id);
}

/** Returns the full R2 key for an interesting item. */
export function interestingKey(id: string): string {
  return INTERESTING_PREFIX + id + ".md";
}

/**
 * Extracts the item ID from a full interesting-item R2 key.
 * Strips the prefix and `.md` suffix, then validates the result.
 * Returns `null` if the key doesn't match or the extracted ID is invalid.
 */
export function interestingIdFromKey(key: string): string | null {
  if (!key.startsWith(INTERESTING_PREFIX)) return null;
  const withoutPrefix = key.slice(INTERESTING_PREFIX.length);
  if (!withoutPrefix.endsWith(".md")) return null;
  const id = withoutPrefix.slice(0, -".md".length);
  return isValidInterestingId(id) ? id : null;
}

/**
 * Converts an arbitrary title string into a URL/filename-safe slug.
 *
 * Steps:
 *   1. Unicode NFKD normalise
 *   2. Strip combining diacritical marks (U+0300–U+036F)
 *   3. Lowercase
 *   4. Replace runs of non-alphanumeric chars with `-`
 *   5. Trim leading/trailing `-`
 *   6. Truncate to 80 chars, re-trim trailing `-`
 *   7. Fallback to `"item"` when the result is empty
 */
export function slugify(title: string): string {
  let slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length > 80) {
    slug = slug.slice(0, 80).replace(/-+$/, "");
  }

  return slug || "item";
}
