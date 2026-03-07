/*
=====================================================================
FILE: js/19-trajectory-viewer.js
PROJECT: AMPS CCMC Submission Interface v3 — Visualization Layer
PURPOSE: Spacecraft trajectory viewer using Plotly.js.

  Two coordinated panels:
    A) Ground-track map: trajectory on lon/lat with continent outlines
       and color-coded by a selectable variable.
    B) Time-series plot: one variable vs time, linear or log scale,
       with threshold exceedance highlighting and hover probe.

  Parses Tecplot-style trajectory files with quoted ISO timestamps.

PUBLIC API
  initTrajectoryViewer()        — wire controls + events
  loadTrajectoryFile(file)      — parse File → render
  loadTrajectoryText(text,name) — parse text → render
  renderTrajectory()            — redraw both panels

DEPENDS ON: Plotly.js (CDN), 18-lonlat-viewer.js (LLMAP coastlines)
LAST UPDATED: 2026-03-07
=====================================================================
*/

var TRAJ = {};
TRAJ.dataset = null;


/* ═══════════════════════════════════════════════════════════════════
   §1  PARSER — Tecplot trajectory with quoted timestamps
   ═══════════════════════════════════════════════════════════════════ */

TRAJ.parse = function(text) {
  var lines = text.split(/\r?\n/);
  var varLine = null, zoneLine = null, titleLine = null;
  var dataLines = [];

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].trim();
    if (!line || /^[#!]/.test(line)) continue;
    if (/^title/i.test(line))     { titleLine = line; continue; }
    if (/^variables/i.test(line)) { varLine = lines[li]; continue; }
    if (/^zone/i.test(line))      { zoneLine = lines[li]; continue; }
    if (varLine && zoneLine) dataLines.push(lines[li]);
  }

  if (!varLine) throw new Error('VARIABLES line not found.');

  /* Parse variable names */
  var fieldNames = [];
  var matches = varLine.matchAll(/\"([^\"]+)\"/g);
  for (var m of matches) fieldNames.push(m[1]);
  if (fieldNames.length === 0) {
    fieldNames = varLine.replace(/^variables\s*=?\s*/i, '').split(/[\s,]+/).filter(Boolean);
  }

  /* Parse zone I */
  var Nexpected = 0;
  if (zoneLine) {
    var mi = zoneLine.match(/I\s*=\s*(\d+)/i);
    if (mi) Nexpected = parseInt(mi[1], 10);
  }

  /* Parse data — handle quoted time strings */
  var rows = [];
  var timeIdx = -1;
  for (var i = 0; i < fieldNames.length; i++) {
    if (/time|utc|date/i.test(fieldNames[i])) { timeIdx = i; break; }
  }

  for (var di = 0; di < dataLines.length; di++) {
    var raw = dataLines[di].trim();
    if (!raw) continue;

    var vals = [];
    var remaining = raw;

    /* Extract fields one at a time, handling quoted strings */
    for (var fi = 0; fi < fieldNames.length; fi++) {
      remaining = remaining.replace(/^\s+/, '');
      if (remaining.charAt(0) === '"') {
        var endQ = remaining.indexOf('"', 1);
        if (endQ < 0) endQ = remaining.length;
        vals.push(remaining.substring(1, endQ));
        remaining = remaining.substring(endQ + 1);
      } else {
        var spaceIdx = remaining.search(/\s/);
        if (spaceIdx < 0) spaceIdx = remaining.length;
        vals.push(remaining.substring(0, spaceIdx));
        remaining = remaining.substring(spaceIdx);
      }
    }

    if (vals.length !== fieldNames.length) continue;

    var row = {};
    for (var fi = 0; fi < fieldNames.length; fi++) {
      if (fi === timeIdx) {
        row[fieldNames[fi]] = vals[fi];
      } else {
        row[fieldNames[fi]] = parseFloat(vals[fi]);
      }
    }
    rows.push(row);
  }

  if (Nexpected > 0 && rows.length !== Nexpected) {
    console.warn('[traj] Expected ' + Nexpected + ' points, parsed ' + rows.length);
  }

  /* Extract title */
  var title = '';
  if (titleLine) {
    var tm = titleLine.match(/\"([^\"]+)\"/);
    if (tm) title = tm[1];
  }

  return { fieldNames: fieldNames, rows: rows, timeField: timeIdx >= 0 ? fieldNames[timeIdx] : null, title: title };
};


/* ═══════════════════════════════════════════════════════════════════
   §2  HELPERS
   ═══════════════════════════════════════════════════════════════════ */

TRAJ._findField = function(names, patterns) {
  for (var p = 0; p < patterns.length; p++) {
    var f = names.find(function(n) { return patterns[p].test(n); });
    if (f) return f;
  }
  return null;
};

/** Get array of values for a field */
TRAJ._col = function(ds, field) {
  return ds.rows.map(function(r) { return r[field]; });
};

/** Format ISO time string for display: "Feb 10 14:00" */
TRAJ._shortTime = function(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ' ' +
    String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0');
};

/** Pick ~N nicely spaced tick indices from an array of length L */
TRAJ._tickIndices = function(L, N) {
  if (L <= N) {
    var all = [];
    for (var i = 0; i < L; i++) all.push(i);
    return all;
  }
  var step = (L - 1) / (N - 1);
  var indices = [];
  for (var k = 0; k < N; k++) indices.push(Math.round(k * step));
  return indices;
};


/* ═══════════════════════════════════════════════════════════════════
   §3  RENDER — GROUND TRACK MAP
   ═══════════════════════════════════════════════════════════════════ */

TRAJ._renderMap = async function() {
  var ds = TRAJ.dataset;
  if (!ds) return;
  var plotDiv = document.getElementById('traj-map-plot');
  if (!plotDiv) return;

  var colorField = _trVal('traj-map-color') || 'Rc_GV';
  var lonField = TRAJ._findField(ds.fieldNames, [/^lon/i]) || ds.fieldNames[1];
  var latField = TRAJ._findField(ds.fieldNames, [/^lat/i]) || ds.fieldNames[2];
  var timeField = ds.timeField;

  var lons = TRAJ._col(ds, lonField);
  var lats = TRAJ._col(ds, latField);
  var colors = TRAJ._col(ds, colorField);
  var times = timeField ? TRAJ._col(ds, timeField) : lons.map(function(_,i) { return 'pt ' + i; });

  /* Hover text */
  var hoverTexts = [];
  for (var i = 0; i < lons.length; i++) {
    hoverTexts.push(
      (timeField ? TRAJ._shortTime(times[i]) : '') +
      '<br>lon=' + lons[i].toFixed(1) + '°  lat=' + lats[i].toFixed(1) + '°' +
      '<br>' + colorField + '=' + (typeof colors[i] === 'number' ? colors[i].toPrecision(4) : colors[i])
    );
  }

  var traces = [];

  /* Trajectory line (gray, behind markers) */
  traces.push({
    type: 'scatter', mode: 'lines',
    x: lons, y: lats,
    hoverinfo: 'skip', showlegend: false,
    line: { color: 'rgba(255,255,255,0.15)', width: 1.5 }
  });

  /* Trajectory markers colored by variable */
  traces.push({
    type: 'scatter', mode: 'markers',
    x: lons, y: lats,
    marker: {
      size: 8, color: colors,
      colorscale: 'Turbo', showscale: true,
      colorbar: {
        title: { text: colorField, side: 'top', font: { color: '#38c0ff', size: 10 } },
        thickness: 16, len: 0.85,
        tickfont: { color: '#8899aa', size: 9, family: 'IBM Plex Mono, monospace' }
      },
      line: { color: 'rgba(255,255,255,0.3)', width: 0.5 }
    },
    text: hoverTexts,
    hoverinfo: 'text',
    showlegend: false
  });

  /* Start / end markers */
  traces.push({
    type: 'scatter', mode: 'markers+text',
    x: [lons[0]], y: [lats[0]],
    marker: { size: 12, color: '#2dd4a0', symbol: 'diamond', line: { color: '#fff', width: 1 } },
    text: ['START'], textposition: 'top center',
    textfont: { color: '#2dd4a0', size: 9 },
    hoverinfo: 'skip', showlegend: false
  });
  traces.push({
    type: 'scatter', mode: 'markers+text',
    x: [lons[lons.length-1]], y: [lats[lats.length-1]],
    marker: { size: 12, color: '#ff5a5a', symbol: 'square', line: { color: '#fff', width: 1 } },
    text: ['END'], textposition: 'top center',
    textfont: { color: '#ff5a5a', size: 9 },
    hoverinfo: 'skip', showlegend: false
  });

  /* Coastlines */
  if (typeof LLMAP !== 'undefined' && LLMAP.getCoastlines) {
    var coastData = await LLMAP.getCoastlines();
    var usePm180 = (Math.min.apply(null, lons) < 0);
    for (var c = 0; c < coastData.length; c++) {
      traces.push(LLMAP.makeCoastTrace(coastData[c], usePm180, '#555555', 0.7));
    }
  }

  var layout = {
    title: { text: 'Ground Track — colored by ' + colorField, font: { color: '#38c0ff', size: 13, family: 'IBM Plex Sans, sans-serif' } },
    margin: { l: 55, r: 75, t: 40, b: 50 },
    paper_bgcolor: '#070e1c',
    plot_bgcolor: '#0d1a2e',
    font: { color: '#8899aa', family: 'IBM Plex Mono, monospace', size: 10 },
    xaxis: {
      title: { text: 'Longitude (deg)', font: { color: '#b0b8c8', size: 11 } },
      zeroline: false, showgrid: true, gridcolor: 'rgba(255,255,255,0.06)',
      color: '#8899aa', tickfont: { size: 9 }
    },
    yaxis: {
      title: { text: 'Latitude (deg)', font: { color: '#b0b8c8', size: 11 } },
      zeroline: false, showgrid: true, gridcolor: 'rgba(255,255,255,0.06)',
      color: '#8899aa', tickfont: { size: 9 },
      scaleanchor: 'x', scaleratio: 1, constrain: 'range'
    }
  };

  Plotly.newPlot(plotDiv, traces, layout, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] });
};


