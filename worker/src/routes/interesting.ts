import { Hono } from "hono";
import type { Env } from "../types.js";
import {
  INTERESTING_PREFIX,
  interestingIdFromKey,
  interestingKey,
  isValidInterestingId,
  slugify,
} from "../lib/keys.js";
import { parseFrontmatter, serializeWithFrontmatter } from "../lib/frontmatter.js";

/**
 * /api/interesting — list, create, and delete "interesting" items stored
 * under the Interesting/ prefix in R2.
 *
 * Compatibility note: items are plain markdown with line-based `key: value`
 * frontmatter (see lib/frontmatter.ts). New items deliberately omit the
 * `digest_seen` key — its absence is the pipeline's "new file" signal
 * (scripts/daily-digest.js `loadInterestingItems`).
 *
 * All error responses use the project-wide shape:
 *   { "error": { "code": "NOT_FOUND" | "BAD_REQUEST" | "INTERNAL", "message": string } }
 */
const interesting = new Hono<{ Bindings: Env }>();

/** Maximum allowed markdown body length, in characters. */
const MAX_MARKDOWN_CHARS = 32 * 1024;

/** Maximum slug collision-resolution attempts before giving up. */
const MAX_SLUG_ATTEMPTS = 50;

/** Markdown content type, matching the pipeline's writes. */
const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derives a display title for an item.
 *
 * Precedence: explicit `title` frontmatter → first `### ` heading text in the
 * body → the id with `-` replaced by spaces.
 */
function deriveTitle(
  meta: Record<string, string>,
  body: string,
  id: string
): string {
  if (meta.title) return meta.title;
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^###\s+(.*\S)\s*$/);
    if (m) return m[1];
  }
  return id.replace(/-/g, " ");
}

/** Today's date as YYYY-MM-DD in UTC. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// GET /api/interesting
// ---------------------------------------------------------------------------

/**
 * List interesting items, newest-first.
 *
 * Sort key is `created ?? digestSeen ?? ""` descending, tie-broken by id
 * descending.
 *
 * Response 200:
 *   { items: [{ id, title, created, digestSeen }, ...] }
 */
interesting.get("/", async (c) => {
  // --- list all item keys from R2 (loop while truncated) ---
  const keys: string[] = [];
  let cursor: string | undefined = undefined;

  do {
    const page = await c.env.BUCKET.list({
      prefix: INTERESTING_PREFIX,
      ...(cursor ? { cursor } : {}),
    });

    for (const obj of page.objects) {
      // Drop the bare prefix placeholder and any "folder" keys.
      if (obj.key === INTERESTING_PREFIX || obj.key.endsWith("/")) continue;
      keys.push(obj.key);
    }

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  // --- map keys to ids, dropping any that don't validate ---
  const entries = keys
    .map((key) => ({ key, id: interestingIdFromKey(key) }))
    .filter((e): e is { key: string; id: string } => e.id !== null);

  // --- fetch all objects in parallel and parse frontmatter ---
  const items = (
    await Promise.all(
      entries.map(async ({ key, id }) => {
        const obj = await c.env.BUCKET.get(key);
        // A concurrent delete can race the get to null — skip, don't crash.
        if (obj === null) return null;
        const { meta, body } = parseFrontmatter(await obj.text());
        return {
          id,
          title: deriveTitle(meta, body, id),
          created: meta.created ?? null,
          digestSeen: meta.digest_seen ?? null,
        };
      })
    )
  ).filter((item): item is NonNullable<typeof item> => item !== null);

  // --- sort: created ?? digestSeen ?? "" desc, then id desc ---
  items.sort((a, b) => {
    const ka = a.created ?? a.digestSeen ?? "";
    const kb = b.created ?? b.digestSeen ?? "";
    if (ka !== kb) return ka > kb ? -1 : 1;
    return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
  });

  return c.json({ items });
});

// ---------------------------------------------------------------------------
// POST /api/interesting
// ---------------------------------------------------------------------------

/**
 * Create a new interesting item.
 *
 * Request body (JSON): { title: string, markdown: string }
 *
 * The new file omits `digest_seen` so the pipeline treats it as new and
 * stamps it on its next run.
 *
 * Response 201:
 *   { id, title, created }
 */
interesting.post("/", async (c) => {
  // --- parse + validate body ---
  let parsed: unknown;
  try {
    parsed = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Body must be valid JSON" } },
      400
    );
  }

  const body = parsed as { title?: unknown; markdown?: unknown };

  if (typeof body.title !== "string" || body.title.trim() === "") {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "title is required and must be a non-empty string",
        },
      },
      400
    );
  }

  if (typeof body.markdown !== "string" || body.markdown.trim() === "") {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "markdown is required and must be a non-empty string",
        },
      },
      400
    );
  }

  if (body.markdown.length > MAX_MARKDOWN_CHARS) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: `markdown must not exceed ${MAX_MARKDOWN_CHARS} characters`,
        },
      },
      400
    );
  }

  // --- normalise title: collapse all whitespace runs to single spaces ---
  const cleanTitle = body.title.replace(/\s+/g, " ").trim();

  // --- resolve a non-colliding slug ---
  const baseSlug = slugify(cleanTitle);
  let id = baseSlug;
  let attempt = 1;
  while (true) {
    const existing = await c.env.BUCKET.head(interestingKey(id));
    if (existing === null) break;
    attempt += 1;
    if (attempt > MAX_SLUG_ATTEMPTS) {
      return c.json(
        {
          error: {
            code: "INTERNAL",
            message: "Could not allocate a unique id for this item",
          },
        },
        500
      );
    }
    id = `${baseSlug}-${attempt}`;
  }

  // --- build file content (no digest_seen) ---
  const created = todayUtc();
  const content = serializeWithFrontmatter(
    { title: cleanTitle, created },
    `### ${cleanTitle}\n\n${body.markdown.trim()}\n`
  );

  await c.env.BUCKET.put(interestingKey(id), content, {
    httpMetadata: { contentType: MARKDOWN_CONTENT_TYPE },
  });

  return c.json({ id, title: cleanTitle, created }, 201);
});

// ---------------------------------------------------------------------------
// DELETE /api/interesting/:id
// ---------------------------------------------------------------------------

/**
 * Delete an interesting item by id.
 *
 * Response 204 (empty body) on success; 404 when the item does not exist.
 */
interesting.delete("/:id", async (c) => {
  const id = c.req.param("id");

  if (!isValidInterestingId(id)) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Invalid item id" } },
      400
    );
  }

  const key = interestingKey(id);
  const existing = await c.env.BUCKET.head(key);
  if (existing === null) {
    return c.json(
      { error: { code: "NOT_FOUND", message: `No item found for ${id}` } },
      404
    );
  }

  await c.env.BUCKET.delete(key);
  return c.body(null, 204);
});

export default interesting;
