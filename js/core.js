/**
 * AMPS CCMC — CORE UTILITIES
 * Shared helpers used across all modules:
 *   - DOM helpers
 *   - SVG construction helpers
 *   - Number formatting
 *   - Validation primitives
 *   - Event bus (simple pub/sub)
 *   - State store
 */

'use strict';

/* ── DOM HELPERS ────────────────────────────────────────────────────────── */
export const $ = id => document.getElementById(id);
export const $$ = sel => [...document.querySelectorAll(sel)];
export const setText = (id, v) => { const el = $(id); if(el) el.textContent = v; };
export const setHTML = (id, v) => { const el = $(id); if(el) el.innerHTML = v; };
export const setAttr = (id, attr, v) => { const el = $(id); if(el) el.setAttribute(attr, v); };
export const show = id => { const el = $(id); if(el) el.style.display = 'block'; };
export const hide = id => { const el = $(id); if(el) el.style.display = 'none'; };
export const toggle = (id, force) => { const el = $(id); if(el) el.classList.toggle('closed', force); };

/** Apply CSS classes based on validation state */
export function setValClass(inputId, state) {
  const el = $(inputId);
  if(!el) return;
  el.classList.remove('valid','warn','error');
  if(state) el.classList.add(state);
}

/* ── SVG HELPERS ────────────────────────────────────────────────────────── */
const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for(const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Convert GSM X [RE] → SVG x [px] (Sun to the right, +X = right) */
export const gsmToSvgX = (re, cx=200, scale=5) => cx + re * scale;
/** Convert GSM Z [RE] → SVG y [px] (+Z = up = smaller y) */
export const gsmToSvgZ = (re, cy=160, scale=5) => cy - re * scale;
/** Clamp a value between lo and hi */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Draw background grid on a <g> element. Step = 5 RE. */
export function drawSvgGrid(gridEl, cx=200, cy=160, scale=5, w=400, h=320) {
  gridEl.innerHTML = '';
  for(let x = -80; x <= 25; x += 5) {
    const px = gsmToSvgX(x, cx, scale);
    if(px < 2 || px > w-2) continue;
    const ln = svgEl('line', { x1:px, y1:4, x2:px, y2:h-4,
      stroke: x===0 ? '#1e3a5a' : '#0c1e38',
      'stroke-width': x===0 ? 1 : 0.5,
      'stroke-dasharray': x===0 ? '' : '3,5' });
    gridEl.appendChild(ln);
    if(x % 10 === 0 && x !== 0) {
      const t = svgEl('text', { x: px-5, y: cy+20,
        fill:'#243850', 'font-family':'IBM Plex Mono', 'font-size':8 });
      t.textContent = x+'RE'; gridEl.appendChild(t);
    }
  }
  for(let z = -35; z <= 35; z += 5) {
    const py = gsmToSvgZ(z, cy, scale);
    if(py < 2 || py > h-2) continue;
    const ln = svgEl('line', { x1:4, y1:py, x2:w-4, y2:py,
      stroke: z===0 ? '#1e3a5a' : '#0c1e38',
      'stroke-width': z===0 ? 1 : 0.5,
      'stroke-dasharray': z===0 ? '' : '3,5' });
    gridEl.appendChild(ln);
    if(z % 10 === 0 && z !== 0) {
      const t = svgEl('text', { x: cx+3, y: py+3,
        fill:'#243850', 'font-family':'IBM Plex Mono', 'font-size':8 });
      t.textContent = z+'RE'; gridEl.appendChild(t);
    }
  }
}

/* ── NUMBER FORMATTING ───────────────────────────────────────────────────── */
export const fmt1 = v => Number(v).toFixed(1);
export const fmt2 = v => Number(v).toFixed(2);
export const fmt3 = v => Number(v).toFixed(3);
export const fmtDate = d => d ? d.replace('T',' ') + ' UTC' : '—';

/* ── VALIDATION HELPERS ─────────────────────────────────────────────────── */
export function inRange(v, lo, hi) { return Number.isFinite(v) && v >= lo && v <= hi; }
export function nonEmpty(s) { return typeof s === 'string' && s.trim().length > 0; }
export function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
export function validMJD(v) { return inRange(v, 40000, 80000); }

/** Return 'valid' | 'warn' | 'error' for a numeric input */
export function numState(v, lo, hi, warnLo, warnHi) {
  if(!inRange(v, lo, hi)) return 'error';
  if(warnLo !== undefined && v < warnLo) return 'warn';
  if(warnHi !== undefined && v > warnHi) return 'warn';
  return 'valid';
}

/* ── SIMPLE EVENT BUS ───────────────────────────────────────────────────── */
const _listeners = {};
export const on  = (event, fn) => { (_listeners[event] = _listeners[event]||[]).push(fn); };
export const off = (event, fn) => { if(_listeners[event]) _listeners[event] = _listeners[event].filter(f=>f!==fn); };
export const emit = (event, data) => { (_listeners[event]||[]).forEach(fn => fn(data)); };

/* ── GLOBAL STATE STORE ─────────────────────────────────────────────────── */
export const STATE = {
  /* Step 1 — Run Info */
  runName:     'SEP_Sep2017_VanAllenProbeA',
  piName:      '',
  piEmail:     '',
  institution: '',
  description: '',
  scienceGoal: 'storm_validation',

  /* Step 2 — Particle */
  species:     'proton',
  chargeState: 1,
  massAMU:     1,

  /* Step 3 — Background Field */
  fieldModel:  'TS05',
  dst:         -142.0,
  pdyn:        3.5,
  bz:          -18.5,
  vx:          -650.0,
  nsw:         12.0,
  by:          3.2,
  bx:          0.0,
  epoch:       '2017-09-10T16:00',

  /* Step 3b — Domain Boundary */
  boundaryType:'SHUE',
  boxXmax:     15.0, boxXmin: -60.0,
  boxYmax:     25.0, boxYmin: -25.0,
  boxZmax:     20.0, boxZmin: -20.0,
  boxRinner:   2.0,
  shueMode:    'auto',
  shueR0:      null,
  shueAlpha:   null,
  xtail:       -60.0,
  shueRinner:  2.0,

  /* Step 4a — Temporal */
  temporalMode: 'TIME_SERIES',
  eventStart:   '2017-09-07T00:00',
  eventEnd:     '2017-09-10T20:00',
  fieldUpdateDt: 5,
  injectDt:     30,
  tsSource:     'omni',

  /* Step 4b — Spectrum */
  spectrumType: 'POWER_LAW',
  specJ0:       1e4,
  specGamma:    3.5,
  specE0:       10.0,
  specEmin:     1.0,
  specEmax:     1000.0,

  /* Step 5 — Output Domain */
  outputMode:   'TRAJECTORY',
  trajFile:     null,
  fluxDt:       1.0,
  extraShell:   false,

  /* Step 6 — Output Options */
  outputFluxType: 'DIFFERENTIAL',
  outputCutoff:   true,
  outputPitch:    false,
  energyBins:     [1,5,10,30,100,300,1000],
  outputFormat:   'NETCDF4',
  outputCoords:   'GEO',

  /* Derived / runtime */
  validationErrors: [],
};

/** Compute Shue r0 and alpha from stored TS05 params */
export function computeShueParams() {
  const bz = STATE.bz, pd = Math.max(0.1, STATE.pdyn);
  const r0    = (11.4 + 0.013*bz) * Math.pow(pd, -1/6.6);
  const alpha = (0.58  - 0.007*bz) * (1 + 0.024*Math.log(pd));
  return { r0: clamp(r0, 4, 15), alpha: clamp(alpha, 0.3, 0.9) };
}

/** Return the effective r0 and alpha (auto or manual) */
export function getShueParams() {
  if(STATE.shueMode === 'manual' && STATE.shueR0 && STATE.shueAlpha) {
    return { r0: STATE.shueR0, alpha: STATE.shueAlpha };
  }
  return computeShueParams();
}

/** Compute Shue r(theta) */
export function shueR(r0, alpha, deg) {
  const th = deg * Math.PI / 180;
  const d = 1 + Math.cos(th);
  return d < 1e-9 ? Infinity : r0 * Math.pow(2 / d, alpha);
}
