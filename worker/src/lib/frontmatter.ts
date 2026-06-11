/**
 * Line-based `key: value` frontmatter parser/serializer.
 *
 * IMPORTANT: This is a verbatim port of `parseFrontmatter` /
 * `serializeWithFrontmatter` in scripts/daily-digest.js (the pipeline).
 * Files written here must round-trip through the pipeline's parser and
 * vice-versa, so the two implementations MUST stay in sync:
 *   - same regex `^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$`
 *   - same `indexOf(":")`-based split with key/value trimming
 *   - same serialize shape `---\n` + `key: value` lines + `\n---\n` + body
 *
 * Deliberately uses NO YAML library — the pipeline does not either.
 */

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parse line-based frontmatter from a markdown file.
 *
 * Mirrors scripts/daily-digest.js `parseFrontmatter` exactly.
 *
 * @param raw - Raw file content.
 * @returns Parsed metadata map and the markdown body.
 */
export function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (key) meta[key] = val;
  }
  return { meta, body: match[2] };
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Serialize frontmatter and a markdown body back into a file string.
 *
 * Mirrors scripts/daily-digest.js `serializeWithFrontmatter` exactly.
 *
 * @param meta - Frontmatter key/value pairs.
 * @param body - Markdown body content.
 * @returns Serialized file content.
 */
export function serializeWithFrontmatter(
  meta: Record<string, string>,
  body: string
): string {
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}
