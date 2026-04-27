/* Cloudflare Worker — gates the R2 bucket so only the deployed web app
   can fetch files. Direct curl/wget from another origin gets 403.

   Deploy via Cloudflare dashboard:
     1. Workers & Pages → Create → Worker → name it (e.g. galaxy-knn-proxy)
     2. Replace the template code with this entire file → Save and Deploy.
     3. Settings → Variables → R2 Bucket Bindings → Add binding:
          Variable name: BUCKET
          R2 bucket:     galaxy-knn-data
     4. Re-deploy.
     5. Copy the worker.dev URL (e.g. https://galaxy-knn-proxy.<acct>.workers.dev)
     6. (Optional but recommended) On the bucket Settings page, DISABLE
        "Public Development URL" so the only way in is through this Worker.
*/

const ALLOWED_ORIGINS = new Set([
  "https://hamidmath.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

// Only these paths are served. No directory listing, no other R2 ops.
const ALLOWED_PATHS = /^\/(meta\.json|images\/[0-9]+\.png|nn\/[0-9]+\.json|sig\/[0-9]+\.json)$/;

export default {
  async fetch(request, env) {
    const url     = new URL(request.url);
    const origin  = request.headers.get("Origin")  || "";
    const referer = request.headers.get("Referer") || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Gate: must come from our app. Origin header is set by browsers on
    // CORS requests; Referer is set on direct image/script loads.
    const okOrigin  = ALLOWED_ORIGINS.has(origin);
    const okReferer = [...ALLOWED_ORIGINS].some((o) => referer.startsWith(o + "/"));
    if (!okOrigin && !okReferer) {
      return new Response("Forbidden", { status: 403 });
    }

    // Path whitelist
    if (!ALLOWED_PATHS.test(url.pathname)) {
      return new Response("Not Found", { status: 404 });
    }

    const key = url.pathname.slice(1);
    const obj = await env.BUCKET.get(key);
    if (!obj) return new Response("Not Found", { status: 404 });

    const headers = corsHeaders(origin);
    obj.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=86400");
    headers.set("ETag", obj.httpEtag);

    // If the stored object is gzip-encoded (we do this for nn/ to save
    // R2 storage), decompress it in the Worker and let Cloudflare's edge
    // apply its own gzip/brotli toward the client. This avoids the
    // double-encoding that happens when both the object and the edge
    // claim Content-Encoding: gzip.
    let body = obj.body;
    if (obj.httpMetadata && obj.httpMetadata.contentEncoding === "gzip") {
      headers.delete("Content-Encoding");
      body = obj.body.pipeThrough(new DecompressionStream("gzip"));
    }

    return new Response(body, { status: 200, headers });
  },
};

function corsHeaders(origin) {
  const h = new Headers();
  if (ALLOWED_ORIGINS.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }
  h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Range");
  return h;
}
