/* =============================================================================
   FILE:    js/01-state.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Global application state object and shared constants.

   The single object `S` is the source of truth for every wizard step.
   No wizard step ever stores its own private mutable state — it always
   reads from and writes to S so that the sidebar summary, keyword-preview
   strips, and param-file builder always see a consistent snapshot.

   SECTIONS
     S  — mutable run configuration (one property per AMPS_PARAM.in keyword)
     $  — getElementById shorthand
     set — helper to write a text element and optionally change its colour class
     CX, CY, SC — SVG canvas coordinate constants used by boundary diagrams

   PROPERTY GROUPS IN S
     Wizard meta       step, done
     Run info          runName, piName, piEmail, institution, sciGoal
     Particle          species, charge, mass
     Background field  fieldModel, dst, pdyn, bz, vx, nsw, by, bx, epoch
                       t95mDst, t95mKp
                       t15Goes, t15Dst, t15Pdyn, t15Bz, t15Vx, t15Nsw
     Domain boundary   boundaryType, shueMode
                       boxXmax/Xmin/Ymax/Ymin/Zmax/Zmin/Rinner
                       shueR0, shueAlpha, xtail, shueRinner
     Electric field    eFieldCoro, eFieldConvModel
                       vsKpMode, vsKp, vsGamma, vsA
                       weimerMode
     Temporal          tempMode, eventStart, eventEnd, fieldDt, injectDt, tsSource
     Spectrum          specType, specJ0, specGamma, specE0, specEmin, specEmax
     Output domain     outputMode, fluxDt, trajLoaded
     Output options    fluxType, outputCutoff, outputPitch, outputFormat,
                       outputCoords, energyBins

   DEFAULT VALUES reflect the September 2017 SEP storm case
   (Van Allen Probe A trajectory run).

   DEPENDS ON: nothing (must be the first script loaded)
=============================================================================*/

