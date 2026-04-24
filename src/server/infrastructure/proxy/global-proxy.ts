/**
 * Bootstrap global proxy — reads HTTP_PROXY / HTTPS_PROXY from process.env
 * (which is populated from .env by loadRuntimeConfig()) and seeds them into
 * child processes via NODE_OPTIONS --require in dev.ts / start.ts.
 * The actual proxy routing is done by the proxy-preload.cjs script using undici ProxyAgent.
 */
export function bootstrapGlobalProxy(): boolean {
  const proxyUrl =
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.ALL_PROXY ??
    process.env.all_proxy;

  return Boolean(proxyUrl);
}
