// CommonJS preload — loaded via NODE_OPTIONS --require before Next.js starts.
// Routes all HTTP/HTTPS requests (including native fetch) through the configured proxy.
const proxyUrl =
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.ALL_PROXY ||
  process.env.all_proxy;

if (!proxyUrl) {
  module.exports = {};
} else {
  const { setGlobalDispatcher, ProxyAgent } = require("undici");

  // undici's ProxyAgent handles both HTTP and HTTPS through the proxy
  const agent = new ProxyAgent(proxyUrl);
  setGlobalDispatcher(agent);
}
