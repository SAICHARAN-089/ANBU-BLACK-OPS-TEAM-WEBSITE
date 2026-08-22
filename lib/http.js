/* ============================================================
   ANBU BLACK OPS — Cross-runtime HTTP client
   ------------------------------------------------------------
   The app talks to Supabase over plain HTTPS. Node 18+ ships a
   global fetch(), but older runtimes (Node 16.x and earlier —
   still used by some Vercel serverless projects) do not. This
   tiny wrapper uses the native fetch when it exists and otherwise
   falls back to Node's built-in https/http modules, so the
   backend works on every runtime without extra dependencies.
   ============================================================ */

const http = require("http");
const https = require("https");

function fetchLike(url, options) {
  if (typeof global.fetch === "function") {
    /* Prefer the native fetch, but never let a fetch-level failure
       (flaky runtimes, URL parsing quirks) kill the request — fall
       back to the built-in http/https modules below. Otherwise a
       single transient failure marks Supabase as "down" and the app
       silently drops to file storage for 30 seconds. */
    return global.fetch(url, options).catch(() => httpFetch(url, options));
  }
  return httpFetch(url, options);
}

function httpFetch(url, options) {
  const opts = options || {};
  const u = new URL(url);
  const mod = u.protocol === "https:" ? https : http;
  const body = opts.body != null ? Buffer.from(opts.body) : null;

  return new Promise((resolve, reject) => {
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method: opts.method || "GET",
        headers: opts.headers || {},
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: res.headers,
            text: () => Promise.resolve(data),
            json: () => {
              try {
                return Promise.resolve(JSON.parse(data));
              } catch (e) {
                return Promise.reject(e);
              }
            },
          });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { fetchLike };