const S = {
  /* ── Wizard meta ───────────────────────────────────────────────────── */
  step: 1,
  done: new Set(),     // set of completed step numbers (used by wizard nav)

  /* ── Step 1 · Run info ─────────────────────────────────────────────── */
  runName:     'SEP_Sep2017_VanAllenProbeA',
  piName:      '',
  piEmail:     '',
  institution: '',
  sciGoal:     '',

  /* ── Step 2 · Particle species ─────────────────────────────────────── */
  species: 'proton',
  charge:  1,          // elementary charges (Z)
  mass:    1.0073,     // atomic mass units (u)

  /* ── Step 3 · Background magnetic field model ──────────────────────── */
  fieldModel: 'TS05',
  // TS05 / T04s shared 8-parameter driving set:
  dst:   -142.0,       // [nT]  Dst index (ring current proxy)
  pdyn:    3.5,        // [nPa] solar wind dynamic pressure
  bz:    -18.5,        // [nT]  IMF Bz (GSM)
  vx:   -650.0,        // [km/s] solar wind velocity (negative = sunward)
  nsw:    12.0,        // [cm⁻³] solar wind proton number density
  by:      3.2,        // [nT]  IMF By (GSM)
  bx:      0.0,        // [nT]  IMF Bx (GSM)
  epoch: '2017-09-10T16:00',  // ISO-8601 epoch for STEADY_STATE runs
  // T95m extra drivers (only Dst + Kp required):
  t95mDst: -142.0,     // [nT]
  t95mKp:     5.0,     // Kp index [0–9]
  // T15 extra drivers (GOES total-B in addition to standard set):
  t15Goes: 100.0,      // [nT] GOES geostationary total B
  t15Dst:  -142.0, t15Pdyn: 3.5, t15Bz: -18.5,
  t15Vx:   -650.0, t15Nsw:  12.0,

  /* ── Step 4 · Domain boundary ──────────────────────────────────────── */
  boundaryType: 'SHUE',     // 'BOX' or 'SHUE'
  shueMode:     'auto',     // 'auto' (from TS05 Dst/Pdyn/Bz) or 'manual'
  // BOX face positions [RE, GSM]:
  boxXmax:  15,  boxXmin: -60,
  boxYmax:  25,  boxYmin: -25,
  boxZmax:  20,  boxZmin: -20,
  boxRinner: 2.0,           // [RE] inner loss sphere radius
  // Shue manual overrides (null = use auto-computed values):
  shueR0:     null,         // [RE] subsolar standoff
  shueAlpha:  null,         // [] flaring exponent
  xtail:      -60,          // [RE] nightside tail-cap flat cut
  shueRinner:  2.0,         // [RE] inner boundary (same as boxRinner for Shue)

  /* ── Step 5 · Electric field ────────────────────────────────────────── */
  eFieldCoro:      true,             // include corotation E? (default: YES)
  eFieldConvModel: 'VOLLAND_STERN',  // 'VOLLAND_STERN' | 'WEIMER' | 'NONE'
  // Volland-Stern parameters:
  vsKpMode: 'auto',    // 'auto' = derive Kp from Dst; 'manual' = user input
  vsKp:      5.0,      // Kp index (updated from Dst on init)
  vsGamma:   2.0,      // shielding exponent (typical 2.0; range 1.5–3.0)
  vsA:       null,     // intensity coefficient (computed by vsIntensityA)
  // Weimer 2005 configuration:
  weimerMode: 'auto',  // 'auto' = read from TS05 drivers; 'file' = upload

  /* ── Step 6 · Temporal variability ─────────────────────────────────── */
  tempMode:    'TIME_SERIES',         // 'STEADY_STATE' | 'TIME_SERIES' | 'MHD_COUPLED'
  eventStart:  '2017-09-07T00:00',
  eventEnd:    '2017-09-10T20:00',
  fieldDt:     5,     // [min] field-update cadence (FIELD_UPDATE_DT)
  injectDt:    30,    // [min] particle injection cadence (INJECT_DT)
  tsSource:    'omni', // 'omni' | 'file' | 'scalar'

  /* ── Step 7 · Particle source spectrum ──────────────────────────────── */
  specType:   'POWER_LAW',   // 'POWER_LAW' | 'BAND' | 'TABLE'
  specJ0:     10000,         // [cm⁻² sr⁻¹ s⁻¹ MeV⁻¹] reference flux
  specGamma:  3.5,           // power-law spectral index
  specE0:     10,            // [MeV] reference energy
  specEmin:   1,             // [MeV] minimum energy
  specEmax:   1000,          // [MeV] maximum energy

  /* ── Step 8 · Output domain ─────────────────────────────────────────── */
  outputMode: 'TRAJECTORY',  // 'TRAJECTORY' | 'GRID_3D' | 'GRID_2D' | 'GRID_1D'
  fluxDt:      1.0,          // [min] output cadence for trajectory mode
  trajLoaded:  false,        // has a trajectory file been loaded?

  /* ── Step 9 · Output options ─────────────────────────────────────────── */
  fluxType:      'DIFFERENTIAL', // 'DIFFERENTIAL' | 'INTEGRAL'
  outputCutoff:  true,           // write cutoff rigidity field?
  outputPitch:   false,          // write pitch-angle distribution?
  outputFormat:  'NETCDF4',      // 'NETCDF4' | 'HDF5' | 'ASCII'
  outputCoords:  'GEO',          // 'GEO' | 'GSM' | 'SM'
  energyBins:    [1, 5, 10, 30, 100, 300, 1000],  // [MeV]
};

/* ── Convenience aliases ─────────────────────────────────────────────── */
/** getElementById shorthand used everywhere */
const $ = id => document.getElementById(id);

/**
 * Write text into an element; optionally set a status colour class.
 * @param {string} id   - element ID
 * @param {string} text - text content to set
 * @param {string} [cls] - 'g'=green, 'o'=orange, 'r'=red, ''=no change
 */
function set(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  if (cls === 'g') { el.className = 'sb-ok';   }
  else if (cls === 'o') { el.className = 'sb-warn'; }
  else if (cls === 'r') { el.className = 'sb-err';  }
}

/* ── SVG canvas constants (shared by boundary diagram renderers) ─────── */
const CX = 200;  // SVG pixel X of GSM origin (Earth centre)
const CY = 160;  // SVG pixel Y of GSM origin
const SC = 5;    // pixels per Earth radius

/**
 * Convert GSM X [RE] to SVG pixel X.
 * Positive X_GSM → right (sunward), negative X_GSM → left (tailward).
 */
const gx = re => CX + re * SC;

/**
 * Convert GSM Z [RE] to SVG pixel Y.
 * Note: SVG Y-axis is inverted vs GSM Z — +Z_GSM maps to smaller SVG Y (upward).
 */
const gz = re => CY - re * SC;

/**
 * Clamp a value between lo and hi (inclusive).
 * Used when mapping large GSM coordinates to finite SVG viewport.
 */
const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
