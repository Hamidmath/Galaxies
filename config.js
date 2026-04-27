// Public read-only base URL where the data is hosted.
// (Cloudflare R2 public-development URL; bucket: galaxy-knn-data)
window.APP_CONFIG = {
  GCS_BASE: "https://pub-ff738f4cef1b4cfb805cf8aa5d3e01d5.r2.dev",
  // Page size for the searchable dropdown.
  PAGE: 5000,
  // Total kNN neighbors precomputed per object.
  TOTAL_NN: 100,
};
