/* Random-100 page — independent of the main app. Loads meta.json once,
   then samples 100 random object ids each time the user clicks Refresh. */
(function () {
  "use strict";
  const CFG = window.APP_CONFIG;

  const grid       = document.getElementById("grid-100");
  const statusText = document.getElementById("status-text");
  const refreshBtn = document.getElementById("refresh-btn");

  let OBJECTS = [];
  let LABELS  = [];

  fetch(CFG.GCS_BASE + "/meta.json")
    .then((r) => {
      if (!r.ok) throw new Error("meta.json HTTP " + r.status);
      return r.json();
    })
    .then((m) => {
      OBJECTS = m.objects;
      LABELS  = m.labels;
      statusText.textContent =
        m.n.toLocaleString() + " objects available";
      shuffle();
    })
    .catch((e) => {
      statusText.textContent = "ERROR loading meta: " + e.message;
    });

  function shuffle() {
    const valid = OBJECTS.filter((o) => o[4] > 0);
    if (!valid.length) return;
    const seen = new Set();
    const picks = [];
    while (picks.length < 100 && seen.size < valid.length) {
      const i = Math.floor(Math.random() * valid.length);
      if (seen.has(i)) continue;
      seen.add(i);
      picks.push(valid[i]);
    }

    grid.innerHTML = "";
    picks.forEach((o, k) => {
      const cell = document.createElement("div");
      cell.className = "grid-cell";

      const img = document.createElement("img");
      img.src = CFG.GCS_BASE + "/images/" + o[0] + ".png";
      img.alt = o[0];
      img.crossOrigin = "anonymous";
      img.title = "Click to query this galaxy in the main browser";
      img.addEventListener("click", () => {
        // Opens the main browser focused on this object id.
        window.open("./?q=" + encodeURIComponent(o[0]), "_blank");
      });

      const lab = LABELS[o[1]] || "?";
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML =
        '<div class="rank">#' + (k + 1) + '</div>' +
        "<div>" + o[0] + "</div>" +
        "<div>" + lab + "  Ps=" + o[2].toFixed(2) +
        "  Pf=" + o[3].toFixed(2) + "</div>" +
        "<div>res=" + o[4] + "px</div>";

      cell.appendChild(img);
      cell.appendChild(meta);
      grid.appendChild(cell);
    });
    statusText.textContent = "Showing 100 random galaxies (out of " +
                             OBJECTS.length.toLocaleString() + ")";
  }

  refreshBtn.addEventListener("click", shuffle);
})();
