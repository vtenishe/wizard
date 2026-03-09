/*
=====================================================================
FILE: js/18-lonlat-viewer.js
PROJECT: AMPS CCMC Submission Interface v3 — Visualization Layer
PURPOSE: Lon/Lat structured-grid map viewer using Plotly.js.

  Parses Tecplot ASCII files (VARIABLES, ZONE I=, J=, F=POINT),
  renders heatmaps or contour-fill maps via Plotly, including:
    - Interactive zoom / pan / box-select / probe
    - Heatmap or contour-fill plot styles
    - Sharp (cell) or smooth (interpolated) rendering
    - Configurable colormaps with reversal
    - Adjustable color min / max with auto range
    - High-resolution continent outlines (TopoJSON world-atlas CDN)
    - Configurable continent line color and width
    - Longitude 0–360 or ±180 handling
    - Full hover readout (lon, lat, value)
    - PNG download via Plotly

  Requires Plotly.js loaded from CDN (see index.html <script> tag).
  Coastlines fetched once from cdn.jsdelivr.net/npm/world-atlas@2.

  Core rendering and coastline logic extracted from
  tecplot_lonlat_viewer_colorbar_scale_options_v2.html (user-provided).

PUBLIC API
  initLonLatViewer()            — wire controls + events
  loadTecplotFile(file)         — parse a File → render
  loadTecplotText(text, name)   — parse text string → render
  renderLonLatMap()             — redraw from current dataset

DEPENDS ON: Plotly.js (CDN), 01-state.js ($ helper, optional)
LAST UPDATED: 2026-03-07
=====================================================================
*/

const LLMAP = {};

LLMAP.dataset = null;
LLMAP.currentZoneIndex = 0;
LLMAP._coastlineTraces = null;
LLMAP._coastlineAttempted = false;


/* ═══════════════════════════════════════════════════════════════════
   §1  TECPLOT ASCII PARSER
   ═══════════════════════════════════════════════════════════════════ */

LLMAP.parseTecplot = function(text) {
  const lines = text.split(/\r?\n/);
  let titleLine = null;
  let varLine = null;
  let currentZone = null;
  const zones = [];

  /*
   * Multi-zone Tecplot parser.
   *
   * Previous behavior kept only the last encountered ZONE line and then
   * collected every following data row into a single dataset. That worked
   * for one-zone files, but it made structured-grid shell stacks or other
   * multi-zone lon/lat products impossible to browse.
   *
   * New behavior:
   *   - parse a single VARIABLES definition shared by all zones
   *   - create one zone object per ZONE block
   *   - preserve the zone title (ZONE T="...") for UI display
   *   - validate I×J and point count for each zone independently
   */
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^[#!]/.test(line)) continue;

    if (/^title/i.test(line)) {
      titleLine = raw;
      continue;
    }

    if (/^variables/i.test(line)) {
      varLine = raw;
      continue;
    }

    if (/^zone/i.test(line)) {
      if (!varLine) throw new Error('VARIABLES line must appear before ZONE blocks.');

      const mi = raw.match(/I\s*=\s*(\d+)/i);
      const mj = raw.match(/J\s*=\s*(\d+)/i);
      const mt = raw.match(/T\s*=\s*"([^"]*)"/i);
      const I = mi ? parseInt(mi[1], 10) : 0;
      const J = mj ? parseInt(mj[1], 10) : 0;
      if (!I || !J) throw new Error('Each ZONE must provide I and J dimensions.');

      currentZone = {
        title: mt ? mt[1] : 'Zone ' + (zones.length + 1),
        rawZoneLine: raw,
        I: I,
        J: J,
        rows: []
      };
      zones.push(currentZone);
      continue;
    }

    if (!currentZone) continue;

    const vals = line.split(/[\s,]+/).filter(Boolean).map(Number);
    if (vals.length !== 0) currentZone.rows.push(vals);
  }

  if (!varLine) throw new Error('VARIABLES line not found.');
  if (zones.length === 0) throw new Error('ZONE line not found.');

  let fieldNames = [...varLine.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  if (fieldNames.length === 0) {
    fieldNames = varLine.replace(/^variables\s*=?\s*/i, '').split(/[\s,]+/).filter(Boolean);
  }
  if (fieldNames.length === 0) throw new Error('No variable names found.');

  for (const zone of zones) {
    const rows = [];
    for (const vals of zone.rows) {
      if (vals.length !== fieldNames.length) continue;
      const row = {};
      for (let i = 0; i < fieldNames.length; i++) row[fieldNames[i]] = vals[i];
      rows.push(row);
    }
    if (rows.length !== zone.I * zone.J) {
      throw new Error(`Zone "${zone.title}": expected ${zone.I * zone.J} points (I×J=${zone.I}×${zone.J}), got ${rows.length}.`);
    }
    zone.rows = rows;
  }

  const globalTitleMatch = titleLine ? titleLine.match(/TITLE\s*=\s*"([^"]*)"/i) : null;
  return {
    title: globalTitleMatch ? globalTitleMatch[1] : '',
    fieldNames,
    zones
  };
};


