/*
=====================================================================
FILE: js/12-load.js
INTENT:
  Load and parse a previously generated AMPS_PARAM.in file, restore
  the wizard state from it, and sync all UI elements so the user can
  continue editing without re-entering every parameter.

  This module is the inverse of buildReview() in js/08-review.js:
    buildReview():  S  →  AMPS_PARAM.in text
    loadParamFile:  AMPS_PARAM.in text  →  S  →  UI sync

METHODS / DESIGN:
  - parseParamFile(text): line-by-line parser that extracts keyword=value
    pairs, handles comment stripping, section tracking, and the special
    POINTS_BEGIN/POINTS_END block.
  - applyParsedState(kv): maps AMPS_PARAM.in keywords to S properties,
    handling type coercion (int, float, bool, string, arrays).
  - syncAllUI(): calls every existing UI update function to propagate
    the restored S into DOM inputs, card selections, diagrams, and previews.
  - loadParamFile(): shows the load modal overlay.
  - handleFileLoad(file): reads a File object, parses, applies, syncs.
  - handleTextLoad(text): parses raw text, applies, syncs.

IMPLEMENTATION NOTES:
  - Commented-out lines (! KEY VALUE) for advanced/optional parameters
    are also parsed — the leading '!' and any whitespace are stripped,
    then the KEY VALUE pair is processed normally.  This allows loading
    files that include the commented TS05_W1..W6, T96_TILT, TA15_*, etc.
  - Unknown keywords are silently ignored (forward compatibility).
  - After applying state, syncAllUI() re-runs the same boot sequence
    as init() to guarantee visual consistency.

LAST UPDATED: 2026-03-01
=====================================================================
*/

/* ═══════════════════════════════════════════════════════════════════
   1. PARSER — AMPS_PARAM.in text → keyword map
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Parse an AMPS_PARAM.in file into a flat keyword→value map.
 *
 * Handles:
 *   - Section headers (#SECTION_NAME) → tracked but not stored as values
 *   - Active lines:    KEYWORD  value  ! optional comment
 *   - Commented lines: ! KEYWORD  value  (advanced/optional params)
 *   - POINTS_BEGIN / POINTS_END block → stored as __POINTS_BLOCK array
 *   - ENERGY_BINS with space-separated values → stored as __ENERGY_BINS array
 *
 * @param {string} text — raw file contents
 * @returns {Object} — { keyword: string_value, __POINTS_BLOCK: string[], __section: string }
 */
function parseParamFile(text) {
  const kv = {};
  const lines = text.split(/\r?\n/);
  let section = '';
  let inPointsBlock = false;
  const pointsLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    /* ── POINTS_BEGIN / POINTS_END block ── */
    if (/^\s*POINTS_BEGIN\s*$/i.test(line)) {
      inPointsBlock = true;
      continue;
    }
    if (/^\s*POINTS_END\s*$/i.test(line)) {
      inPointsBlock = false;
      continue;
    }
    if (inPointsBlock) {
      /* Strip the leading POINT keyword if present */
      const stripped = line.replace(/^\s*POINT\s+/i, '').trim();
      if (stripped && !stripped.startsWith('!')) {
        pointsLines.push(stripped);
      }
      continue;
    }

    /* ── Skip pure decorative lines (═══, blank) ── */
    if (/^\s*$/.test(line)) continue;
    if (/^\s*!\s*[═─]+/.test(line)) continue;

    /* ── Section headers ── */
    const secMatch = line.match(/^\s*#(\w+)/);
    if (secMatch) {
      section = secMatch[1];
      continue;
    }

    /* ── Commented-out parameter lines ──
     *  Format: ! KEYWORD  value  ! description
     *  We try to recover these advanced/optional params. */
    const commentedParam = line.match(/^\s*!\s+([A-Z][A-Z0-9_]+)\s+(.*)/);
    if (commentedParam) {
      const key = commentedParam[1].trim();
      let val = commentedParam[2].trim();
      /* Strip trailing inline comment */
      val = val.replace(/\s*!.*$/, '').trim();
      if (val && key.length > 2) {
        /* Only store if we don't already have an active (non-commented) version */
        if (!(key in kv)) {
          kv[key] = val;
        }
      }
      continue;
    }

    /* ── Pure comment lines (descriptions, not params) ── */
    if (/^\s*!/.test(line)) continue;

    /* ── Active keyword=value lines ──
     *  Format: KEYWORD  value  ! optional comment
     *  Multiple whitespace separators; first token is keyword, rest until
     *  '!' is the value (may include spaces for ENERGY_BINS). */
    const paramMatch = line.match(/^\s*([A-Z][A-Z0-9_]+)\s+(.*)/);
    if (paramMatch) {
      const key = paramMatch[1].trim();
      let val = paramMatch[2].trim();
      /* Strip trailing inline comment */
      val = val.replace(/\s*!.*$/, '').trim();
      kv[key] = val;
    }
  }

  if (pointsLines.length > 0) {
    kv.__POINTS_BLOCK = pointsLines;
  }
  kv.__section = section;

  return kv;
}


