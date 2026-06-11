import { Hono } from "hono";
import type { Env } from "../types.js";

/**
 * /api/interesting — router for "interesting" items curated from the
 * Interesting/ prefix in R2.
 *
 * Phase 1: stubs only.  The real listing and metadata logic will
 * replace these in a later phase.
 */
const interesting = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /api/interesting
// ---------------------------------------------------------------------------

/**
 * List interesting items, newest first.
 *
 * @stub Returns an empty list until Phase 2 wires up R2 listing.
 */
interesting.get("/", (c) => {
  return c.json({ items: [] });
});

export default interesting;