/* ═══════════════════════════════════════════════════════════════════
   §4  RENDER — TIME SERIES WITH THRESHOLD EXCEEDANCE
   ═══════════════════════════════════════════════════════════════════ */

TRAJ._renderTimeSeries = function() {
  var ds = TRAJ.dataset;
  if (!ds) return;
  var plotDiv = document.getElementById('traj-ts-plot');
  if (!plotDiv) return;

  var varField  = _trVal('traj-ts-var') || ds.fieldNames[4];
  var scaleType = _trVal('traj-ts-scale') || 'linear';
  var thrStr    = _trVal('traj-thr-val');
  var thrVal    = (thrStr.trim() !== '') ? parseFloat(thrStr) : null;
  var thrDir    = _trVal('traj-thr-dir') || 'above';
  var timeField = ds.timeField;

  /** Test whether a value triggers the threshold */
  var thrTest = (thrDir === 'below')
    ? function(v) { return v <= thrVal; }
    : function(v) { return v >= thrVal; };
  var thrLabel = (thrDir === 'below') ? 'Below threshold' : 'Above threshold';
  var thrWord  = (thrDir === 'below') ? 'BELOW' : 'ABOVE';

  var yVals = TRAJ._col(ds, varField);
  var times = timeField ? TRAJ._col(ds, timeField) : yVals.map(function(_,i) { return i; });

  /* Build x-axis: use sequential index, with time tick labels */
  var xIdx = [];
  for (var i = 0; i < yVals.length; i++) xIdx.push(i);

  /* Time tick labels */
  var tickIdxs = TRAJ._tickIndices(xIdx.length, 8);
  var tickVals = tickIdxs.map(function(i) { return i; });
  var tickTexts = tickIdxs.map(function(i) {
    return timeField ? TRAJ._shortTime(times[i]) : String(i);
  });

  /* Hover text with full time + value */
  var hoverTexts = [];
  for (var i = 0; i < yVals.length; i++) {
    var tStr = timeField ? times[i] : 'pt ' + i;
    hoverTexts.push(tStr + '<br>' + varField + ' = ' + (typeof yVals[i] === 'number' ? yVals[i].toPrecision(5) : yVals[i]));
  }

  var traces = [];

  /* Threshold exceedance shading — draw BEFORE main line */
  if (thrVal !== null && isFinite(thrVal)) {
    /* Exceedance segments as filled scatter to baseline */
    traces.push({
      type: 'scatter', mode: 'none',
      x: xIdx, y: yVals.map(function(v) { return thrTest(v) ? v : null; }),
      fill: 'tozeroy',
      fillcolor: 'rgba(255,90,90,0.12)',
      hoverinfo: 'skip', showlegend: false
    });

    /* Highlight the exceedance points as red markers */
    var exX = [], exY = [], exH = [];
    for (var i = 0; i < yVals.length; i++) {
      if (thrTest(yVals[i])) {
        exX.push(xIdx[i]); exY.push(yVals[i]);
        exH.push((timeField ? TRAJ._shortTime(times[i]) : 'pt ' + i) +
          '<br>' + varField + ' = ' + yVals[i].toPrecision(5) +
          '<br><b>' + thrWord + ' THRESHOLD</b>');
      }
    }
    if (exX.length > 0) {
      traces.push({
        type: 'scatter', mode: 'markers',
        x: exX, y: exY,
        marker: { size: 9, color: '#ff5a5a', symbol: 'circle',
                  line: { color: 'rgba(255,255,255,0.5)', width: 1 } },
        text: exH, hoverinfo: 'text',
        showlegend: true, name: thrLabel
      });
    }
  }

  /* Main data line */
  traces.push({
    type: 'scatter', mode: 'lines+markers',
    x: xIdx, y: yVals,
    line: { color: '#38c0ff', width: 2 },
    marker: { size: 5, color: '#38c0ff' },
    text: hoverTexts, hoverinfo: 'text',
    showlegend: true, name: varField
  });

  /* Threshold line */
  var shapes = [];
  if (thrVal !== null && isFinite(thrVal)) {
    shapes.push({
      type: 'line', xref: 'paper', x0: 0, x1: 1,
      yref: 'y', y0: thrVal, y1: thrVal,
      line: { color: '#ff5a5a', width: 1.5, dash: 'dash' }
    });
  }

  var layout = {
    title: { text: varField + ' vs Time', font: { color: '#38c0ff', size: 13, family: 'IBM Plex Sans, sans-serif' } },
    margin: { l: 70, r: 20, t: 40, b: 60 },
    paper_bgcolor: '#070e1c',
    plot_bgcolor: '#0d1a2e',
    font: { color: '#8899aa', family: 'IBM Plex Mono, monospace', size: 10 },
    xaxis: {
      title: { text: 'Time (UTC)', font: { color: '#b0b8c8', size: 11 } },
      zeroline: false, showgrid: true, gridcolor: 'rgba(255,255,255,0.06)',
      color: '#8899aa',
      tickmode: 'array', tickvals: tickVals, ticktext: tickTexts,
      tickangle: -30, tickfont: { size: 9 }
    },
    yaxis: {
      title: { text: varField, font: { color: '#b0b8c8', size: 11 } },
      zeroline: false, showgrid: true, gridcolor: 'rgba(255,255,255,0.06)',
      color: '#8899aa', tickfont: { size: 9 },
      type: scaleType === 'log' ? 'log' : 'linear'
    },
    shapes: shapes,
    legend: {
      bgcolor: 'rgba(7,14,28,0.7)', bordercolor: 'rgba(255,255,255,0.1)', borderwidth: 1,
      font: { color: '#b0b8c8', size: 9 },
      x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top'
    },
    annotations: (thrVal !== null && isFinite(thrVal)) ? [{
      x: 1.0, xref: 'paper', xanchor: 'right',
      y: thrVal, yref: 'y',
      text: 'threshold = ' + thrVal,
      showarrow: false,
      font: { color: '#ff5a5a', size: 9, family: 'IBM Plex Mono, monospace' },
      bgcolor: 'rgba(7,14,28,0.8)',
      bordercolor: 'rgba(255,90,90,0.3)', borderwidth: 1, borderpad: 3
    }] : []
  };

  Plotly.newPlot(plotDiv, traces, layout, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] });
};