/* ═══════════════════════════════════════════════════════════════════
   2. STATE APPLICATOR — keyword map → S properties
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Apply parsed keywords to the global state object S.
 *
 * Type coercion rules:
 *   - Numbers:  parseFloat / parseInt as appropriate
 *   - Booleans: 'T'/'YES' → true, 'F'/'NO' → false
 *   - Strings:  stored as-is
 *   - Arrays:   space-separated → split and map to numbers
 *
 * @param {Object} kv — keyword map from parseParamFile()
 */
function applyParsedState(kv) {

  /* ── Helper: safe number parse ── */
  const num = (k, fallback) => {
    if (!(k in kv)) return fallback;
    const v = parseFloat(kv[k]);
    return isFinite(v) ? v : fallback;
  };
  const int = (k, fallback) => {
    if (!(k in kv)) return fallback;
    const v = parseInt(kv[k], 10);
    return isFinite(v) ? v : fallback;
  };
  const str = (k, fallback) => (k in kv) ? kv[k] : fallback;
  const bool = (k, fallback) => {
    if (!(k in kv)) return fallback;
    const v = kv[k].toUpperCase();
    return (v === 'T' || v === 'YES' || v === 'TRUE');
  };

  /* ── Step 1: Run Info ── */
  S.runName     = str('RUN_ID',       S.runName);
  S.piName      = str('PI_NAME',      S.piName);
  S.piEmail     = str('PI_EMAIL',     S.piEmail);

  /* ── Step 2: Calculation Mode ── */
  S.calcQuantity = str('CALC_TARGET',       S.calcQuantity);
  S.fieldMethod  = str('FIELD_EVAL_METHOD', S.fieldMethod);

  /* Grid parameters (GRID_3D) */
  S.gridNx   = int('GRID_NX',   S.gridNx);
  S.gridNy   = int('GRID_NY',   S.gridNy);
  S.gridNz   = int('GRID_NZ',   S.gridNz);
  S.gridXmin = num('GRID_XMIN', S.gridXmin);
  S.gridXmax = num('GRID_XMAX', S.gridXmax);
  S.gridYmin = num('GRID_YMIN', S.gridYmin);
  S.gridYmax = num('GRID_YMAX', S.gridYmax);
  S.gridZmin = num('GRID_ZMIN', S.gridZmin);
  S.gridZmax = num('GRID_ZMAX', S.gridZmax);

  /* Cutoff rigidity parameters */
  S.cutoffEmin         = num('CUTOFF_EMIN',           S.cutoffEmin);
  S.cutoffEmax         = num('CUTOFF_EMAX',           S.cutoffEmax);
  S.cutoffMaxParticles = int('CUTOFF_MAX_PARTICLES',  S.cutoffMaxParticles);
  S.cutoffNenergy      = int('CUTOFF_NENERGY',        S.cutoffNenergy);

  /* Density 3-D parameters */
  S.densEmin          = num('DENS_EMIN',            S.densEmin);
  S.densEmax          = num('DENS_EMAX',            S.densEmax);
  S.densNenergy       = int('DENS_NENERGY',         S.densNenergy);
  S.densEnergySpacing = str('DENS_ENERGY_SPACING',  S.densEnergySpacing);

  /* ── Step 3: Particle Species ── */
  const rawSpecies = str('SPECIES', '').toLowerCase();
  if (rawSpecies === 'proton' || rawSpecies === 'h+' || rawSpecies === 'h') {
    S.species = 'proton'; S.charge = 1; S.mass = 1.0073;
  } else if (rawSpecies === 'helium' || rawSpecies === 'he2+' || rawSpecies === 'he') {
    S.species = 'helium'; S.charge = 2; S.mass = 4.0026;
  } else if (rawSpecies === 'electron' || rawSpecies === 'e-' || rawSpecies === 'e') {
    S.species = 'electron'; S.charge = -1; S.mass = 0.000549;
  } else if (rawSpecies) {
    S.species = 'custom';
  }
  if ('CHARGE' in kv)    S.charge = int('CHARGE', S.charge);
  if ('MASS_AMU' in kv)  S.mass   = num('MASS_AMU', S.mass);

  /* ── Step 4: Background B-Field ── */
  S.fieldModel = str('FIELD_MODEL', S.fieldModel);

  /* Generic driving parameters (emitted by buildReview for all models) */
  S.dst   = num('DST',    S.dst);
  S.pdyn  = num('PDYN',   S.pdyn);
  S.bz    = num('IMF_BZ', S.bz);
  S.vx    = num('SW_VX',  S.vx);
  S.nsw   = num('SW_N',   S.nsw);
  S.by    = num('IMF_BY', S.by);
  S.bx    = num('IMF_BX', S.bx);
  S.epoch = str('EPOCH',  S.epoch);

  /* TS05 advanced (commented-out in generated file) */
  S.ts05TiltRad = num('TS05_TILT_RAD', S.ts05TiltRad);
  S.ts05ImfFlag = int('TS05_IMFFLAG',  S.ts05ImfFlag);
  S.ts05SwFlag  = int('TS05_ISWFLAG',  S.ts05SwFlag);
  S.ts05W1      = num('TS05_W1', S.ts05W1);
  S.ts05W2      = num('TS05_W2', S.ts05W2);
  S.ts05W3      = num('TS05_W3', S.ts05W3);
  S.ts05W4      = num('TS05_W4', S.ts05W4);
  S.ts05W5      = num('TS05_W5', S.ts05W5);
  S.ts05W6      = num('TS05_W6', S.ts05W6);

  /* T96 advanced */
  if ('T96_TILT_DEG' in kv) S.t96Tilt = num('T96_TILT_DEG', S.t96Tilt);

  /* Sync generic drivers → model-specific state for T96/T01 */
  S.t96Dst  = S.dst;   S.t96Pdyn = S.pdyn;
  S.t96By   = S.by;    S.t96Bz   = S.bz;

  /* T01 advanced */
  if ('T01_TILT_DEG' in kv) S.t01Tilt = num('T01_TILT_DEG', S.t01Tilt);
  S.t01G1    = num('T01_G1', S.t01G1);
  S.t01G2    = num('T01_G2', S.t01G2);
  S.t01Epoch = str('T01_EPOCH', S.t01Epoch);
  S.t01Dst   = S.dst;  S.t01Pdyn = S.pdyn;
  S.t01By    = S.by;   S.t01Bz   = S.bz;

  /* TA15 advanced */
  S.ta15Bx       = num('TA15_BX_GSW',    S.ta15Bx);
  S.ta15By       = num('TA15_BY_GSW',    S.ta15By);
  S.ta15Bz       = num('TA15_BZ_GSW',    S.ta15Bz);
  S.ta15Vx       = num('TA15_VX_GSE',    S.ta15Vx);
  S.ta15Vy       = num('TA15_VY_GSE',    S.ta15Vy);
  S.ta15Vz       = num('TA15_VZ_GSE',    S.ta15Vz);
  S.ta15Np       = num('TA15_NP',        S.ta15Np);
  S.ta15Temp     = num('TA15_T_K',       S.ta15Temp);
  S.ta15SymH     = num('TA15_SYMH',      S.ta15SymH);
  S.ta15ImfFlag  = int('TA15_IMF_FLAG',  S.ta15ImfFlag);
  S.ta15SwFlag   = int('TA15_SW_FLAG',   S.ta15SwFlag);
  S.ta15TiltRad  = num('TA15_TILT_RAD',  S.ta15TiltRad);
  S.ta15Pdyn     = num('TA15_PDYN',      S.ta15Pdyn);
  S.ta15Nidx     = num('TA15_N_INDEX',   S.ta15Nidx);
  S.ta15Bidx     = num('TA15_B_INDEX',   S.ta15Bidx);
  S.ta15Epoch    = str('TA15_EPOCH',     S.ta15Epoch);

  /* TA16RBF advanced */
  S.ta16Bx       = num('TA16_BX_GSW',    S.ta16Bx);
  S.ta16By       = num('TA16_BY_GSW',    S.ta16By);
  S.ta16Bz       = num('TA16_BZ_GSW',    S.ta16Bz);
  S.ta16Vx       = num('TA16_VX_GSE',    S.ta16Vx);
  S.ta16Vy       = num('TA16_VY_GSE',    S.ta16Vy);
  S.ta16Vz       = num('TA16_VZ_GSE',    S.ta16Vz);
  S.ta16Np       = num('TA16_NP',        S.ta16Np);
  S.ta16Temp     = num('TA16_T_K',       S.ta16Temp);
  S.ta16SymH     = num('TA16_SYMH',      S.ta16SymH);
  S.ta16ImfFlag  = int('TA16_IMF_FLAG',  S.ta16ImfFlag);
  S.ta16SwFlag   = int('TA16_SW_FLAG',   S.ta16SwFlag);
  S.ta16TiltRad  = num('TA16_TILT_RAD',  S.ta16TiltRad);
  S.ta16Pdyn     = num('TA16_PDYN',      S.ta16Pdyn);
  S.ta16Nidx     = num('TA16_N_INDEX',   S.ta16Nidx);
  S.ta16Bidx     = num('TA16_B_INDEX',   S.ta16Bidx);
  S.ta16SymHc    = num('TA16_SYMHC',     S.ta16SymHc);
  S.ta16Epoch    = str('TA16_EPOCH',     S.ta16Epoch);

  /* ── Step 5: Domain Boundary ── */
  S.boundaryType = str('BOUNDARY_TYPE', S.boundaryType);

  if (S.boundaryType === 'BOX') {
    S.boxXmax   = num('DOMAIN_X_MAX', S.boxXmax);
    S.boxXmin   = num('DOMAIN_X_MIN', S.boxXmin);
    S.boxYmax   = num('DOMAIN_Y_MAX', S.boxYmax);
    S.boxYmin   = num('DOMAIN_Y_MIN', S.boxYmin);
    S.boxZmax   = num('DOMAIN_Z_MAX', S.boxZmax);
    S.boxZmin   = num('DOMAIN_Z_MIN', S.boxZmin);
    S.boxRinner = num('R_INNER',      S.boxRinner);
  } else {
    /* Shue boundary */
    const shueR0Raw = str('SHUE_R0', 'AUTO');
    const shueAlRaw = str('SHUE_ALPHA', 'AUTO');
    if (shueR0Raw.toUpperCase() === 'AUTO') {
      S.shueMode  = 'auto';
      S.shueR0    = null;
      S.shueAlpha = null;
    } else {
      S.shueMode  = 'manual';
      S.shueR0    = parseFloat(shueR0Raw) || null;
      S.shueAlpha = parseFloat(shueAlRaw) || null;
    }
    S.xtail       = num('DOMAIN_X_TAIL', S.xtail);
    S.shueRinner  = num('R_INNER',       S.shueRinner);
  }

  /* ── Step 6: Electric Field ──
   *  The generated file emits COROTATION_E and CONV_E_MODEL.
   *  In GRIDLESS mode these are set to NO / NONE by constraint logic,
   *  but we still parse whatever the file says. */
  S.eFieldCoro      = bool('COROTATION_E', S.eFieldCoro);
  S.eFieldConvModel = str('CONV_E_MODEL',  S.eFieldConvModel);

  /* Volland-Stern parameters (may appear in comment block) */
  const vsKpRaw = str('VS_KP', '');
  if (vsKpRaw.toUpperCase() === 'AUTO') {
    S.vsKpMode = 'auto';
  } else if (vsKpRaw) {
    S.vsKpMode = 'manual';
    S.vsKp = parseFloat(vsKpRaw) || S.vsKp;
  }
  S.vsGamma = num('VS_GAMMA', S.vsGamma);

  /* ── Step 7: Temporal ── */
  S.tempMode   = str('TEMPORAL_MODE', S.tempMode);
  S.eventStart = str('EVENT_START',   S.eventStart);
  S.eventEnd   = str('EVENT_END',     S.eventEnd);
  S.fieldDt    = num('FIELD_UPDATE_DT', S.fieldDt);
  S.injectDt   = num('INJECT_DT',      S.injectDt);

  const tsInput = str('TS_INPUT_MODE', '');
  if (tsInput === 'OMNIWEB')      S.tsSource = 'omni';
  else if (tsInput === 'FILE')    S.tsSource = 'file';
  else if (tsInput === 'SCALAR')  S.tsSource = 'scalar';

  /* ── Step 8: Spectrum ── */
  S.specType = str('SPECTRUM_TYPE', S.specType);

  /* Common spectrum parameters (appear for all types) */
  S.specJ0    = num('SPEC_J0',    S.specJ0);
  S.specGamma = num('SPEC_GAMMA', S.specGamma);
  S.specE0    = num('SPEC_E0',    S.specE0);
  S.specEmin  = num('SPEC_EMIN',  S.specEmin);
  S.specEmax  = num('SPEC_EMAX',  S.specEmax);

  /* Power-law cutoff */
  S.specEc = num('SPEC_EC', S.specEc);

  /* LIS + Force-Field */
  S.specLisJ0    = num('SPEC_LIS_J0',    S.specLisJ0);
  S.specLisGamma = num('SPEC_LIS_GAMMA', S.specLisGamma);
  S.specPhi      = num('SPEC_PHI',        S.specPhi);

  /* Band function — SPEC_GAMMA1 / SPEC_GAMMA2 are DOM-read by drawSpec,
   * so we store them temporarily to push into DOM later */
  if ('SPEC_GAMMA1' in kv) kv.__bandGamma1 = num('SPEC_GAMMA1', 3.5);
  if ('SPEC_GAMMA2' in kv) kv.__bandGamma2 = num('SPEC_GAMMA2', 1.5);

  /* ── Step 9: Output Domain ── */
  S.outputMode = str('OUTPUT_MODE', S.outputMode);
  S.fluxDt     = num('FLUX_DT',    S.fluxDt);

  /* Points block */
  if (kv.__POINTS_BLOCK && kv.__POINTS_BLOCK.length > 0) {
    S.pointsText = kv.__POINTS_BLOCK.join('\n');
    S.outputMode = 'POINTS';
  }

  /* Shells */
  if ('SHELL_COUNT' in kv) {
    S.shellCount  = int('SHELL_COUNT', S.shellCount);
    S.shellResDeg = int('SHELL_RES_DEG', S.shellResDeg);
    const altsStr = str('SHELL_ALTS_KM', '');
    if (altsStr) {
      S.shellAltsKm = altsStr.trim().split(/\s+/).map(Number).filter(isFinite);
    }
    S.outputMode = 'SHELLS';
  }

  /* ── Step 10: Output Options ── */
  S.fluxType     = str('FLUX_TYPE',     S.fluxType);
  S.outputCutoff = bool('OUTPUT_CUTOFF', S.outputCutoff);
  S.outputPitch  = bool('OUTPUT_PITCH',  S.outputPitch);
  S.outputFormat = str('OUTPUT_FORMAT',  S.outputFormat);
  S.outputCoords = str('OUTPUT_COORDS',  S.outputCoords);

  /* Energy bins — space-separated list */
  const binsStr = str('ENERGY_BINS', '');
  if (binsStr) {
    const bins = binsStr.trim().split(/\s+/).map(Number).filter(v => isFinite(v) && v > 0);
    if (bins.length > 0) S.energyBins = bins;
  }

  return kv;
}


