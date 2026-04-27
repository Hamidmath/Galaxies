// Edit BUCKET to your own GCS bucket after you create it.
// e.g. https://storage.googleapis.com/galaxy-knn-data
window.APP_CONFIG = {
  GCS_BASE: "https://storage.googleapis.com/galaxy-knn-data",
  // Page size for the searchable dropdown — mirrors the Tk app.
  PAGE: 5000,
  // Total kNN neighbors precomputed per object.
  TOTAL_NN: 100,
};