/* ═══════════════════════════════════════════════════════════════════
   §5  MASTER RENDER
   ═══════════════════════════════════════════════════════════════════ */

async function renderTrajectory() {
  if (!TRAJ.dataset) return;
  await TRAJ._renderMap();
  TRAJ._renderTimeSeries();
}


/* ═══════════════════════════════════════════════════════════════════
   §6  CONTROL HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function _trVal(id) { var e = document.getElementById(id); return e ? e.value : ''; }


/* ═══════════════════════════════════════════════════════════════════
   §7  INIT + EVENT WIRING
   ═══════════════════════════════════════════════════════════════════ */

function initTrajectoryViewer() {
  /* Auto-render on control change */
  ['traj-map-color'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function() { if (TRAJ.dataset) TRAJ._renderMap(); });
  });

  ['traj-ts-var', 'traj-ts-scale', 'traj-thr-val', 'traj-thr-dir'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function() { if (TRAJ.dataset) TRAJ._renderTimeSeries(); });
  });

  /* Threshold input: also trigger on Enter key and blur */
  var thrInput = document.getElementById('traj-thr-val');
  if (thrInput) {
    thrInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && TRAJ.dataset) TRAJ._renderTimeSeries();
    });
    thrInput.addEventListener('blur', function() {
      if (TRAJ.dataset) TRAJ._renderTimeSeries();
    });
  }

  /* File input */
  var fileInput = document.getElementById('traj-file');
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      if (e.target.files[0]) loadTrajectoryFile(e.target.files[0]);
    });
  }

  /* PNG download */
  var dlMap = document.getElementById('traj-download-map');
  if (dlMap) dlMap.addEventListener('click', function() {
    if (typeof Plotly !== 'undefined') Plotly.downloadImage('traj-map-plot', { format: 'png', filename: 'trajectory_groundtrack', width: 1400, height: 700, scale: 2 });
  });
  var dlTs = document.getElementById('traj-download-ts');
  if (dlTs) dlTs.addEventListener('click', function() {
    if (typeof Plotly !== 'undefined') Plotly.downloadImage('traj-ts-plot', { format: 'png', filename: 'trajectory_timeseries', width: 1400, height: 500, scale: 2 });
  });
}

