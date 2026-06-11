/**
 * Proxies all /api/* requests to the private chaos-digest-api Worker via the
 * `API` service binding (configured in the Pages project settings). The Worker
 * has no public URL; this proxy is its only ingress, so the Cloudflare Access
 * policy on the Pages hostname covers the API too.
 */
export const onRequest: PagesFunction<{ API: Fetcher }> = (ctx) =>
  ctx.env.API.fetch(ctx.request);
