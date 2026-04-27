/* Galaxy kNN Browser — frontend.
   Static page, fetches data from a GCS bucket configured in config.js.
   No backend.
*/
(function () {
  "use strict";
  const CFG  = window.APP_CONFIG;
  const PAGE = CFG.PAGE;
  const NMAX = CFG.TOTAL_NN;

  /* DOM refs */
  const $ = (id) => document.getElementById(id);
  const idInput   = $("id-input");
  const idList    = $("id-list");
  const filterCnt = $("filter-count");
  const showBtn   = $("show-btn");
  const randomBtn = $("random-btn");
  const aboutBtn  = $("about-btn");
  const fLabelGen = $("f-label-general");
  const fLabelSub = $("f-label-sub");
  const fPsMin    = $("f-ps-min"); const fPsMax = $("f-ps-max");
  const fPfMin    = $("f-pf-min"); const fPfMax = $("f-pf-max");
  const fResMin   = $("f-res-min"); const fResMax = $("f-res-max");
  const applyBtn  = $("apply-btn");
  const resetBtn  = $("reset-btn");
  const nnIndex   = $("nn-index");
  const prevBtn   = $("prev-btn");
  const nextBtn   = $("next-btn");
  const kInput    = $("k-input");
  const exportBtn = $("export-btn");
  const circleBtn = $("circle-btn");
  const savePngBtn= $("savepng-btn");
  const setupLine = $("setup-line");
  const titleQ    = $("title-q");
  const titleN    = $("title-n");
  const imgQ      = $("img-q");
  const imgN      = $("img-n");
  const status    = $("status");
  const aboutOverlay = $("about-overlay");
  const aboutClose   = $("about-close");
  const aboutSub     = $("about-sub");
  const aboutBody    = $("about-body");

  /* State */
  let META          = null;          // parsed meta.json
  let OBJECTS       = [];            // [[id, label_idx, ps, pf, res], ...]
  let ID_TO_IDX     = new Map();     // id -> position in OBJECTS
  let LABELS        = [];
  let FILTERED      = [];            // array of OBJECTS rows
  let PAGE_START    = 0;
  let CURRENT_OID   = null;
  let CURRENT_NN    = null;          // parsed nn/<oid>.json
  let NN_I          = 0;             // 0..99
  let CIRCLE_ON     = true;
  let SIG_CACHE     = new Map();     // id -> 300-d Float32Array
  let LABELS_BY_GEN = {};            // "Sc" -> ["Sc1m", "Sc2m", "Sc(d)", ...]

  /* ---------- bootstrap ---------- */
  setStatus("Loading metadata…");
  fetch(CFG.GCS_BASE + "/meta.json")
    .then((r) => {
      if (!r.ok) throw new Error("meta.json fetch failed: " + r.status);
      return r.json();
    })
    .then((m) => {
      META = m;
      OBJECTS = m.objects;
      LABELS  = m.labels;
      OBJECTS.forEach((o, i) => ID_TO_IDX.set(o[0], i));
      buildLabelDropdown();
      updateSetupLine();
      applyFilters();
      const desc = (
        "Interactive nearest-neighbor browser for the Galaxy Zoo 2 / SDSS image " +
        "cutouts. Pick any galaxy, optionally narrow the query pool by morphology " +
        "label, smooth/featured probabilities, or image resolution, and step " +
        "through its " + NMAX + " nearest neighbors in the " + m.model +
        " signature space.\n\n" +
        "The signature is laid out as four 100-d blocks " +
        "[α·V_mean | β·V_dev | γ·avg_ann_mean | η·avg_ann_dev]. In this model β = " +
        fmtNum(m.params.beta) + ", so the V_dev block is identically zero and the " +
        "effective signature is " + m.signature_dim + "-d."
      );
      aboutBody.textContent = desc;
      aboutSub.textContent =
        "Model: " + m.model + "  ·  sig dim " + m.signature_full_dim +
        " (effective " + m.signature_dim + ")  ·  top-" + NMAX +
        " kNN over " + m.n.toLocaleString() + " galaxies";
      setStatus("Ready. " + m.n.toLocaleString() + " objects loaded.");
      pickRandomQuery();
    })
    .catch((err) => {
      console.error(err);
      setStatus("ERROR loading meta.json: " + err.message +
                " — check GCS_BASE in config.js and the bucket's CORS rules.");
    });

  function setStatus(msg) { status.textContent = msg; }

  // Pretty-print a float that may be a float32→float64 promotion (e.g.
  // 0.019999998807907104 → "0.02"). Uses up to 6 significant digits and
  // trims trailing zeros.
  function fmtNum(x) {
    if (x === null || x === undefined || Number.isNaN(x)) return "?";
    const n = Number(x);
    if (n === 0) return "0";
    if (!Number.isFinite(n)) return String(n);
    const s = n.toPrecision(6);
    return Number.parseFloat(s).toString();
  }

  function updateSetupLine() {
    const p = META.params;
    setupLine.textContent =
      META.model + "  |  sig dim = " + META.signature_full_dim +
      " (effective " + META.signature_dim + ")  |  α=" + fmtNum(p.alpha) +
      "  β=" + fmtNum(p.beta) + "  γ=" + fmtNum(p.gamma) +
      "  η=" + fmtNum(p.eta) + "  W=" + fmtNum(p.W);
  }

  /* ---------- filters / dropdown ---------- */
  // Extract the "general" label from a full label by taking the leading
  // run of letters: "Sc2m" → "Sc", "Sc(d)" → "Sc", "Eb" → "Eb".
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
    const o0 = document.createElement("option");
    o0.value = "(any)"; o0.textContent = "(any)";
    fLabelGen.appendChild(o0);
    generals.forEach((g) => {
      const o = document.createElement("option");
      o.value = g;
      const n = LABELS_BY_GEN[g].length;
      o.textContent = g + (n > 1 ? "  (" + n + ")" : "");
      fLabelGen.appendChild(o);
    });

    populateSubDropdown();
  }

  function populateSubDropdown() {
    const gen = fLabelGen.value;
    fLabelSub.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "(any)"; o0.textContent = "(any)";
    fLabelSub.appendChild(o0);
    const subList = (gen === "(any)") ? LABELS : (LABELS_BY_GEN[gen] || []);
    subList.forEach((s) => {
      const o = document.createElement("option");
      o.value = s; o.textContent = s; fLabelSub.appendChild(o);
    });
    fLabelSub.value = "(any)";
  }

  function fmtRow(o) {
    const lab = LABELS[o[1]] || "?";
    return o[0] + "  —  " + lab + "  Ps=" + o[2].toFixed(2) +
           "  Pf=" + o[3].toFixed(2) + "  res=" + o[4] + "px";
  }

  function applyFilters() {
    const genFilter = fLabelGen.value;
    const subFilter = fLabelSub.value;
    const psMin = parseFloat(fPsMin.value), psMax = parseFloat(fPsMax.value);
    const pfMin = parseFloat(fPfMin.value), pfMax = parseFloat(fPfMax.value);
    const rMin  = parseInt(fResMin.value, 10),  rMax  = parseInt(fResMax.value, 10);
    if ([psMin, psMax, pfMin, pfMax].some(isNaN) || isNaN(rMin) || isNaN(rMax)) {
      alert("Bad filter value. Ps/Pf must be in [0,1]; resolution must be an integer.");
      return;
    }
    const subIdx = subFilter === "(any)" ? -1 : LABELS.indexOf(subFilter);
    FILTERED = OBJECTS.filter((o) => {
      // sub-label wins if specified; otherwise fall back to general prefix
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
    PAGE_START = 0;
    refreshDropdown();
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

  function refreshDropdown() {
    const n = FILTERED.length;
    idList.innerHTML = "";
    if (n === 0) {
      filterCnt.textContent = "(showing 0 of 0)";
      return;
    }
    const end = Math.min(PAGE_START + PAGE, n);
    if (PAGE_START > 0) {
      const o = document.createElement("option");
      o.value = "▲ Previous " + Math.min(PAGE, PAGE_START) +
                "  (" + PAGE_START + " above)";
      idList.appendChild(o);
    }
    for (let i = PAGE_START; i < end; i++) {
      const o = document.createElement("option");
      o.value = fmtRow(FILTERED[i]);
      idList.appendChild(o);
    }
    if (end < n) {
      const o = document.createElement("option");
      o.value = "▼ Next " + Math.min(PAGE, n - end) +
                "  (" + (n - end) + " below)";
      idList.appendChild(o);
    }
    filterCnt.textContent = (n > PAGE)
      ? "(showing " + (PAGE_START + 1) + "–" + end + " of " + n + ")"
      : "(showing all " + n + ")";
  }

  /* When the user picks something from the datalist, peel id or handle paging */
  idInput.addEventListener("input", () => {
    const v = idInput.value;
    if (v.startsWith("▼ Next")) {
      const n = FILTERED.length;
      PAGE_START = Math.min(PAGE_START + PAGE, Math.max(0, n - 1));
      idInput.value = "";
      refreshDropdown();
    } else if (v.startsWith("▲ Previous")) {
      PAGE_START = Math.max(0, PAGE_START - PAGE);
      idInput.value = "";
      refreshDropdown();
    } else if (v.includes("  ")) {
      idInput.value = v.split("  ")[0];
    }
  });

  /* ---------- query / nav ---------- */
  function resolveId() {
    const raw = idInput.value.trim();
    if (!raw) return null;
    const oid = (raw[0] >= "0" && raw[0] <= "9") ? raw.split(/\s+/)[0] : raw;
    return ID_TO_IDX.has(oid) ? oid : null;
  }

  function showQuery() {
    const oid = resolveId();
    if (!oid) { alert("Pick or type an object id first."); return; }
    idInput.value = oid;
    setStatus("Loading neighbors of " + oid + "…");
    fetch(CFG.GCS_BASE + "/nn/" + oid + ".json")
      .then((r) => {
        if (!r.ok) throw new Error("nn fetch failed: " + r.status);
        return r.json();
      })
      .then((nn) => {
        CURRENT_OID = oid;
        CURRENT_NN  = nn;       // [[rank, id, dist, lab_idx, ps, pf, res], ...]
        NN_I = 0;
        renderPair();
        const o = OBJECTS[ID_TO_IDX.get(oid)];
        const lab = LABELS[o[1]] || "?";
        setStatus("Query: " + oid + "  (" + lab + ", Ps=" + o[2].toFixed(2) +
                  ", Pf=" + o[3].toFixed(2) + ")  —  use ← / → to step neighbors");
      })
      .catch((err) => setStatus("ERROR: " + err.message));
  }

  function pickRandomQuery() {
    const valid = OBJECTS.filter((o) => o[4] > 0);
    if (!valid.length) return;
    const o = valid[Math.floor(Math.random() * valid.length)];
    idInput.value = o[0];
    showQuery();
  }

  function stepNeighbor(delta) {
    if (!CURRENT_NN) return;
    const ni = Math.max(0, Math.min(NMAX - 1, NN_I + delta));
    if (ni === NN_I) return;
    NN_I = ni;
    renderPair();
  }

  function renderPair() {
    const oid = CURRENT_OID;
    const qo  = OBJECTS[ID_TO_IDX.get(oid)];
    const qlab = LABELS[qo[1]] || "?";
    titleQ.textContent =
      "QUERY  " + oid + "\n" + qlab + "   Ps=" + qo[2].toFixed(2) +
      "  Pf=" + qo[3].toFixed(2);
    imgQ.src = CFG.GCS_BASE + "/images/" + oid + ".png";

    const r = CURRENT_NN[NN_I];   // [rank, id, dist, lab_idx, ps, pf, res]
    const nid = r[1];
    const nlab = LABELS[r[3]] || "?";
    titleN.textContent =
      "NN" + (NN_I + 1) + "  " + nid + "\n" +
      nlab + "   Ps=" + r[4].toFixed(2) + "  Pf=" + r[5].toFixed(2) +
      "\nd=" + r[2].toFixed(4);
    imgN.src = CFG.GCS_BASE + "/images/" + nid + ".png";
    nnIndex.textContent = "NN" + (NN_I + 1) + " / " + NMAX;
  }

  function toggleCircle() {
    CIRCLE_ON = !CIRCLE_ON;
    document.body.classList.toggle("no-circle", !CIRCLE_ON);
    circleBtn.textContent = "Circle: " + (CIRCLE_ON ? "ON" : "OFF");
  }

  /* ---------- save current pair as PNG ---------- */
  async function saveCurrentPng() {
    if (!CURRENT_OID) { alert("Pick a query first."); return; }
    setStatus("Building PNG…");
    const W = 1600, H = 920;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, W, H);

    // suptitle
    ctx.fillStyle = "#000"; ctx.font = "bold 22px Segoe UI, Helvetica, Arial";
    ctx.textAlign = "center";
    ctx.fillText(setupLine.textContent, W / 2, 36);

    // load both images
    const [qImg, nImg] = await Promise.all([
      loadImg(imgQ.src), loadImg(imgN.src),
    ]);

    drawPanel(ctx, qImg, 60, 80, 700, 700, "#c8102e", titleQ.textContent, true);
    drawPanel(ctx, nImg, 840, 80, 700, 700, "#1f4e79", titleN.textContent, false);

    const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
    const name = "pair_" + CURRENT_OID + "_NN" +
                 (NN_I + 1) + "_" + CURRENT_NN[NN_I][1] + ".png";
    const ok = await saveBlob(blob, name, [{
      description: "PNG image",
      accept: { "image/png": [".png"] },
    }]);
    setStatus(ok ? "PNG saved." : "PNG save cancelled.");
  }

  function loadImg(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
  }

  function drawPanel(ctx, img, x, y, w, h, color, title, bold) {
    ctx.save();
    ctx.fillStyle = "white"; ctx.fillRect(x, y, w, h);
    // image (object-contain)
    const ar = img.width / img.height;
    let dw = w, dh = h;
    if (ar > 1) dh = w / ar; else dw = h * ar;
    const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, dx, dy, dw, dh);
    if (CIRCLE_ON) {
      ctx.strokeStyle = "#1f77ff"; ctx.lineWidth = 2;
      ctx.beginPath();
      const cx = x + w / 2, cy = y + h / 2, rad = Math.min(w, h) / 2 - 2;
      ctx.arc(cx, cy, rad, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.lineWidth = 5; ctx.strokeStyle = color;
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    ctx.restore();
    // title under panel
    ctx.fillStyle = "#000";
    ctx.font = (bold ? "bold " : "") + "16px Segoe UI, Helvetica, Arial";
    ctx.textAlign = "center";
    const lines = title.split("\n");
    lines.forEach((ln, i) => ctx.fillText(ln, x + w / 2, y + h + 24 + i * 22));
  }

  /* ---------- export JSON ---------- */
  async function exportNeighbors() {
    if (!CURRENT_OID) { alert("Pick a query first."); return; }
    const k = parseInt(kInput.value, 10);
    if (!(k >= 1 && k <= NMAX)) {
      alert("K must be between 1 and " + NMAX); return;
    }
    setStatus("Fetching " + (k + 1) + " signature vectors…");
    const ids = [CURRENT_OID].concat(CURRENT_NN.slice(0, k).map((r) => r[1]));
    let sigs;
    try {
      sigs = await Promise.all(ids.map(getSignature));
    } catch (err) {
      const msg = "ERROR fetching signatures: " + err.message +
                  " (have all sig/*.json files finished uploading?)";
      console.error(err);
      setStatus(msg);
      alert(msg);
      return;
    }
    const qsig = sigs[0];
    const layout = []; let cursor = 0;
    [["V_mean", 100, META.params.alpha],
     ["V_dev",  100, META.params.beta],
     ["avg_ann_mean", 100, META.params.gamma],
     ["avg_ann_dev",  100, META.params.eta]].forEach(([nm, len, c]) => {
      if (c !== 0) {
        layout.push({ name: nm, from: cursor, to: cursor + len, coef: c });
        cursor += len;
      }
    });
    const dropped = [["V_mean", 100, META.params.alpha],
                     ["V_dev",  100, META.params.beta],
                     ["avg_ann_mean", 100, META.params.gamma],
                     ["avg_ann_dev",  100, META.params.eta]]
      .filter(([_, __, c]) => c === 0)
      .map(([nm], i) => ({ name: nm, coef: 0.0 }));

    const qm = OBJECTS[ID_TO_IDX.get(CURRENT_OID)];
    const cleanParams = {
      alpha: Number(fmtNum(META.params.alpha)),
      beta:  Number(fmtNum(META.params.beta)),
      gamma: Number(fmtNum(META.params.gamma)),
      eta:   Number(fmtNum(META.params.eta)),
      W:     Number(fmtNum(META.params.W)),
    };
    const payload = {
      model: META.model,
      params: cleanParams,
      signature_full_dim: META.signature_full_dim,
      signature_dim: META.signature_dim,
      signature_layout: layout,
      signature_dropped_blocks: dropped,
      signature_note:
        "Zero-coefficient blocks were dropped from the exported vectors. " +
        "Constant-zero columns add 0 to every pairwise Euclidean distance, " +
        "so trimming has no effect on the kNN ranking.",
      query_id: CURRENT_OID,
      query_meta: {
        label: LABELS[qm[1]] || "?",
        p_smooth: qm[2], p_featured: qm[3], resolution: qm[4],
      },
      query_signature: qsig,
      k: k,
      neighbors: CURRENT_NN.slice(0, k).map((r, i) => ({
        rank: r[0], id: r[1], distance: r[2],
        label: LABELS[r[3]] || "?", p_smooth: r[4], p_featured: r[5],
        resolution: r[6], signature: sigs[i + 1],
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)],
                          { type: "application/json" });
    const name = "neighbors_" + CURRENT_OID + "_top" + k + ".json";
    const ok = await saveBlob(blob, name, [{
      description: "JSON file",
      accept: { "application/json": [".json"] },
    }]);
    setStatus(ok
      ? "JSON saved — " + k + " neighbors, " + META.signature_dim + "-d signatures."
      : "JSON save cancelled.");
  }

  function getSignature(oid) {
    if (SIG_CACHE.has(oid)) return Promise.resolve(SIG_CACHE.get(oid));
    return fetch(CFG.GCS_BASE + "/sig/" + oid + ".json")
      .then((r) => {
        if (!r.ok) throw new Error("sig/" + oid + ".json: HTTP " + r.status);
        return r.json();
      })
      .then((v) => { SIG_CACHE.set(oid, v); return v; });
  }

  /* Save a Blob, asking the user where to put it when the browser
     supports the File System Access API (Chrome/Edge/Opera). Otherwise
     falls back to a normal anchor-download (file lands in Downloads/). */
  async function saveBlob(blob, suggestedName, types) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types,
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (e) {
        if (e && e.name === "AbortError") return false;
        console.warn("showSaveFilePicker failed, using fallback:", e);
        // fall through to anchor-download
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    return true;
  }

  /* ---------- About modal ---------- */
  function openAbout() { aboutOverlay.classList.remove("hidden"); }
  function closeAbout() { aboutOverlay.classList.add("hidden"); }

  /* ---------- wiring ---------- */
  fLabelGen.addEventListener("change", () => populateSubDropdown());
  showBtn.addEventListener("click", showQuery);
  randomBtn.addEventListener("click", pickRandomQuery);
  applyBtn.addEventListener("click", applyFilters);
  resetBtn.addEventListener("click", resetFilters);
  prevBtn.addEventListener("click", () => stepNeighbor(-1));
  nextBtn.addEventListener("click", () => stepNeighbor(+1));
  circleBtn.addEventListener("click", toggleCircle);
  savePngBtn.addEventListener("click", saveCurrentPng);
  exportBtn.addEventListener("click", exportNeighbors);
  aboutBtn.addEventListener("click", openAbout);
  aboutClose.addEventListener("click", closeAbout);
  aboutOverlay.addEventListener("click", (e) => {
    if (e.target === aboutOverlay) closeAbout();
  });
  idInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); showQuery(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowLeft")  { e.preventDefault(); stepNeighbor(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); stepNeighbor(+1); }
  });
})();