/* ═══════════════════════════════════════════════════════════════════
   §2  GRID BUILDER
   ═══════════════════════════════════════════════════════════════════ */

LLMAP._findField = function(names, patterns) {
  for (const p of patterns) {
    const f = names.find(n => p.test(n));
    if (f) return f;
  }
  return null;
};

LLMAP.buildGrid = function(zone, field, lonMode) {
  const lonField = LLMAP._findField(LLMAP.dataset.fieldNames, [/^lon/i, /longitude/i, /^phi/i]) || LLMAP.dataset.fieldNames[0];
  const latField = LLMAP._findField(LLMAP.dataset.fieldNames, [/^lat/i, /latitude/i, /^theta/i]) || LLMAP.dataset.fieldNames[1];

  const lonRow0 = [];
  for (let i = 0; i < zone.I; i++) lonRow0.push(zone.rows[i][lonField]);
  const latCol0 = [];
  for (let j = 0; j < zone.J; j++) latCol0.push(zone.rows[j * zone.I][latField]);

  let lons = lonRow0.slice();
  let lats = latCol0.slice();

  if (lonMode === 'pm180') {
    lons = lons.map(function(v) { let x = v; while (x > 180) x -= 360; while (x <= -180) x += 360; return x; });
    const order = lons.map(function(v, idx) { return { v: v, idx: idx }; }).sort(function(a, b) { return a.v - b.v; });
    const sortedLons = order.map(function(o) { return o.v; });
    const z = [];
    for (let j = 0; j < zone.J; j++) {
      const row = [];
      for (let k = 0; k < order.length; k++) row.push(zone.rows[j * zone.I + order[k].idx][field]);
      z.push(row);
    }
    return { lons: sortedLons, lats: lats, z: z };
  }

  const z = [];
  for (let j = 0; j < zone.J; j++) {
    const row = [];
    for (let i = 0; i < zone.I; i++) row.push(zone.rows[j * zone.I + i][field]);
    z.push(row);
  }
  return { lons: lons, lats: lats, z: z };
};

LLMAP.maybeTranspose = function(x, y, z) {
  var looksNormal = (z.length === y.length) && (z[0] && z[0].length === x.length);
  if (looksNormal) return { x: x, y: y, z: z };
  var zt = z[0].map(function(_, ci) { return z.map(function(row) { return row[ci]; }); });
  return { x: y, y: x, z: zt };
};


/* ═══════════════════════════════════════════════════════════════════
   §3  COASTLINE LOADING  (TopoJSON world-atlas via CDN)
   ═══════════════════════════════════════════════════════════════════ */

function _wrapLon180(v) { var x = v; while (x > 180) x -= 360; while (x <= -180) x += 360; return x; }
function _wrapLon360(v) { var x = v % 360; if (x < 0) x += 360; return x; }