function loadTrajectoryFile(file) {
  var status = document.getElementById('traj-status');
  file.text().then(function(text) { loadTrajectoryText(text, file.name); })
    .catch(function(err) { if (status) { status.textContent = 'Error: ' + err.message; status.style.color = '#ff5a5a'; } });
}

function loadTrajectoryText(text, name) {
  var status = document.getElementById('traj-status');
  var mapColorSel = document.getElementById('traj-map-color');
  var tsVarSel = document.getElementById('traj-ts-var');

  try {
    TRAJ.dataset = TRAJ.parse(text);
    var ds = TRAJ.dataset;

    /* Populate field selectors — exclude time, lon, lat */
    var dataFields = ds.fieldNames.filter(function(f) { return !/^time|^lon|^lat/i.test(f); });

    [mapColorSel, tsVarSel].forEach(function(sel) {
      if (!sel) return;
      sel.innerHTML = '';
      dataFields.forEach(function(f) {
        var opt = document.createElement('option');
        opt.value = f; opt.textContent = f;
        sel.appendChild(opt);
      });
    });

    if (status) {
      status.textContent = 'Loaded: ' + (name || 'file') + ' · ' + ds.rows.length + ' points · ' +
        ds.fieldNames.length + ' variables' + (ds.title ? ' · ' + ds.title : '');
      status.style.color = '#2dd4a0';
    }

    renderTrajectory();
  } catch (err) {
    if (status) { status.textContent = 'Parse error: ' + err.message; status.style.color = '#ff5a5a'; }
    console.error('[traj-viewer]', err);
  }
}