/* ═══════════════════════════════════════════════════════════════════
   3. UI SYNC — push restored S into all DOM elements
   ═══════════════════════════════════════════════════════════════════ */

/**
 * After S has been populated from a loaded file, this function pushes
 * every value into the corresponding DOM input and triggers all the
 * card-selection, diagram, and preview update functions.
 *
 * Follows the same boot sequence as init() in js/09-init.js but is
 * safe to call at any time.
 *
 * @param {Object} [kv] — optional parsed keyword map (for Band params etc.)
 */
function syncAllUI(kv) {
  kv = kv || {};

  /* ══════════════════════════════════════════════════════════
     Step 1: Run Info — push text values into input fields
     ══════════════════════════════════════════════════════════ */
  const setVal = (id, val) => { const el = $(id); if (el) el.value = val; };

  setVal('run-name', S.runName  || '');
  setVal('pi-name',  S.piName   || '');
  setVal('pi-email', S.piEmail  || '');
  setVal('pi-inst',  S.institution || '');

  /* ══════════════════════════════════════════════════════════
     Step 2: Calculation Mode
     ══════════════════════════════════════════════════════════ */
  /* Select calc target card */
  const calcCardIds = {
    CUTOFF_RIGIDITY: 'calc-cutoff-card',
    FLUX:            'calc-flux-card',
    DENSITY_3D:      'calc-density-card'
  };
  const calcCardId = calcCardIds[S.calcQuantity];
  if (calcCardId) {
    setCalcQuantity(S.calcQuantity, $(calcCardId));
  }

  /* Select field method card */
  if (S.fieldMethod === 'GRID_3D') {
    setFieldMethod('GRID_3D', $('fm-grid3d-card'));
  } else {
    setFieldMethod('GRIDLESS', $('fm-gridless-card'));
  }

  /* Grid dimensions */
  setVal('grid-nx', S.gridNx);
  setVal('grid-ny', S.gridNy);
  setVal('grid-nz', S.gridNz);
  setVal('grid-xmin', S.gridXmin);
  setVal('grid-xmax', S.gridXmax);
  setVal('grid-ymin', S.gridYmin);
  setVal('grid-ymax', S.gridYmax);
  setVal('grid-zmin', S.gridZmin);
  setVal('grid-zmax', S.gridZmax);
  if (typeof gridParamChange === 'function') gridParamChange();

  /* Cutoff parameters */
  setVal('cutoff-emin', S.cutoffEmin);
  setVal('cutoff-emax', S.cutoffEmax);
  setVal('cutoff-max-particles', S.cutoffMaxParticles);
  setVal('cutoff-nenergy', S.cutoffNenergy);
  if (typeof cutoffParamChange === 'function') cutoffParamChange();

  /* Density parameters */
  setVal('dens-emin', S.densEmin);
  setVal('dens-emax', S.densEmax);
  setVal('dens-nenergy', S.densNenergy);
  const densSpacingSel = $('dens-energy-spacing');
  if (densSpacingSel) densSpacingSel.value = S.densEnergySpacing;
  if (typeof densityParamChange === 'function') densityParamChange();

  /* ══════════════════════════════════════════════════════════
     Step 3: Particle + Background Field
     ══════════════════════════════════════════════════════════ */
  /* Species card */
  if (typeof selectSpecies === 'function') {
    const spCard = $(`sp-${S.species}`);
    selectSpecies(S.species, spCard);
  }
  /* Custom species inputs */
  setVal('charge-input', S.charge);
  setVal('mass-input', S.mass);

  /* Field model selection */
  if (typeof selectFieldModel === 'function') {
    selectFieldModel(S.fieldModel);
  }

  /* TS05 driver inputs */
  setVal('ts05-dst',   S.dst);
  setVal('ts05-pdyn',  S.pdyn);
  setVal('ts05-bz',    S.bz);
  setVal('ts05-epoch', S.epoch);
  setVal('ts05-vx',    S.vx);
  setVal('ts05-nsw',   S.nsw);
  setVal('ts05-by',    S.by);
  setVal('ts05-bx',    S.bx);
  if (typeof ts05Change === 'function') ts05Change();

  /* T96 driver inputs */
  setVal('t96-dst',   S.t96Dst);
  setVal('t96-pdyn',  S.t96Pdyn);
  setVal('t96-bz',    S.t96Bz);
  setVal('t96-epoch', S.t96Epoch || S.epoch);
  setVal('t96-by',    S.t96By);
  setVal('t96-tilt',  S.t96Tilt);
  if (typeof t96Change === 'function') t96Change();

  /* T01 driver inputs */
  setVal('t01-dst',   S.t01Dst);
  setVal('t01-pdyn',  S.t01Pdyn);
  setVal('t01-bz',    S.t01Bz);
  setVal('t01-by',    S.t01By);
  setVal('t01-tilt',  S.t01Tilt);
  setVal('t01-g1',    S.t01G1);
  setVal('t01-g2',    S.t01G2);
  if (typeof t01Change === 'function') t01Change();

  /* TA15 driver inputs */
  setVal('ta15-bx-gsw',  S.ta15Bx);
  setVal('ta15-by-gsw',  S.ta15By);
  setVal('ta15-bz-gsw',  S.ta15Bz);
  setVal('ta15-vx-gse',  S.ta15Vx);
  setVal('ta15-vy-gse',  S.ta15Vy);
  setVal('ta15-vz-gse',  S.ta15Vz);
  setVal('ta15-np',      S.ta15Np);
  setVal('ta15-temp',    S.ta15Temp);
  setVal('ta15-symh',    S.ta15SymH);
  setVal('ta15-pdyn',    S.ta15Pdyn);
  setVal('ta15-nidx',    S.ta15Nidx);
  setVal('ta15-bidx',    S.ta15Bidx);
  if (typeof ta15Change === 'function') ta15Change();

  /* ══════════════════════════════════════════════════════════
     Step 5: Domain Boundary
     ══════════════════════════════════════════════════════════ */
  if (typeof bndSet === 'function') {
    bndSet(S.boundaryType);
  }

  if (S.boundaryType === 'BOX') {
    setVal('box-xmax',   S.boxXmax);
    setVal('box-xmin',   S.boxXmin);
    setVal('box-ymax',   S.boxYmax);
    setVal('box-ymin',   S.boxYmin);
    setVal('box-zmax',   S.boxZmax);
    setVal('box-zmin',   S.boxZmin);
    setVal('box-rinner', S.boxRinner);
    if (typeof bndBoxUpdate === 'function') bndBoxUpdate();
  } else {
    if (typeof shueMode === 'function') shueMode(S.shueMode);
    if (S.shueMode === 'manual') {
      setVal('shue-r0-in',   S.shueR0);
      setVal('shue-alpha-in', S.shueAlpha);
    }
    setVal('shue-rinner', S.shueRinner);
    setVal('shue-xtail',  S.xtail);
    if (typeof bndShueUpdate === 'function') bndShueUpdate();
  }

  /* ══════════════════════════════════════════════════════════
     Step 6: Electric Field
     ══════════════════════════════════════════════════════════ */
  if (typeof setCorotation === 'function') {
    setCorotation(S.eFieldCoro);
  }
  if (typeof setConvModel === 'function') {
    setConvModel(S.eFieldConvModel);
  }
  if (typeof setVsKpMode === 'function') {
    setVsKpMode(S.vsKpMode);
  }
  setVal('vs-kp-input', S.vsKp);
  setVal('vs-gamma',    S.vsGamma);
  if (typeof vsParamChange === 'function') vsParamChange();

  /* ══════════════════════════════════════════════════════════
     Step 7: Temporal
     ══════════════════════════════════════════════════════════ */
  if (typeof setTempMode === 'function') {
    setTempMode(S.tempMode);
  }
  setVal('event-start',      S.eventStart);
  setVal('event-end',        S.eventEnd);
  setVal('field-update-dt',  S.fieldDt);
  setVal('inject-dt',        S.injectDt);
  if (typeof checkDtPair === 'function') checkDtPair();

  /* ══════════════════════════════════════════════════════════
     Step 8: Spectrum
     ══════════════════════════════════════════════════════════ */
  /* Select the spectrum type card */
  const specCardMap = {
    POWER_LAW:        'sc-pl',
    POWER_LAW_CUTOFF: 'sc-plc',
    LIS_FORCE_FIELD:  'sc-lis',
    BAND:             'sc-band',
    TABLE:            'sc-table'
  };
  const scId = specCardMap[S.specType];
  if (scId && typeof setSpec === 'function') {
    setSpec(S.specType, $(scId));
  }

  /* Power-law inputs */
  setVal('spec-j0',    S.specJ0);
  setVal('spec-gamma', S.specGamma);
  setVal('spec-e0',    S.specE0);

  /* Power-law cutoff inputs */
  setVal('plc-j0',    S.specJ0);
  setVal('plc-gamma', S.specGamma);
  setVal('plc-e0',    S.specE0);
  setVal('spec-ec',   S.specEc);

  /* LIS + Force-Field inputs */
  setVal('lis-j0',    S.specLisJ0);
  setVal('lis-gamma', S.specLisGamma);
  setVal('lis-e0',    S.specE0);
  setVal('spec-phi',  S.specPhi);

  /* Band function inputs */
  if (kv.__bandGamma1 != null) setVal('band-gamma1', kv.__bandGamma1);
  if (kv.__bandGamma2 != null) setVal('band-gamma2', kv.__bandGamma2);
  setVal('band-j0', S.specJ0);
  setVal('band-e0', S.specE0);

  /* Energy range */
  setVal('spec-emin', S.specEmin);
  setVal('spec-emax', S.specEmax);

  if (typeof drawSpec === 'function') drawSpec();

  /* ══════════════════════════════════════════════════════════
     Step 9: Output Domain
     ══════════════════════════════════════════════════════════ */
  const modeCardMap = {
    POINTS:     'mc-points',
    TRAJECTORY: 'mc-traj',
    SHELLS:     'mc-shells'
  };
  const mcId = modeCardMap[S.outputMode];
  if (mcId && typeof setMode === 'function') {
    setMode(S.outputMode, $(mcId));
  }
  setVal('flux-dt', S.fluxDt);

  /* Points text */
  setVal('points-text', S.pointsText || '');

  /* Shells */
  setVal('shell-count',   S.shellCount);
  setVal('shell-res-deg', S.shellResDeg);
  if (Array.isArray(S.shellAltsKm)) {
    for (let i = 0; i < 5; i++) {
      setVal(`shell-alt-${i + 1}`, S.shellAltsKm[i] != null ? S.shellAltsKm[i] : '');
    }
  }
  if (typeof updateShells === 'function') updateShells();

  /* ══════════════════════════════════════════════════════════
     Step 10: Output Options
     ══════════════════════════════════════════════════════════ */
  /* Flux type buttons */
  if (typeof setFluxType === 'function') {
    const ftBtn = document.querySelector(`.flux-type-btn[data-type="${S.fluxType}"]`);
    setFluxType(S.fluxType, ftBtn);
  }

  /* Checkboxes */
  const ocEl = $('output-cutoff');
  if (ocEl) ocEl.checked = S.outputCutoff;
  const opEl = $('output-pitch');
  if (opEl) opEl.checked = S.outputPitch;

  /* Selects */
  setVal('output-format', S.outputFormat);
  setVal('output-coords', S.outputCoords);

  /* Energy bins */
  if (typeof renderBins === 'function') renderBins();

  /* ══════════════════════════════════════════════════════════
     Global refresh: diagrams, sidebar, constraints
     ══════════════════════════════════════════════════════════ */
  /* Recompute VS Kp from Dst */
  if (typeof dstToKp === 'function') {
    S.vsKp = S.vsKpMode === 'auto' ? dstToKp(S.dst) : S.vsKp;
    S.vsA  = vsIntensityA(S.vsKp);
    const kpd = $('vs-kp-auto-display');
    if (kpd) kpd.textContent = S.vsKp.toFixed(1);
  }

  /* SVG diagrams */
  if (typeof drawSvgGrid === 'function') {
    drawSvgGrid('shue-grid');
    drawSvgGrid('box-grid');
  }
  if (typeof bndShueUpdate === 'function') bndShueUpdate();
  if (typeof drawEfieldSchematic === 'function') drawEfieldSchematic();

  /* Constraint propagation */
  if (typeof applyFieldMethodConstraints === 'function') {
    applyFieldMethodConstraints();
  }

  /* Sidebar + progress */
  if (typeof updateSidebar === 'function') updateSidebar();

  /* Mark all steps as done so the user can freely navigate */
  for (let i = 1; i <= 10; i++) S.done.add(i);
}


