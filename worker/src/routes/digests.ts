import { Hono } from "hono";
import type { Env } from "../types.js";
import {
  DIGEST_PREFIX,
  digestDateFromKey,
  digestKey,
  isValidDigestDate,
} from "../lib/keys.js";

/**
 * /api/digests — list and fetch daily digest objects from R2.
 *
 * All error responses use the project-wide shape:
 *   { "error": { "code": "NOT_FOUND" | "BAD_REQUEST" | "INTERNAL", "message": string } }
 */
const digests = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /api/digests
// ---------------------------------------------------------------------------

/**
 * List digest metadata, newest-first, with cursor-based pagination.
 *
 * Query params:
 *   limit   — integer 1–100, default 30
 *   cursor  — YYYY-MM-DD; if given, only dates strictly before this are returned
 *
 * Response 200:
 *   { items: [{ date: string }, ...], nextCursor: string | null }
 */
digests.get("/", async (c) => {
  // --- parse `limit` ---
  const limitParam = c.req.query("limit");
  let limit = 30;
  if (limitParam !== undefined) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || isNaN(parsed)) {
      return c.json(
        { error: { code: "BAD_REQUEST", message: "limit must be an integer" } },
        400
      );
    }
    if (parsed < 1 || parsed > 100) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "limit must be between 1 and 100",
          },
        },
        400
      );
    }
    limit = parsed;
  }

  // --- parse `cursor` ---
  const cursorParam = c.req.query("cursor");
  if (cursorParam !== undefined && !isValidDigestDate(cursorParam)) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "cursor must be a valid date (YYYY-MM-DD)",
        },
      },
      400
    );
  }

  // --- list all digest keys from R2 ---
  // Using `delimiter: "/"` so the `Interesting/` subfolder is collapsed into
  // `delimitedPrefixes` and never appears in `objects`.
  const allKeys: string[] = [];
  let r2Cursor: string | undefined = undefined;

  do {
    const page = await c.env.BUCKET.list({
      prefix: DIGEST_PREFIX,
      delimiter: "/",
      ...(r2Cursor ? { cursor: r2Cursor } : {}),
    });

    for (const obj of page.objects) {
      allKeys.push(obj.key);
    }

    r2Cursor = page.truncated ? page.cursor : undefined;
  } while (r2Cursor);

  // --- map to dates, drop non-matching keys ---
  const allDates = allKeys
    .map(digestDateFromKey)
    .filter((d): d is string => d !== null);

  // --- sort descending (ISO string compare works correctly for YYYY-MM-DD) ---
  allDates.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));

  // --- apply cursor (keep only dates strictly before cursor) ---
  const filtered = cursorParam
    ? allDates.filter((d) => d < cursorParam)
    : allDates;

  // --- slice to limit, compute nextCursor ---
  const page = filtered.slice(0, limit);
  const nextCursor =
    filtered.length > limit ? filtered[limit - 1] : null;

  return c.json({
    items: page.map((date) => ({ date })),
    nextCursor,
  });
});

// ---------------------------------------------------------------------------
// GET /api/digests/:date
// ---------------------------------------------------------------------------

/**
 * Fetch the full markdown body of a single digest by date.
 *
 * Response 200:
 *   { date: string, markdown: string }
 */
digests.get("/:date", async (c) => {
  const date = c.req.param("date");

  if (!isValidDigestDate(date)) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "date must be a valid date (YYYY-MM-DD)",
        },
      },
      400
    );
  }

  const obj = await c.env.BUCKET.get(digestKey(date));

  if (obj === null) {
    return c.json(
      { error: { code: "NOT_FOUND", message: `No digest found for ${date}` } },
      404
    );
  }

  return c.json({ date, markdown: await obj.text() });
});

export default digests;