LLMAP.getCoastlines = async function() {
  if (LLMAP._coastlineTraces !== null) return LLMAP._coastlineTraces;
  if (LLMAP._coastlineAttempted) return [];
  LLMAP._coastlineAttempted = true;

  var url = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
  try {
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var topo = await resp.json();

    var scale     = (topo.transform && topo.transform.scale)     || [1, 1];
    var translate = (topo.transform && topo.transform.translate)  || [0, 0];

    function decodeArc(arc) {
      var x = 0, y = 0, pts = [];
      for (var k = 0; k < arc.length; k++) {
        x += arc[k][0]; y += arc[k][1];
        pts.push([x * scale[0] + translate[0], y * scale[1] + translate[1]]);
      }
      return pts;
    }

    var arcs = topo.arcs.map(decodeArc);

    function arcByIndex(i) {
      if (i >= 0) return arcs[i];
      return arcs[~i].slice().reverse();
    }

    function stitch(indices) {
      var pts = [];
      for (var idx = 0; idx < indices.length; idx++) {
        var seg = arcByIndex(indices[idx]);
        if (idx === 0) { for (var s = 0; s < seg.length; s++) pts.push(seg[s]); }
        else           { for (var s = 1; s < seg.length; s++) pts.push(seg[s]); }
      }
      return pts;
    }

    function objectToRings(obj) {
      var out = [];
      if (obj.type === 'Polygon') {
        for (var r = 0; r < obj.arcs.length; r++) out.push(stitch(obj.arcs[r]));
      } else if (obj.type === 'MultiPolygon') {
        for (var p = 0; p < obj.arcs.length; p++)
          for (var r = 0; r < obj.arcs[p].length; r++) out.push(stitch(obj.arcs[p][r]));
      } else if (obj.type === 'GeometryCollection') {
        for (var g = 0; g < obj.geometries.length; g++)
          out = out.concat(objectToRings(obj.geometries[g]));
      }
      return out;
    }

    var rings = objectToRings(topo.objects.countries);
    LLMAP._coastlineTraces = rings.map(function(ring) {
      return { rawLon: ring.map(function(p) { return p[0]; }),
               rawLat: ring.map(function(p) { return p[1]; }) };
    });
    return LLMAP._coastlineTraces;
  } catch (err) {
    console.warn('[lonlat-viewer] Could not load coastlines:', err);
    LLMAP._coastlineTraces = [];
    return [];
  }
};

LLMAP.makeCoastTrace = function(raw, usePm180, lineColor, lineWidth) {
  var x = [], y = [];
  var convert = usePm180 ? _wrapLon180 : _wrapLon360;
  var splitThreshold = usePm180 ? 180 : 300;

  for (var i = 0; i < raw.rawLon.length; i++) {
    var lon = convert(raw.rawLon[i]);
    var lat = raw.rawLat[i];
    if (i > 0 && x.length && x[x.length - 1] !== null) {
      if (Math.abs(lon - x[x.length - 1]) > splitThreshold) {
        x.push(null); y.push(null);
      }
    }
    x.push(lon); y.push(lat);
  }

  return {
    type: 'scatter', mode: 'lines',
    x: x, y: y,
    hoverinfo: 'skip', showlegend: false,
    line: { color: lineColor, width: Math.max(0.3, Number(lineWidth) || 1.0) }
  };
};


/* ═══════════════════════════════════════════════════════════════════
   §4  MAIN RENDER  (Plotly.newPlot)
   ═══════════════════════════════════════════════════════════════════ */

