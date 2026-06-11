/**
 * seed.mjs — Miniflare-based local R2 seeder
 *
 * WHY THIS EXISTS (not `wrangler r2 object put`):
 *   wrangler 3.114 and wrangler 4 both URL-encode keys containing spaces when
 *   writing to the local SQLite backing store under .wrangler/state/v3/r2.
 *   A key like "obsidian/AI Digests/2026-06-10.md" is stored as
 *   "obsidian/AI%20Digests/2026-06-10.md", but the Workers runtime reads
 *   literal (un-encoded) keys — so BUCKET.list() and BUCKET.get() find nothing.
 *   The Miniflare JS API writes keys verbatim, bypassing the CLI's encoding
 *   path, and shares the same SQLite persistence format that wrangler dev reads.
 *
 * NAMESPACE MATCHING:
 *   Miniflare derives a per-bucket SQLite filename by hashing a "namespace"
 *   string. When wrangler dev starts, it passes r2Buckets as an object map
 *   { binding → bucket_name }, e.g. { BUCKET: "notes" }, so the namespace used
 *   is the bucket_name ("notes"). This script must mirror that exactly — using
 *   r2Buckets: { BUCKET: "notes" } — so both processes hash the same namespace
 *   and land on the same SQLite file. Using r2Buckets: ["BUCKET"] would hash
 *   "BUCKET" instead and write to a different file that wrangler dev never reads.
 *
 * Run from the worker/ directory:
 *   npm run seed
 *
 * The script always wipes state first (rm -rf .wrangler/state is expected to
 * be done by the caller before running this for a clean slate, but it is also
 * safe to re-run without wiping — puts are idempotent).
 */

import { Miniflare } from "miniflare";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedContent = readFileSync(join(__dirname, "2026-06-10.md"), "utf8");
const interestingContent = readFileSync(join(__dirname, "interesting-example.md"), "utf8");

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response(null); } }",
  // Use object form { binding: bucketName } so Miniflare hashes "notes" as the
  // namespace, matching what wrangler dev does when it reads wrangler.toml's
  // [[r2_buckets]] binding = "BUCKET" / bucket_name = "notes".
  r2Buckets: { BUCKET: "notes" },
  r2Persist: ".wrangler/state/v3/r2",
});

const bucket = await mf.getR2Bucket("BUCKET");

const digestKeys = [
  "obsidian/AI Digests/2026-06-09.md",
  "obsidian/AI Digests/2026-06-10.md",
  "obsidian/AI Digests/2026-06-11.md",
];

for (const key of digestKeys) {
  await bucket.put(key, seedContent, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });
  console.log("wrote:", key);
}

const interestingKey = "obsidian/AI Digests/Interesting/existing-item.md";
await bucket.put(interestingKey, interestingContent, {
  httpMetadata: { contentType: "text/markdown; charset=utf-8" },
});
console.log("wrote:", interestingKey);

await mf.dispose();
console.log("seed complete");