/* ═══════════════════════════════════════════════════════════════════
   4. FILE LOADING — UI and file I/O
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Show the load-file modal overlay.
 * The modal supports:
 *   - File picker (click or drag-and-drop)
 *   - Paste from clipboard
 */
function showLoadModal() {
  const m = $('load-modal');
  if (m) m.style.display = 'flex';
  /* Reset error and paste area state */
  const err = $('load-error');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  const ta = $('load-paste-area');
  if (ta) { ta.style.display = 'none'; ta.value = ''; }
  const applyBtn = $('load-paste-apply');
  if (applyBtn) applyBtn.style.display = 'none';
}

/** Hide the load modal. */
function hideLoadModal() {
  const m = $('load-modal');
  if (m) m.style.display = 'none';
}

/**
 * Handle a loaded File object: read its text and apply.
 * @param {File} file
 */
function handleFileLoad(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    handleTextLoad(text, file.name);
  };
  reader.readAsText(file);
}

/**
 * Handle loaded text (from file or paste): parse, apply, sync, navigate.
 * @param {string} text — raw AMPS_PARAM.in contents
 * @param {string} [filename] — original filename for display
 */
function handleTextLoad(text, filename) {
  if (!text || !text.trim()) return;

  /* Clear previous error */
  const loadErr = $('load-error');
  if (loadErr) { loadErr.style.display = 'none'; loadErr.textContent = ''; }

  /* Quick sanity check: does it look like an AMPS param file? */
  if (!/#(RUN_INFO|BACKGROUND_FIELD|PARTICLE|CALCULATION_MODE|END)/i.test(text)) {
    const loadErr = $('load-error');
    if (loadErr) {
      loadErr.textContent = 'This does not appear to be a valid AMPS_PARAM.in file (no recognized #SECTION headers found).';
      loadErr.style.display = 'block';
    }
    return;
  }

  /* Parse and apply */
  const kv = parseParamFile(text);
  applyParsedState(kv);
  syncAllUI(kv);

  /* Close modal */
  hideLoadModal();

  /* Show success toast */
  showLoadToast(filename || 'AMPS_PARAM.in');

  /* Navigate to Step 1 so the user can begin reviewing */
  goStep(1);
}