async function renderLonLatMap() {
  var ds = LLMAP.dataset;
  if (!ds || !ds.zones || !ds.zones.length) return;
  if (typeof Plotly === 'undefined') { console.error('Plotly not loaded'); return; }

  /* Read controls */
  var zoneIdx = Math.max(0, Math.min(_llZoneIndex(), ds.zones.length - 1));
  var zone    = ds.zones[zoneIdx];
  var field   = _llVal('llmap-field')   || ds.fieldNames.find(function(f) { return !/^lon|^lat/i.test(f); });
  var cmap    = _llVal('llmap-cmap')    || 'Turbo';
  var lonMode = _llVal('llmap-lonmode') || 'as-is';
  var pStyle  = _llVal('llmap-style')   || 'heatmap';
  var reverse = _llChk('llmap-reverse');
  var smooth  = _llChk('llmap-smooth');
  var showC   = _llChk('llmap-coast');
  var cColor  = _llVal('llmap-coast-color') || '#444444';
  var cWidth  = parseFloat(_llVal('llmap-coast-width')) || 1.0;
  var zminStr = _llVal('llmap-zmin');
  var zmaxStr = _llVal('llmap-zmax');
  var lockSc  = _llChk('llmap-lock-scale');
  if (!field) return;

  /* Build grid */
  var grid  = LLMAP.buildGrid(zone, field, lonMode);
  var fixed = LLMAP.maybeTranspose(grid.lons, grid.lats, grid.z);

  var colorscale = cmap;
  if (reverse) colorscale += '_r';

  var zmin = (zminStr.trim() !== '') ? Number(zminStr) : undefined;
  var zmax = (zmaxStr.trim() !== '') ? Number(zmaxStr) : undefined;
  var isContour = (pStyle === 'contour');

  /* Main trace */
  var trace = {
    type:       isContour ? 'contour' : 'heatmap',
    x:          fixed.x,
    y:          fixed.y,
    z:          fixed.z,
    colorscale: colorscale,
    zmin:       Number.isFinite(zmin) ? zmin : undefined,
    zmax:       Number.isFinite(zmax) ? zmax : undefined,
    colorbar: {
      title: { text: field, side: 'top', font: { color: '#38c0ff', size: 11 } },
      orientation: 'v',
      x: 1.02, xanchor: 'left',
      y: 0.5,  yanchor: 'middle',
      len: 0.9, thickness: 18,
      tickfont: { color: '#8899aa', size: 10, family: 'IBM Plex Mono, monospace' }
    },
    hovertemplate: 'lon=%{x:.1f}°<br>lat=%{y:.1f}°<br>' + field + '=%{z:.6g}<extra></extra>'
  };

  if (!isContour) {
    trace.zsmooth = smooth ? 'best' : false;
  } else {
    trace.contours = {
      coloring: 'heatmap',
      showlines: !smooth,
      start: Number.isFinite(zmin) ? zmin : undefined,
      end:   Number.isFinite(zmax) ? zmax : undefined
    };
    trace.line = { width: smooth ? 0 : 0.8 };
    trace.smoothing = smooth ? 1.0 : 0;
  }

  var traces = [trace];

  /* Coastlines */
  var usePm180 = (lonMode === 'pm180');
  if (showC) {
    var coastData = await LLMAP.getCoastlines();
    for (var c = 0; c < coastData.length; c++) {
      traces.push(LLMAP.makeCoastTrace(coastData[c], usePm180, cColor, cWidth));
    }
  }

  var xMin = Math.min.apply(null, fixed.x);
  var xMax = Math.max.apply(null, fixed.x);
  var yMin = Math.min.apply(null, fixed.y);
  var yMax = Math.max.apply(null, fixed.y);

  /* Layout — dark theme matching AMPS dashboard */
  var layout = {
    title: { text: field + ' map — ' + zone.title, font: { color: '#38c0ff', size: 14, family: 'IBM Plex Sans, sans-serif' } },
    margin: { l: 60, r: 80, t: 45, b: 55 },
    paper_bgcolor: '#070e1c',
    plot_bgcolor:  '#0d1a2e',
    font: { color: '#8899aa', family: 'IBM Plex Mono, monospace', size: 10 },
    xaxis: {
      title: { text: 'Longitude (deg)', font: { color: '#b0b8c8', size: 12 } },
      zeroline: false, showgrid: true,
      gridcolor: 'rgba(255,255,255,0.07)',
      range: [xMin, xMax],
      color: '#8899aa',
      tickfont: { size: 10 }
    },
    yaxis: {
      title: { text: 'Latitude (deg)', font: { color: '#b0b8c8', size: 12 } },
      zeroline: false, showgrid: true,
      gridcolor: 'rgba(255,255,255,0.07)',
      range: [yMin, yMax],
      color: '#8899aa',
      tickfont: { size: 10 }
    }
  };

  if (lockSc) {
    layout.yaxis.scaleanchor = 'x';
    layout.yaxis.scaleratio = 1;
    layout.yaxis.constrain = 'range';
    layout.xaxis.constrain = 'range';
  }

  var plotDiv = document.getElementById('llmap-plot');
  if (!plotDiv) return;

  Plotly.newPlot(plotDiv, traces, layout, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  });
}


