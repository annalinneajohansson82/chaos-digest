/**
 * Environment bindings injected by Cloudflare Workers at runtime.
 *
 * All routes receive these through Hono's generic `Bindings` slot so
 * `c.env.BUCKET` is fully typed everywhere without an explicit cast.
 */
export interface Env {
  BUCKET: R2Bucket;
}
