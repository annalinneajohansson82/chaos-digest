import { Hono } from "hono";
import type { Env } from "../types.js";

/**
 * /api/digests — router for daily digest objects stored in R2.
 *
 * Phase 1: stubs only.  The real list + cursor pagination logic
 * (reading `Digests/` keys from BUCKET) will replace these in a
 * later phase.
 */
const digests = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /api/digests
// ---------------------------------------------------------------------------

/**
 * List digest metadata, newest first, with cursor-based pagination.
 *
 * @stub Returns an empty page until Phase 2 wires up R2 listing.
 */
digests.get("/", (c) => {
  return c.json({ items: [], nextCursor: null });
});

export default digests;