/* ═══════════════════════════════════════════════════════════════════
   §5  CONTROL HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function _llVal(id) { var e = document.getElementById(id); return e ? e.value : ''; }
function _llChk(id) { var e = document.getElementById(id); return e ? e.checked : false; }
function _llZoneIndex() {
  var e = document.getElementById('llmap-zone');
  var v = e ? parseInt(e.value, 10) : 0;
  return Number.isFinite(v) ? v : 0;
}

LLMAP.updateZoneInfo = function() {
  var ds = LLMAP.dataset;
  var info = document.getElementById('llmap-zone-info');
  if (!info) return;
  if (!ds || !ds.zones || !ds.zones.length) {
    info.textContent = '';
    return;
  }
  var zoneIdx = Math.max(0, Math.min(_llZoneIndex(), ds.zones.length - 1));
  var zone = ds.zones[zoneIdx];
  info.textContent = 'Zone ' + (zoneIdx + 1) + ' of ' + ds.zones.length + ' · ' + zone.title + ' · Grid ' + zone.I + '×' + zone.J;
};


/* ═══════════════════════════════════════════════════════════════════
   §6  INIT + EVENT WIRING
   ═══════════════════════════════════════════════════════════════════ */

function initLonLatViewer() {
  var ids = [
    'llmap-zone','llmap-field','llmap-cmap','llmap-lonmode','llmap-style',
    'llmap-reverse','llmap-smooth','llmap-coast',
    'llmap-coast-color','llmap-coast-width',
    'llmap-zmin','llmap-zmax','llmap-lock-scale'
  ];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function() { if (LLMAP.dataset) { LLMAP.updateZoneInfo(); renderLonLatMap(); } });
  });

  var fileInput = document.getElementById('llmap-file');
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      if (e.target.files[0]) loadTecplotFile(e.target.files[0]);
    });
  }

  var dlBtn = document.getElementById('llmap-download-png');
  if (dlBtn) {
    dlBtn.addEventListener('click', function() {
      if (typeof Plotly !== 'undefined') {
        Plotly.downloadImage('llmap-plot', {
          format: 'png', filename: 'amps_lonlat_map',
          width: 1400, height: 800, scale: 2
        });
      }
    });
  }
}

function loadTecplotFile(file) {
  var status = document.getElementById('llmap-status');
  file.text().then(function(text) { loadTecplotText(text, file.name); })
    .catch(function(err) { if (status) { status.textContent = 'Error: ' + err.message; status.style.color = '#ff5a5a'; } });
}

function loadTecplotText(text, name) {
  var status   = document.getElementById('llmap-status');
  var fieldSel = document.getElementById('llmap-field');
  var zoneSel  = document.getElementById('llmap-zone');
  try {
    LLMAP.dataset = LLMAP.parseTecplot(text);
    LLMAP.currentZoneIndex = 0;
    var ds = LLMAP.dataset;

    if (zoneSel) {
      zoneSel.innerHTML = '';
      ds.zones.forEach(function(z, idx) {
        var opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = (idx + 1) + ': ' + z.title;
        zoneSel.appendChild(opt);
      });
      zoneSel.value = '0';
      zoneSel.disabled = (ds.zones.length <= 1);
    }

    if (fieldSel) {
      fieldSel.innerHTML = '';
      ds.fieldNames.filter(function(f) { return !/^lon|^lat/i.test(f); }).forEach(function(f) {
        var opt = document.createElement('option');
        opt.value = f; opt.textContent = f;
        fieldSel.appendChild(opt);
      });
    }

    if (status) {
      var firstZone = ds.zones[0];
      status.textContent = 'Loaded: ' + (name || 'file') + ' · ' + ds.zones.length + ' zone(s)' +
        ' · First grid: ' + firstZone.I + '×' + firstZone.J +
        ' · Vars: ' + ds.fieldNames.join(', ');
      status.style.color = '#2dd4a0';
    }

    LLMAP.updateZoneInfo();
    renderLonLatMap();
  } catch (err) {
    if (status) { status.textContent = 'Parse error: ' + err.message; status.style.color = '#ff5a5a'; }
    console.error('[lonlat-viewer]', err);
  }
}