/**
 * Brief success notification after a file is loaded.
 * @param {string} name — filename
 */
function showLoadToast(name) {
  /* Remove any existing toast */
  const existing = document.getElementById('load-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'load-toast';
  toast.className = 'load-toast';
  toast.innerHTML = `<span style="font-size:16px;">✅</span> <b>${name}</b> loaded — all wizard steps updated.  <span style="color:var(--text-dim);font-size:11px;">Review each step, then proceed to Submit.</span>`;
  document.body.appendChild(toast);

  /* Auto-remove after 6 seconds */
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 6000);
}


/* ═══════════════════════════════════════════════════════════════════
   5. DRAG-AND-DROP + PASTE HANDLERS (wired by initLoadUI)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Initialize the load modal's drag-and-drop and paste event handlers.
 * Called from the DOMContentLoaded listener appended at the end.
 */
function initLoadUI() {
  const dropzone = $('load-dropzone');
  if (!dropzone) return;

  /* ── Drag events ── */
  dropzone.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('drag-over');
  });
  dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileLoad(files[0]);
  });

  /* ── Click to open file picker ── */
  dropzone.addEventListener('click', function () {
    const inp = $('load-file-input');
    if (inp) inp.click();
  });

  /* ── File input change ── */
  const finp = $('load-file-input');
  if (finp) {
    finp.addEventListener('change', function () {
      if (this.files.length > 0) handleFileLoad(this.files[0]);
      this.value = ''; /* reset so same file can be re-loaded */
    });
  }

  /* ── Paste button ── */
  const pasteBtn = $('load-paste-btn');
  if (pasteBtn) {
    pasteBtn.addEventListener('click', function () {
      const ta = $('load-paste-area');
      const applyBtn = $('load-paste-apply');
      if (ta) {
        const show = ta.style.display === 'none';
        ta.style.display = show ? 'block' : 'none';
        if (applyBtn) applyBtn.style.display = show ? 'block' : 'none';
        if (show) ta.focus();
      }
    });
  }

  /* ── Paste apply button ── */
  const applyPasteBtn = $('load-paste-apply');
  if (applyPasteBtn) {
    applyPasteBtn.addEventListener('click', function () {
      const ta = $('load-paste-area');
      if (ta && ta.value.trim()) {
        handleTextLoad(ta.value.trim(), 'pasted_input');
        ta.value = '';
      }
    });
  }
}

/* Boot load UI when DOM is ready */
document.addEventListener('DOMContentLoaded', function () {
  initLoadUI();

  /* ── Escape key closes modal ── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideLoadModal();
  });

  /* ── Click outside modal content closes modal ── */
  const modal = $('load-modal');
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) hideLoadModal();
    });
  }
});
