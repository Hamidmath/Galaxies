// Read-only data endpoint. Backed by Cloudflare R2 + a Cloudflare Worker
// (galaxy-knn-proxy) that gates requests by Origin/Referer so direct
// scraping from outside this site is blocked.
window.APP_CONFIG = {
  GCS_BASE: "https://galaxy-knn-proxy.hamidmath2013.workers.dev",
  // Page size for the searchable dropdown.
  PAGE: 5000,
  // Total kNN neighbors precomputed per object.
  TOTAL_NN: 100,
};
