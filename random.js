/* Random-100 page. Loads meta.json once, builds the filter UI, then
   samples 100 random object ids from whatever subset the filters define
   each time the user clicks Refresh. */
(function () {
  "use strict";
  const CFG = window.APP_CONFIG;
  const $   = (id) => document.getElementById(id);

  const grid       = $("grid-100");
  const statusText = $("status-text");
  const refreshBtn = $("refresh-btn");

  const fLabelGen  = $("f-label-general");
  const fLabelSub  = $("f-label-sub");
  const fPsMin     = $("f-ps-min");
  const fPsMax     = $("f-ps-max");
  const fPfMin     = $("f-pf-min");
  const fPfMax     = $("f-pf-max");
  const fResMin    = $("f-res-min");
  const fResMax    = $("f-res-max");
  const applyBtn   = $("apply-btn");
  const resetBtn   = $("reset-btn");
  const filterCnt  = $("filter-count");

  let OBJECTS         = [];
  let LABELS          = [];
  let LABELS_BY_GEN   = {};
  let FILTERED        = [];

  fetch(CFG.GCS_BASE + "/meta.json")
    .then((r) => {
      if (!r.ok) throw new Error("meta.json HTTP " + r.status);
      return r.json();
    })
    .then((m) => {
      OBJECTS = m.objects;
      LABELS  = m.labels;
      buildLabelDropdown();
      readUrlFilters();
      statusText.textContent = m.n.toLocaleString() + " objects available";
      applyFilters();
    })
    .catch((e) => {
      statusText.textContent = "ERROR loading meta: " + e.message;
    });

  /* ---- label dropdowns (general + sub) ---- */
  function generalOf(lab) {
    const m = lab.match(/^[A-Za-z]+/);
    return m ? m[0] : lab;
  }

  function buildLabelDropdown() {
    LABELS_BY_GEN = {};
    LABELS.forEach((lab) => {
      const g = generalOf(lab);
      (LABELS_BY_GEN[g] = LABELS_BY_GEN[g] || []).push(lab);
    });
    const generals = Object.keys(LABELS_BY_GEN).sort();
    fLabelGen.innerHTML = "";
    fLabelGen.appendChild(makeOpt("(any)", "(any)"));
    generals.forEach((g) => {
      const n = LABELS_BY_GEN[g].length;
      fLabelGen.appendChild(makeOpt(g, g + (n > 1 ? "  (" + n + ")" : "")));
    });
    populateSubDropdown();
  }

  function populateSubDropdown() {
    const gen = fLabelGen.value;
    fLabelSub.innerHTML = "";
    fLabelSub.appendChild(makeOpt("(any)", "(any)"));
    const subList = (gen === "(any)") ? LABELS : (LABELS_BY_GEN[gen] || []);
    subList.forEach((s) => fLabelSub.appendChild(makeOpt(s, s)));
    fLabelSub.value = "(any)";
  }

  function makeOpt(value, text) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    return o;
  }

  /* Read filter state from the URL (set by the main app when opening
     this tab). Anything not in the URL keeps its default. */
  function readUrlFilters() {
    const p = new URLSearchParams(location.search);
    if (p.has("gen")) {
      const v = p.get("gen");
      if ([...fLabelGen.options].some((o) => o.value === v)) {
        fLabelGen.value = v;
        populateSubDropdown();
      }
    }
    if (p.has("sub")) {
      const v = p.get("sub");
      if ([...fLabelSub.options].some((o) => o.value === v)) {
        fLabelSub.value = v;
      }
    }
    if (p.has("psmin"))  fPsMin.value  = p.get("psmin");
    if (p.has("psmax"))  fPsMax.value  = p.get("psmax");
    if (p.has("pfmin"))  fPfMin.value  = p.get("pfmin");
    if (p.has("pfmax"))  fPfMax.value  = p.get("pfmax");
    if (p.has("resmin")) fResMin.value = p.get("resmin");
    if (p.has("resmax")) fResMax.value = p.get("resmax");
  }

  /* ---- filtering ---- */
  function applyFilters() {
    const psMin = parseFloat(fPsMin.value), psMax = parseFloat(fPsMax.value);
    const pfMin = parseFloat(fPfMin.value), pfMax = parseFloat(fPfMax.value);
    const rMin  = parseInt(fResMin.value, 10),  rMax  = parseInt(fResMax.value, 10);
    if ([psMin, psMax, pfMin, pfMax].some(isNaN) || isNaN(rMin) || isNaN(rMax)) {
      alert("Bad filter value. Ps/Pf must be in [0,1]; resolution must be an integer.");
      return;
    }
    const genFilter = fLabelGen.value;
    const subFilter = fLabelSub.value;
    const subIdx    = subFilter === "(any)" ? -1 : LABELS.indexOf(subFilter);

    FILTERED = OBJECTS.filter((o) => {
      if (subIdx >= 0) {
        if (o[1] !== subIdx) return false;
      } else if (genFilter !== "(any)") {
        const lab = LABELS[o[1]];
        if (!lab || generalOf(lab) !== genFilter) return false;
      }
      if (o[2] < psMin || o[2] > psMax) return false;
      if (o[3] < pfMin || o[3] > pfMax) return false;
      if (o[4] < rMin  || o[4] > rMax)  return false;
      return true;
    });
    filterCnt.textContent = "(" + FILTERED.length.toLocaleString() +
                            " match the filters)";
    shuffle();
  }

  function resetFilters() {
    fLabelGen.value = "(any)";
    populateSubDropdown();
    fLabelSub.value = "(any)";
    fPsMin.value = "0.0"; fPsMax.value = "1.0";
    fPfMin.value = "0.0"; fPfMax.value = "1.0";
    fResMin.value = "0";  fResMax.value = "9999";
    applyFilters();
  }

  /* ---- sampling + rendering ---- */
  function shuffle() {
    const valid = FILTERED.filter((o) => o[4] > 0);
    grid.innerHTML = "";
    if (!valid.length) {
      statusText.textContent = "No galaxies match the current filters";
      return;
    }
    const seen = new Set();
    const picks = [];
    while (picks.length < 100 && seen.size < valid.length) {
      const i = Math.floor(Math.random() * valid.length);
      if (seen.has(i)) continue;
      seen.add(i);
      picks.push(valid[i]);
    }

    picks.forEach((o, k) => {
      const cell = document.createElement("div");
      cell.className = "grid-cell";

      const img = document.createElement("img");
      img.src = CFG.GCS_BASE + "/images/" + o[0] + ".png";
      img.alt = o[0];
      img.crossOrigin = "anonymous";
      img.title = "Click to query this galaxy in the main browser";
      img.addEventListener("click", () => {
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
    statusText.textContent =
      "Showing " + picks.length + " random galaxies (out of " +
      valid.length.toLocaleString() + " matching the filters)";
  }

  /* ---- wiring ---- */
  fLabelGen.addEventListener("change", () => populateSubDropdown());
  applyBtn.addEventListener("click", applyFilters);
  resetBtn.addEventListener("click", resetFilters);
  refreshBtn.addEventListener("click", shuffle);
})();
