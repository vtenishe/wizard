/**
 * AMPS CCMC Interface — Diagram Module
 * amps-ccmc/js/diagrams.js
 *
 * Live SVG renderers for:
 *   1. Shue (1998) magnetopause cross-section
 *   2. Rectangular box domain cross-section
 *   3. Band function spectrum (log-log)
 *   4. Energy band channel visualizer
 *
 * All diagrams reference AMPS.state and are called after
 * any relevant field changes.
 */
(function () {
  'use strict';
  window.AMPS = window.AMPS || {};

  // ── SVG HELPERS ────────────────────────────────────────────────────────
  var NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, text) {
    var el = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function clp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ── COORDINATE MAPPING (shared by both domain diagrams) ────────────────
  // Canvas: 420 × 300 px.  Earth at (CX, CY).  Scale SC px/RE.
  // +X_GSM → right (Sun),  +Z_GSM → up.
  var CX = 200, CY = 150, SC = 4.5;   // pixels per R_E
  var W = 420, H = 300;

  function gx(re) { return CX + re * SC; }
  function gz(re) { return CY - re * SC; }

  // ── GRID ───────────────────────────────────────────────────────────────
  function drawDomainGrid(groupId) {
    var g = document.getElementById(groupId);
    if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);

    for (var x = -70; x <= 20; x += 5) {
      var px = gx(x);
      if (px < 4 || px > W - 4) continue;
      g.appendChild(svgEl('line', {
        x1: px, y1: 4, x2: px, y2: H - 4,
        stroke: x === 0 ? '#1e3860' : '#0d2040',
        'stroke-width': x === 0 ? 1 : 0.5,
        'stroke-dasharray': x === 0 ? '' : '3,5'
      }));
      if (x % 10 === 0 && x !== 0) {
        g.appendChild(svgEl('text', {
          x: px - 7, y: CY + 18,
          fill: '#2a4468', 'font-family': 'IBM Plex Mono', 'font-size': 8
        }, x + 'RE'));
      }
    }
    for (var z = -25; z <= 25; z += 5) {
      var py = gz(z);
      if (py < 4 || py > H - 4) continue;
      g.appendChild(svgEl('line', {
        x1: 4, y1: py, x2: W - 4, y2: py,
        stroke: z === 0 ? '#1e3860' : '#0d2040',
        'stroke-width': z === 0 ? 1 : 0.5,
        'stroke-dasharray': z === 0 ? '' : '3,5'
      }));
      if (z % 10 === 0 && z !== 0) {
        g.appendChild(svgEl('text', {
          x: CX + 3, y: py + 3,
          fill: '#2a4468', 'font-family': 'IBM Plex Mono', 'font-size': 8
        }, z + 'RE'));
      }
    }
  }

  // ── SHUE (1998) PHYSICS ────────────────────────────────────────────────
  function shueR0(bz, pd) { return (11.4 + 0.013 * bz) * Math.pow(Math.max(0.1, pd), -1 / 6.6); }
  function shueAlpha(bz, pd) { return (0.58 - 0.007 * bz) * (1 + 0.024 * Math.log(Math.max(0.1, pd))); }
  function shueR(r0, a, deg) {
    var th = deg * Math.PI / 180;
    var d = 1 + Math.cos(th);
    return d < 1e-9 ? Infinity : r0 * Math.pow(2 / d, a);
  }

  // ── SHUE DIAGRAM ───────────────────────────────────────────────────────
  AMPS.diagrams = AMPS.diagrams || {};

  AMPS.diagrams.shue = function () {
    var s = AMPS.state;
    var bz = parseFloat(s.ts_bz)   || -18.5;
    var pd = parseFloat(s.ts_pdyn) || 3.5;

    var r0, alpha;
    if (s.shue_mode === 'MANUAL') {
      r0    = clp(parseFloat(s.shue_r0)    || 8.56,  4, 15);
      alpha = clp(parseFloat(s.shue_alpha) || 0.617, 0.3, 0.9);
    } else {
      r0    = clp(shueR0(bz, pd),    4, 15);
      alpha = clp(shueAlpha(bz, pd), 0.3, 0.9);
    }

    var xtail = parseFloat(s.shue_xtail)  || -60;
    var rin   = parseFloat(s.shue_rinner) || 2.0;
    var rFlank = shueR(r0, alpha, 90);

    // Update display values
    var sv = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    sv('shue-r0-val',     r0.toFixed(2));
    sv('shue-alpha-val',  alpha.toFixed(3));
    sv('shue-xsub-val',   r0.toFixed(2));
    sv('shue-rflank-val', isFinite(rFlank) ? rFlank.toFixed(1) : '—');
    sv('shue-svg-r0',     'r₀=' + r0.toFixed(2) + ' RE');
    sv('shue-svg-alpha',  'α=' + alpha.toFixed(3));
    sv('shue-svg-pdyn',   'Pdyn=' + pd + ' nPa');
    sv('shue-svg-dst',    'Dst=' + (bz < 0 ? '−' + Math.abs(bz) : bz) + ' nT');

    // Build magnetopause path
    var upper = [], lower = [];
    for (var deg = 0; deg <= 180; deg += 1) {
      var r = shueR(r0, alpha, deg);
      if (!isFinite(r)) continue;
      var th = deg * Math.PI / 180;
      var gmx = r * Math.cos(th);
      var gmz = r * Math.sin(th);
      if (gmx < xtail) continue;
      upper.push([clp(gx(gmx), 4, W - 4), clp(gz(gmz), 4, H - 4)]);
      lower.unshift([clp(gx(gmx), 4, W - 4), clp(gz(-gmz), 4, H - 4)]);
    }

    var path = document.getElementById('shue-path');
    if (!path || upper.length < 2) return;

    var tcX = clp(gx(xtail), 6, W - 6);
    var d = 'M ' + upper[0][0].toFixed(1) + ',' + upper[0][1].toFixed(1);
    upper.forEach(function (p) { d += ' L ' + p[0].toFixed(1) + ',' + p[1].toFixed(1); });
    var tailBot = clp(gz(-shueR(r0, alpha, 179) * Math.sin(179 * Math.PI / 180)), 4, H - 4);
    d += ' L ' + tcX.toFixed(1) + ',' + tailBot.toFixed(1);
    lower.forEach(function (p) { d += ' L ' + p[0].toFixed(1) + ',' + p[1].toFixed(1); });
    d += ' Z';
    path.setAttribute('d', d);

    // Tail cap line
    var sa = function (id, k, v) { var el = document.getElementById(id); if (el) el.setAttribute(k, v); };
    sa('shue-tailcap', 'x1', tcX.toFixed(1)); sa('shue-tailcap', 'x2', tcX.toFixed(1));
    sa('shue-tailcap', 'y1', '10'); sa('shue-tailcap', 'y2', (H - 10).toFixed(1));
    var tl = document.getElementById('shue-tailcap-lbl');
    if (tl) { tl.setAttribute('x', (tcX + 3).toFixed(1)); tl.textContent = 'X_tail=' + xtail; }

    // Inner boundary
    sa('shue-inner', 'r', (rin * SC).toFixed(1));
    var il = document.getElementById('shue-inner-lbl');
    if (il) { il.textContent = 'R_in=' + rin + 'RE'; }

    // r0 annotation
    var r0px = clp(gx(r0), 10, W - 10);
    sa('shue-r0-arrow', 'x2', r0px.toFixed(1)); sa('shue-r0-arrow', 'y2', CY.toFixed(1));
    var rl = document.getElementById('shue-r0-lbl');
    if (rl) { rl.setAttribute('x', clp(gx(r0 / 2), 8, W - 40).toFixed(1)); rl.textContent = 'r₀=' + r0.toFixed(1); }

    // Flank annotation
    if (isFinite(rFlank)) {
      var fpx = clp(gz(Math.min(rFlank, 25)), 6, H - 6);
      sa('shue-flank-arrow', 'y2', fpx.toFixed(1));
      var fl = document.getElementById('shue-flank-lbl');
      if (fl) { fl.setAttribute('y', ((fpx + CY) / 2).toFixed(1)); fl.textContent = 'Rflk=' + rFlank.toFixed(1); }
    }

    // AMPS_PARAM.in keyword preview
    var kw = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    kw('kw-shue-r0',     s.shue_mode === 'MANUAL' ? r0.toFixed(2) : 'AUTO');
    kw('kw-shue-alpha',  s.shue_mode === 'MANUAL' ? alpha.toFixed(3) : 'AUTO');
    kw('kw-xtail',       xtail.toFixed(1));
    kw('kw-shue-rinner', rin.toFixed(1));

    drawDomainGrid('shue-grid');
  };

  // ── BOX DIAGRAM ────────────────────────────────────────────────────────
  AMPS.diagrams.box = function () {
    var s = AMPS.state;
    var xmax = parseFloat(s.box_xmax) || 15;
    var xmin = parseFloat(s.box_xmin) || -60;
    var zmax = parseFloat(s.box_zmax) || 20;
    var zmin = parseFloat(s.box_zmin) || -20;
    var rin  = parseFloat(s.box_rinner) || 2.0;

    var rx = clp(gx(xmin), 4, W - 4);
    var ry = clp(gz(zmax), 4, H - 4);
    var rw = Math.max(0, clp(gx(xmax), 4, W - 4) - rx);
    var rh = Math.max(0, clp(gz(zmin), 4, H - 4) - ry);

    var sa = function (id, k, v) { var el = document.getElementById(id); if (el) el.setAttribute(k, v); };
    sa('box-rect', 'x', rx.toFixed(1)); sa('box-rect', 'y', ry.toFixed(1));
    sa('box-rect', 'width', rw.toFixed(1)); sa('box-rect', 'height', rh.toFixed(1));
    sa('box-inner', 'r', (rin * SC).toFixed(1));

    var sv = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    sv('box-inner-lbl', 'R_in=' + rin + 'RE');

    // Face labels
    var lx = [[xmax,'box-lbl-xmax',gx(xmax)+2,CY+16],[xmin,'box-lbl-xmin',gx(xmin)-28,CY+16],
               [zmax,'box-lbl-zmax',CX+4,gz(zmax)-4],[zmin,'box-lbl-zmin',CX+4,gz(zmin)+12]];
    lx.forEach(function (l) {
      var el = document.getElementById(l[1]);
      if (!el) return;
      el.setAttribute('x', clp(l[2], 5, W - 50).toFixed(1));
      el.setAttribute('y', clp(l[3], 12, H - 5).toFixed(1));
      el.textContent = (l[1].includes('xmax') ? 'Xmax=' : l[1].includes('xmin') ? 'Xmin='
                       : l[1].includes('zmax') ? 'Zmax=' : 'Zmin=') + l[0];
    });

    // Keywords
    var kw = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    kw('kw-box-xmax', xmax.toFixed(1)); kw('kw-box-xmin', xmin.toFixed(1));
    kw('kw-box-ymax', (parseFloat(s.box_ymax)||25).toFixed(1));
    kw('kw-box-ymin', (parseFloat(s.box_ymin)||-25).toFixed(1));
    kw('kw-box-zmax', zmax.toFixed(1)); kw('kw-box-zmin', zmin.toFixed(1));
    kw('kw-box-rinner', rin.toFixed(1));

    drawDomainGrid('box-grid');
  };

  // ── BAND SPECTRUM (log-log) ────────────────────────────────────────────
  // Draws a log-log plot of dJ/dE vs E for the Band (1993) double power-law.
  //
  // Band function:
  //   dJ/dE = J0 * (E/E_b)^γ1 * exp(-E/E_b)      for E < E_b (soft)
  //   dJ/dE = J0 * ((γ1-γ2)*E_b)^(γ1-γ2) *
  //           exp(γ2-γ1) * E^γ2                   for E ≥ E_b (hard)
  //
  // Plot area: 380 × 240 px within a 420 × 280 SVG.
  // X axis: E from 1 to 3000 MeV/n (log scale).
  // Y axis: dJ/dE from 10^-2 to 10^7 (log scale, auto-ranging).

  var PLOT = { x0:45, y0:18, W:310, H:210 };  // plot area within SVG

  function logX(e, eMin, eMax) {
    return PLOT.x0 + (Math.log10(e) - Math.log10(eMin)) /
           (Math.log10(eMax) - Math.log10(eMin)) * PLOT.W;
  }
  function logY(j, jMin, jMax) {
    return PLOT.y0 + PLOT.H - (Math.log10(Math.max(j, jMin)) - Math.log10(jMin)) /
           (Math.log10(jMax) - Math.log10(jMin)) * PLOT.H;
  }

  function bandFlux(E, g1, g2, Eb, J0) {
    if (E < Eb) {
      return J0 * Math.pow(E / Eb, g1) * Math.exp(-E / Eb);
    } else {
      var factor = Math.pow((g1 - g2) * Eb, g1 - g2) * Math.exp(g2 - g1);
      return J0 * factor * Math.pow(E, g2);
    }
  }

  AMPS.diagrams.spectrum = function () {
    var svgEl2 = function (tag, attrs, text) {
      var el = document.createElementNS(NS, tag);
      if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
      if (text !== undefined) el.textContent = text;
      return el;
    };

    var g = document.getElementById('spectrum-plot-g');
    var svg = document.getElementById('spectrum-svg');
    if (!g || !svg) return;
    while (g.firstChild) g.removeChild(g.firstChild);

    var s = AMPS.state;
    var g1   = parseFloat(s.band_gamma1) || -1.6;
    var g2   = parseFloat(s.band_gamma2) || -3.2;
    var Eb   = parseFloat(s.band_ebreak) || 110;
    var J0   = parseFloat(s.band_j0)     || 32000;
    var eMin = parseFloat(s.energy_min)  || 10;
    var eMax = parseFloat(s.energy_max)  || 1000;

    // Energy range for the plot (always show full context)
    var plotEmin = 1, plotEmax = 3000;
    var plotJmin = 1e-4, plotJmax = 1e8;

    // ── Axes ──
    // X axis
    g.appendChild(svgEl2('line', { x1:PLOT.x0, y1:PLOT.y0+PLOT.H,
      x2:PLOT.x0+PLOT.W, y2:PLOT.y0+PLOT.H, stroke:'#2a4a70', 'stroke-width':1 }));
    // Y axis
    g.appendChild(svgEl2('line', { x1:PLOT.x0, y1:PLOT.y0,
      x2:PLOT.x0, y2:PLOT.y0+PLOT.H, stroke:'#2a4a70', 'stroke-width':1 }));

    // X grid/ticks: 1, 3, 10, 30, 100, 300, 1000, 3000 MeV/n
    [1,3,10,30,100,300,1000,3000].forEach(function (e) {
      var px = logX(e, plotEmin, plotEmax);
      g.appendChild(svgEl2('line', { x1:px, y1:PLOT.y0, x2:px, y2:PLOT.y0+PLOT.H,
        stroke:'#0d2040', 'stroke-width':0.5, 'stroke-dasharray':'3,4' }));
      var lbl = e >= 1000 ? (e/1000)+'k' : e+'';
      g.appendChild(svgEl2('text', { x:px, y:PLOT.y0+PLOT.H+12,
        fill:'#4a6888', 'font-family':'IBM Plex Mono', 'font-size':8,
        'text-anchor':'middle' }, lbl));
    });

    // Y grid/ticks: 10^-4 to 10^8
    for (var yp = -4; yp <= 8; yp++) {
      var py = logY(Math.pow(10, yp), plotJmin, plotJmax);
      g.appendChild(svgEl2('line', { x1:PLOT.x0, y1:py, x2:PLOT.x0+PLOT.W, y2:py,
        stroke:'#0d2040', 'stroke-width':0.5, 'stroke-dasharray':'3,4' }));
      var ylbl = yp >= 0 ? '10^'+yp : '10^('+yp+')';
      g.appendChild(svgEl2('text', { x:PLOT.x0-4, y:py+3,
        fill:'#4a6888', 'font-family':'IBM Plex Mono', 'font-size':8,
        'text-anchor':'end' }, ylbl));
    }

    // Axis labels
    g.appendChild(svgEl2('text', { x:PLOT.x0+PLOT.W/2, y:PLOT.y0+PLOT.H+24,
      fill:'#6a88b0', 'font-family':'IBM Plex Mono', 'font-size':9,
      'text-anchor':'middle' }, 'E [MeV/n]'));
    g.appendChild(svgEl2('text', { x:10, y:PLOT.y0+PLOT.H/2,
      fill:'#6a88b0', 'font-family':'IBM Plex Mono', 'font-size':9,
      'text-anchor':'middle',
      transform:'rotate(-90,' + 10 + ',' + (PLOT.y0+PLOT.H/2) + ')' },
      'dJ/dE [cm⁻² s⁻¹ sr⁻¹ (MeV/n)⁻¹]'));

    // ── Simulation energy range band ──
    var ex0 = logX(eMin, plotEmin, plotEmax);
    var ex1 = logX(eMax, plotEmin, plotEmax);
    g.appendChild(svgEl2('rect', { x:ex0, y:PLOT.y0, width:ex1-ex0, height:PLOT.H,
      fill:'rgba(26,136,212,0.07)' }));

    // ── Band function curve for H+ ──
    var pts = [];
    for (var ee = Math.log10(plotEmin); ee <= Math.log10(plotEmax); ee += 0.02) {
      var E = Math.pow(10, ee);
      var J = bandFlux(E, g1, g2, Eb, J0);
      if (J > plotJmin && J < plotJmax * 100) {
        pts.push(logX(E, plotEmin, plotEmax).toFixed(1) + ',' + logY(J, plotJmin, plotJmax).toFixed(1));
      }
    }
    if (pts.length > 2) {
      g.appendChild(svgEl2('polyline', {
        points: pts.join(' '),
        fill: 'none', stroke: '#ff9a3c', 'stroke-width': 2
      }));
    }

    // He2+ curve (scaled ~0.04 of H+)
    if (s.species_He) {
      var ptsHe = [];
      for (var ee2 = Math.log10(plotEmin); ee2 <= Math.log10(plotEmax); ee2 += 0.02) {
        var E2 = Math.pow(10, ee2);
        var J2 = bandFlux(E2, g1, g2, Eb, J0 * 0.04);
        if (J2 > plotJmin && J2 < plotJmax * 100) {
          ptsHe.push(logX(E2, plotEmin, plotEmax).toFixed(1) + ',' + logY(J2, plotJmin, plotJmax).toFixed(1));
        }
      }
      if (ptsHe.length > 2) {
        g.appendChild(svgEl2('polyline', {
          points: ptsHe.join(' '),
          fill: 'none', stroke: '#38c0ff', 'stroke-width': 1.5,
          'stroke-dasharray': '5,3'
        }));
      }
    }

    // ── E_break vertical marker ──
    var ebPx = logX(Eb, plotEmin, plotEmax);
    if (ebPx > PLOT.x0 && ebPx < PLOT.x0 + PLOT.W) {
      g.appendChild(svgEl2('line', { x1:ebPx, y1:PLOT.y0, x2:ebPx, y2:PLOT.y0+PLOT.H,
        stroke:'#ffd04b', 'stroke-width':1.5, 'stroke-dasharray':'4,3' }));
      g.appendChild(svgEl2('text', { x:ebPx+3, y:PLOT.y0+15,
        fill:'#ffd04b', 'font-family':'IBM Plex Mono', 'font-size':9 },
        'E_b=' + Eb + ' MeV/n'));
    }

    // Legend
    var leg = [ ['#ff9a3c','─ H⁺ Band'],['#38c0ff','-- He²⁺ (÷25)'],['#1a88d4','▒ sim range'] ];
    leg.forEach(function (l, i) {
      g.appendChild(svgEl2('line', { x1:PLOT.x0+4, y1:PLOT.y0+PLOT.H-18+i*10,
        x2:PLOT.x0+18, y2:PLOT.y0+PLOT.H-18+i*10,
        stroke:l[0], 'stroke-width':2 }));
      g.appendChild(svgEl2('text', { x:PLOT.x0+22, y:PLOT.y0+PLOT.H-14+i*10,
        fill:'#8aafce', 'font-family':'IBM Plex Mono', 'font-size':9 }, l[1]));
    });

    // Parameter readout
    var par = 'γ₁=' + g1 + '  γ₂=' + g2 + '  Eb=' + Eb + ' MeV/n  J₀=' + J0.toExponential(2);
    var prd = document.getElementById('spectrum-params');
    if (prd) prd.textContent = par;
  };

  // ── ENERGY BAND VISUALIZER ─────────────────────────────────────────────
  // Colored horizontal bars showing relative flux in each GOES energy channel.
  AMPS.diagrams.energyBands = function () {
    var bands = [
      { label:'10–30',  color:'#4af', eMin:10,  eMax:30   },
      { label:'30–100', color:'#2dd4a0', eMin:30,  eMax:100  },
      { label:'100–300',color:'#ffd04b', eMin:100, eMax:300  },
      { label:'300–700',color:'#ff9a3c', eMin:300, eMax:700  },
      { label:'700–1k', color:'#ff6b6b', eMin:700, eMax:1000 },
      { label:'>1k',    color:'#8b6ff7', eMin:1000,eMax:3000 }
    ];
    var s = AMPS.state;
    var g1  = parseFloat(s.band_gamma1) || -1.6;
    var g2  = parseFloat(s.band_gamma2) || -3.2;
    var Eb  = parseFloat(s.band_ebreak) || 110;
    var J0  = parseFloat(s.band_j0)     || 32000;
    var eSimMin = parseFloat(s.energy_min) || 10;
    var eSimMax = parseFloat(s.energy_max) || 1000;

    // Compute integrated flux in each band
    var fluxes = bands.map(function (b) {
      var steps = 20, sum = 0;
      for (var i = 0; i < steps; i++) {
        var E = b.eMin + (b.eMax - b.eMin) * (i + 0.5) / steps;
        sum += bandFlux(E, g1, g2, Eb, J0) * (b.eMax - b.eMin) / steps;
      }
      return sum;
    });
    var maxFlux = Math.max.apply(null, fluxes.filter(function (f) { return isFinite(f) && f > 0; }));

    var container = document.getElementById('energy-bands-container');
    if (!container) return;
    container.innerHTML = '';

    bands.forEach(function (b, i) {
      var inRange = (b.eMax > eSimMin && b.eMin < eSimMax);
      var frac = maxFlux > 0 ? (fluxes[i] / maxFlux) : 0;
      var pct = (frac * 100).toFixed(0);

      var row = document.createElement('div');
      row.className = 'eb-row' + (inRange ? ' eb-active' : ' eb-dim');
      row.innerHTML =
        '<div class="eb-label">' + b.label + ' MeV/n</div>' +
        '<div class="eb-bar-bg"><div class="eb-bar-fill" style="width:' + Math.max(2, pct) + '%;background:' + b.color + (inRange ? '' : '44') + '"></div></div>' +
        '<div class="eb-pct">' + (isFinite(frac) ? pct : '—') + '%</div>';
      container.appendChild(row);
    });
  };

  // ── INIT GRIDS AT LOAD ─────────────────────────────────────────────────
  // Grids are drawn once; diagrams re-render on state changes.
  AMPS.diagrams.initGrids = function () {
    drawDomainGrid('shue-grid');
    drawDomainGrid('box-grid');
  };

}());
