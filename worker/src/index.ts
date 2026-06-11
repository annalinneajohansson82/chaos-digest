import { Hono } from "hono";
import type { Env } from "./types.js";
import digests from "./routes/digests.js";
import interesting from "./routes/interesting.js";

/**
 * Chaos Digest API — Cloudflare Worker entry point.
 *
 * This worker is only reachable through a Pages service binding and
 * carries no authentication logic of its own.  It must never be
 * exposed directly to the public internet (see wrangler.toml).
 *
 * Error shape used on every route:
 *   { "error": { "code": "NOT_FOUND" | "BAD_REQUEST" | "INTERNAL", "message": string } }
 */
const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// 1. Global error handlers
// ---------------------------------------------------------------------------

/**
 * Catch-all 404 handler — returned when no route matches.
 */
app.notFound((c) => {
  return c.json(
    { error: { code: "NOT_FOUND", message: "Route not found" } },
    404
  );
});

/**
 * Unhandled error handler — logs internally, never leaks a stack trace.
 */
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "INTERNAL", message: "An internal error occurred" } },
    500
  );
});

// ---------------------------------------------------------------------------
// 2. Route mounts
// ---------------------------------------------------------------------------

/** Daily digest objects read from R2. */
app.route("/api/digests", digests);

/** Curated "interesting" items read from R2. */
app.route("/api/interesting", interesting);

// ---------------------------------------------------------------------------
// 3. Worker export
// ---------------------------------------------------------------------------

export default app;
