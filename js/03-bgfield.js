/*
=====================================================================
FILE: js/03-bgfield.js
INTENT:
  JavaScript logic for the AMPS web wizard (static site). This module
  implements a focused part of the UI: state updates, model selection,
  preview rendering, or navigation.

METHODS / DESIGN:
  - Reads/writes the shared state object `S` (defined in js/01-state.js).
  - Uses direct DOM manipulation (no framework) for portability.
  - Functions are intentionally small and side-effectful: they update `S`
    and then update the DOM so the UI always reflects the current state.

IMPLEMENTATION NOTES:
  - Prefer pure helpers for formatting and mapping, but keep UI updates
    local so it’s clear which elements are affected.
  - Avoid introducing new global names unless necessary; when you do,
    document them here and in-line.
  - Keep behavior consistent between modular (index.html + js/*.js) and
    standalone (AMPS_Interface.html) entrypoints.

LAST UPDATED: 2026-02-21
=====================================================================
*/
/* =============================================================================
   FILE:    js/03-bgfield.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Step 1 (Run Info), Step 2 (Particle Species), and
            Step 3 (Background Magnetic Field Model) handlers.

   BACKGROUND FIELD MODELS SUPPORTED
     TS05  — Tsyganenko & Sitnov (2005).
             8 scalar drivers: Dst, Pdyn, Bz, Vx, Nsw, By, Bx, epoch.
             Best accuracy for storm-time SEP runs.
             Directly couples to Shue boundary auto-compute (Step 4)
             and Weimer E-field auto-mode (Step 5).
             FIELD_MODEL = TS05

     TS04  — Tsyganenko & Sitnov (2004) storm-time model.
             FIELD_MODEL = TS04

     T96   — Tsyganenko (1996).
             Drivers: Dst, Pdyn, IMF By/Bz, dipole tilt.
             FIELD_MODEL = T96

     T01   — Tsyganenko (2001) model family.
             Similar driver set; coefficient-set selection in backend.
             FIELD_MODEL = T01

     TS07D — Tsyganenko & Sitnov (2007D) time-dependent coefficients.
             Typically provided as yearly coefficient files.
             FIELD_MODEL = TS07D

     TA15  — Tsyganenko & Andreeva (2015).
             Most complete empirical model; additionally requires
             GOES geostationary total-B (|B| ≥ 50 nT typical).
             FIELD_MODEL = TA15

     BATSRUS — Block-Adaptive Tree Solar-wind Roe Upwind Scheme
               (Powell et al. 1999).  Upload 3-D CCMC run output (.cdf / .h5).
               AMPS tri-linearly interpolates B onto particle positions.
               FIELD_MODEL = BATSRUS

     GAMERA  — Grid Agnostic MHD for Extended Research Applications
               (Sorathia et al. 2020).  High-resolution curvilinear-mesh.
               Upload GAMERA .h5 output.  Beta support.
               FIELD_MODEL = GAMERA

   PUBLIC API (called from HTML)
     liveUpdate()            — sync Step 1 text fields to S on keyup
     goalHint(v)             — show/hide goal hint text
     charCount(el,cid,max)   — live character counter for textareas
     selectSpecies(key,card) — choose particle species
     updateRigidity()        — recompute and display rigidity range
     selectFieldModel(model) — switch active model card + show its form
     ts05Change()            — sync TS05/TS04 inputs → S + update KW
     t96Change()             — sync T96 inputs → S
     t01Change()             — sync T01 inputs → S
     ts07dChange()           — sync TS07D coefficient inputs → S
     ta15Change()            — sync TA15 inputs → S
     mhdChange()             — sync MHD file-upload inputs → S
     validateTs05()          — flag out-of-range TS05 parameter inputs
     updateKwPreview()       — refresh AMPS_PARAM.in keyword-preview strip

   DEPENDS ON: 01-state.js (S, $, set), 02-wizard.js (updateSidebar)
=============================================================================*/

/*
  CHANGELOG (Feb 2026) — Step 3 "Bkg B-Field" implementation

  Summary of modifications in this file:
    1) Normalized the empirical field-model list to a standard Tsyganenko-family
       set used by CCMC/GEOPACK toolchains: TS05, TS04, T96, T01, TS07D, TA15.
       Retained file-driven MHD options: BATSRUS and GAMERA.

    2) Implemented model-specific driver forms + state synchronization:
       - TS05/TS04 share an 8-parameter storm-time driver UI (Dst, Pdyn, Bz,
         Vx, Nsw, By, Bx, epoch). These drivers are also used by downstream
         steps for boundary auto-compute (Shue) and E-field auto modes (Weimer).
       - T96/T01 use the common reduced driver set (Dst, Pdyn, IMF By/Bz,
         dipole tilt) to support robust parameter studies.
       - TS07D is coefficient-driven; UI selects coefficient source (OMNI-backed
         vs uploaded file) + epoch.
       - TA15 adds GOES geostationary |B| as an additional required input.

    3) Added validation + user guidance:
       - Range checks for Dst/Pdyn/Bz flag values outside typical usage.
       - A keyword preview strip is refreshed whenever a driver value changes.

  Maintenance tip:
    If you add another field model, make parallel updates in:
      - index.html (cards + driver forms)
      - js/01-state.js (defaults + state keys)
      - js/03-bgfield.js (selection + validation + keyword preview)
*/

/* ── STEP 1 — RUN INFO ──────────────────────────────────────────────── */

function liveUpdate(){
  S.runName = $('run-name')?.value||S.runName;
  updateSidebar();
}
function goalHint(v){
  const hints = {
    storm_validation: 'Compare AMPS-predicted cutoff rigidity with Van Allen Probe particle data during storm main phase.',
    gcr_baseline:     'Compute galactic cosmic ray fluxes at LEO under quiet geomagnetic conditions (Dst ≈ 0 nT).',
    sep_radiation:    'Quantify SEP fluence and dose at ISS altitude during a major solar particle event.',
    parameter_study:  'Systematic sensitivity study: vary Dst, Pdyn, and spectral index to map uncertainty space.',
    custom:           'Describe your science goal in the text area above.',
  };
  const el=$('goal-hint'); if(el) el.textContent = hints[v]||'';
}
function charCount(el,cid,max){
  const n=el.value.length, c=$(cid);
  if(c){ c.textContent=n+'/'+max;
    c.className='char-count'+(n>max*0.9?' near':'')+(n>max?' over':''); }
}

/* ══════════════════════════════════════════════════════════════════════════════
   STEP 2 — PARTICLE SPECIES SELECTION
   
   PURPOSE:
     Defines available particle species and handles species selection logic.
     Each AMPS simulation run traces ONE particle species backward in time
     from the magnetosphere boundary to determine where particles can access.
   
   AMPS KEYWORDS GENERATED:
     SPECIES  = species identifier string (e.g., 'proton', 'helium', 'custom')
     CHARGE   = charge state in elementary charges Z (e.g., +1, +2, -1)
     MASS_AMU = atomic mass in unified atomic mass units (e.g., 1.0073, 4.0026)
   
   DATA STRUCTURE:
     SPECIES object maps species keys to physical parameters:
       key: {
         Z:     Charge state in elementary charges [e]
         A:     Mass in atomic mass units [AMU]
         label: Display name with Unicode superscripts (cosmetic)
       }
   
   CURRENT SPECIES:
     - proton:  H⁺ proton (most common SEP particle)
     - helium:  He²⁺ alpha particle (second most common heavy ion)
     - custom:  User-defined ion with manual Z and A input
   
   EXTENSIBILITY:
     To add more predefined species (electrons, oxygen, iron, etc.):
     1. Add entry to SPECIES object below
     2. Add corresponding <div class="opt-card"> in index.html Step 2 panel
     3. Use same onclick="selectSpecies('key',this)" pattern
     4. See PARTICLE_SPECIES_EXTENSION_GUIDE.md for detailed tutorial
   
   PHYSICS NOTES:
     - 1 AMU = 1.66054 × 10⁻²⁷ kg (1/12 mass of ¹²C atom)
     - Electron mass = 0.000549 AMU = 9.109 × 10⁻³¹ kg
     - Charge state Z determines trajectory curvature: F = q(v × B)
     - Mass A determines inertia and energy-to-velocity mapping
     - Rigidity R = p/(q·e) determines penetration depth into magnetosphere
══════════════════════════════════════════════════════════════════════════════ */

/**
 * SPECIES object: Maps species keys to physical parameters
 * 
 * STRUCTURE:
 *   Each entry has the form:
 *   key: {
 *     Z:     Charge state in elementary charges (positive for ions, -1 for electrons)
 *     A:     Atomic mass in AMU (proton ≈ 1.007, electron ≈ 0.000549)
 *     label: Display name with Unicode charge superscripts (e.g., 'H⁺ Proton')
 *   }
 * 
 * USAGE:
 *   const sp = SPECIES['proton'];  // Get proton parameters
 *   sp.Z  // Returns 1 (charge)
 *   sp.A  // Returns 1.0073 (mass)
 *   sp.label  // Returns 'H⁺ Proton'
 * 
 * NOTE:
 *   Keys must match the onclick handler in HTML:
 *   <div class="opt-card" id="sp-proton" onclick="selectSpecies('proton',this)">
 *   The id="sp-{key}" allows JavaScript to find the card element.
 * 
 * TO ADD A NEW SPECIES:
 *   1. Add entry here: newspecies: {Z: ..., A: ..., label: '...'}
 *   2. Add HTML card in index.html with id="sp-newspecies"
 *   3. Set onclick="selectSpecies('newspecies',this)"
 *   4. Choose an appropriate emoji icon
 */
const SPECIES = {
  // ────────────────────────────────────────────────────────────────────────────
  // PROTON (H⁺) — Default SEP particle
  //
  // Physical properties:
  //   - Charge: +1 elementary charge (1.602 × 10⁻¹⁹ C)
  //   - Mass:   1.0073 AMU (1.673 × 10⁻²⁷ kg)
  //   - Composition: Single proton (no neutrons)
  //
  // Usage in AMPS:
  //   - Most common particle in solar energetic particle events
  //   - Typical SEP energy range: 1-100 MeV
  //   - Drift periods at L=4-6: ~10-60 minutes
  //   - Full radiation belt treatment available
  //   - Well-validated against Van Allen Probes, SAMPEX, GOES data
  //
  // AMPS_PARAM.in output:
  //   SPECIES  = proton
  //   CHARGE   = 1
  //   MASS_AMU = 1.0073
  // ────────────────────────────────────────────────────────────────────────────
  proton: {
    Z: 1,         // Charge state: +1 elementary charge
    A: 1.0073,    // Mass: 1.0073 atomic mass units (CODATA 2018)
    label: 'H⁺ Proton'  // Display name with Unicode superscript
  },
  
  // ────────────────────────────────────────────────────────────────────────────
  // ALPHA PARTICLE (He²⁺) — Second most common SEP heavy ion
  //
  // Physical properties:
  //   - Charge: +2 elementary charges (fully ionized helium nucleus)
  //   - Mass:   4.0026 AMU (6.646 × 10⁻²⁷ kg)
  //   - Composition: 2 protons + 2 neutrons
  //
  // Usage in AMPS:
  //   - Second most abundant heavy ion in SEP events (typically 5-10% of protons)
  //   - Important for radiation dose calculations (high LET)
  //   - He/H abundance ratio diagnostic for SEP acceleration mechanisms
  //   - Rigidity at same energy/nucleon: 2× lower than protons
  //
  // AMPS_PARAM.in output:
  //   SPECIES  = helium
  //   CHARGE   = 2
  //   MASS_AMU = 4.0026
  // ────────────────────────────────────────────────────────────────────────────
  helium: {
    Z: 2,         // Charge state: +2 (fully ionized, no electrons)
    A: 4.0026,    // Mass: 4.0026 AMU (He-4 isotope, most common)
    label: 'He²⁺ Alpha'  // Display name
  },
  
  // ────────────────────────────────────────────────────────────────────────────
  // CUSTOM ION — User-defined particle species
  //
  // Purpose:
  //   Allows simulation of any particle not in the predefined list.
  //   Useful for:
  //     - Heavy ions (CNO group, iron group, etc.)
  //     - Partially stripped ions (e.g., O⁶⁺ instead of fully ionized O⁸⁺)
  //     - Electrons (Z=-1, A=0.000549)
  //     - Exotic particles for sensitivity studies
  //
  // Behavior:
  //   When 'custom' is selected:
  //     1. Shows custom-species-panel in HTML
  //     2. User manually enters Z (charge) and A (mass)
  //     3. Values are read from #charge-input and #mass-input fields
  //     4. updateRigidity() recalculates magnetic rigidity in real-time
  //
  // Default values:
  //   Z=1, A=1.0 (generic singly-charged ion)
  //   User should update these before submitting simulation
  //
  // AMPS_PARAM.in output:
  //   SPECIES  = custom
  //   CHARGE   = {user-specified Z}
  //   MASS_AMU = {user-specified A}
  //
  // Examples:
  //   Electron:          Z=-1,  A=0.000549
  //   Oxygen (O⁸⁺):      Z=8,   A=15.999
  //   Iron (Fe²⁶⁺):      Z=26,  A=55.845
  //   Partially stripped O⁶⁺: Z=6, A=15.999
  // ────────────────────────────────────────────────────────────────────────────
  custom: {
    Z: 1,         // Default charge (will be overridden by user input)
    A: 1.0,       // Default mass (will be overridden by user input)
    label: 'Custom'  // Display label
  },
  
  // ══════════════════════════════════════════════════════════════════════════
  // COMMENTED OUT SPECIES — Available for re-enabling
  //
  // These species were removed from the UI to simplify the interface,
  // but can be re-added by uncommenting here and adding corresponding
  // HTML cards in index.html Step 2 panel.
  //
  // TO RE-ENABLE:
  //   1. Uncomment the desired species entry below
  //   2. Copy a card template from index.html
  //   3. Update id, onclick, icon, title, and description
  //   4. Test that selection works correctly
  // ══════════════════════════════════════════════════════════════════════════
  
  // ELECTRON (e⁻) — Relativistic lepton
  // Uncomment to enable electron simulations
  /*
  electron: {
    Z: -1,           // Charge: -1 elementary charge (negative!)
    A: 0.000549,     // Mass: 0.000549 AMU (9.109 × 10⁻³¹ kg)
    label: 'e⁻ Electron'
  },
  */
  // Physics notes for electrons:
  //   - Requires relativistic treatment (γ >> 1 at MeV energies)
  //   - Very fast drift periods (<1 min at L=4)
  //   - AMPS uses enhanced guiding-center integrator
  //   - Common in magnetospheric chorus wave interactions
  
  // OXYGEN (O⁸⁺) — Heavy SEP ion
  // Uncomment to enable oxygen simulations
  /*
  oxygen: {
    Z: 8,            // Charge: +8 (fully ionized, 8 protons)
    A: 15.999,       // Mass: 16.0 AMU (O-16 isotope)
    label: 'O⁸⁺ Oxygen'
  },
  */
  // Physics notes for oxygen:
  //   - Dominant heavy ion in impulsive SEP events
  //   - Part of CNO group (carbon-nitrogen-oxygen)
  //   - Higher charge/mass ratio than Fe
  //   - Important for composition studies
  
  // IRON (Fe²⁶⁺) — Heaviest common SEP species
  // Uncomment to enable iron simulations
  /*
  iron: {
    Z: 26,           // Charge: +26 (fully ionized, 26 protons)
    A: 55.845,       // Mass: 55.8 AMU (weighted average of isotopes)
    label: 'Fe²⁶⁺ Iron'
  },
  */
  // Physics notes for iron:
  //   - Heaviest ion commonly observed in SEP events
  //   - Very high magnetic rigidity
  //   - Can penetrate deeper into magnetosphere than lighter ions
  //   - Fe/O ratio diagnostic for coronal vs. flare material
};

/**
 * selectSpecies() — Handle particle species selection
 * 
 * TRIGGERED BY:
 *   User clicking a species card in HTML:
 *   <div class="opt-card" id="sp-proton" onclick="selectSpecies('proton',this)">
 * 
 * PARAMETERS:
 *   @param {string} key  - Species identifier (must exist in SPECIES object)
 *   @param {HTMLElement} card - The clicked card element (for styling)
 * 
 * BEHAVIOR:
 *   1. Look up species parameters from SPECIES object
 *   2. Update global state S.species, S.charge, S.mass
 *   3. Remove 'sel' class from all species cards (deselect all)
 *   4. Add 'sel' class to clicked card (highlight selection)
 *   5. Show/hide custom input panel if 'custom' species
 *   6. Pre-fill custom input fields if selecting predefined species
 *   7. Recalculate and display magnetic rigidity
 * 
 * STATE UPDATES:
 *   S.species — Species key ('proton', 'helium', 'custom')
 *   S.charge  — Charge state Z in elementary charges
 *   S.mass    — Mass A in atomic mass units
 * 
 * CSS CLASSES:
 *   .sel — Applied to selected card, triggers highlight styling
 *        — Defined in css/03-components.css
 *        — Adds border glow, background tint, etc.
 * 
 * CUSTOM PANEL LOGIC:
 *   if (key === 'custom'):
 *     - Show #custom-species-panel (display:block)
 *     - User can manually input Z and A
 *     - Values update S directly via oninput handlers
 *   else:
 *     - Hide custom panel
 *     - Pre-fill input fields with predefined Z and A
 *     - Allows user to switch to custom and modify
 * 
 * ERROR HANDLING:
 *   - If key not found in SPECIES, function returns early (no change)
 *   - Prevents crashes from typos in HTML onclick attributes
 * 
 * EXAMPLE CALL:
 *   selectSpecies('helium', document.getElementById('sp-helium'));
 *   Result: S.species='helium', S.charge=2, S.mass=4.0026, card highlighted
 */
function selectSpecies(key, card) {
  // Look up species parameters from SPECIES object
  const sp = SPECIES[key];
  
  // Guard clause: if species key doesn't exist, abort
  if (!sp) {
    console.error(`Unknown species key: ${key}`);
    return;
  }
  
  // Update global state with species parameters
  S.species = key;       // Store species identifier
  S.charge  = sp.Z;      // Store charge state (affects trajectory in B-field)
  S.mass    = sp.A;      // Store mass (affects inertia and drift velocities)
  
  // Visual feedback: deselect all cards, then select clicked one
  // Find all species cards (IDs starting with 'sp-')
  document.querySelectorAll('.opt-card[id^="sp-"]').forEach(c => {
    c.classList.remove('sel');  // Remove highlight from all cards
  });
  
  // Highlight the clicked card
  if (card) {
    card.classList.add('sel');  // Add .sel class → CSS applies highlight
  }
  
  // Show/hide custom input panel based on species selection
  const customPanel = $('custom-species-panel');
  if (customPanel) {
    customPanel.style.display = (key === 'custom') ? 'block' : 'none';
  }
  
  // If user selected a predefined species (not custom), pre-fill the custom
  // input fields with that species' Z and A. This allows quick switching:
  // User can select "proton", then switch to "custom" and modify from there.
  if (key !== 'custom') {
    const chargeInput = $('charge-input');
    const massInput   = $('mass-input');
    if (chargeInput) chargeInput.value = sp.Z;  // Pre-fill charge
    if (massInput)   massInput.value   = sp.A;  // Pre-fill mass
  }
  
  // Recalculate and display magnetic rigidity
  // Rigidity R = p/(q·e) determines how deep particles can penetrate
  // into the magnetosphere. Higher R = deeper penetration.
  updateRigidity();
  
  // Note: updateSidebar() is called by updateRigidity(), so no need to
  // call it explicitly here. The sidebar summary will refresh automatically.
}

/**
 * updateRigidity() — Calculate and display magnetic rigidity
 * 
 * WHAT IS RIGIDITY:
 *   Magnetic rigidity R = p/(q·e) measures particle "stiffness" in B-field.
 *   Units: gigavolts [GV] = GeV/c per elementary charge.
 *   
 *   Physical interpretation:
 *     - R = momentum per unit charge
 *     - Higher R → harder to deflect → deeper penetration
 *     - Earth's field acts as rigidity filter (R_cutoff varies with location)
 * 
 * FORMULA (relativistic):
 *   At reference energy E = 100 MeV/nucleon:
 *     E_total = A × 100 MeV + A × m_p c² (total energy including rest mass)
 *     p = √(E_total² - (A·m_p·c²)²) / c  (relativistic momentum)
 *     R [GV] = p [MeV/c] / (Z [e] × 1000)
 *   
 *   For Z=1, A=1 (proton at 100 MeV):
 *     R ≈ 1.093 GV
 *   
 *   For Z=2, A=4 (alpha at 100 MeV/n):
 *     E_total = 4×100 + 4×938.272 = 4153 MeV
 *     p = √(4153² - 3753²) = 1844 MeV/c
 *     R = 1844/(2×1000) = 0.922 GV
 * 
 * INPUTS:
 *   Reads from global state S (updated by selectSpecies or custom inputs):
 *     S.charge  — Charge state Z in elementary charges
 *     S.mass    — Mass A in atomic mass units
 * 
 * OUTPUTS:
 *   Updates HTML element #rigidity-info with text: "R = X.XXX GV at 100 MeV/n"
 * 
 * USAGE:
 *   Called automatically by:
 *     - selectSpecies() when user picks a species
 *     - oninput handlers on #charge-input and #mass-input (for custom ion)
 *   Ensures rigidity display always reflects current Z and A
 * 
 * CONSTANTS USED:
 *   E = 100 MeV/nucleon (reference kinetic energy)
 *   mp = 938.272 MeV/c² (proton rest mass energy)
 *   1000 = conversion factor MeV → GeV
 */
function updateRigidity() {
  // Read charge and mass from global state S
  // Use Math.abs() for charge to handle electrons (Z=-1)
  // Default to 1 if undefined (shouldn't happen, but defensive coding)
  const q = Math.abs(S.charge || 1);  // |Z| in elementary charges
  const A = S.mass || 1;              // Mass in atomic mass units
  
  // Physical constants
  const E = 100;        // Reference kinetic energy: 100 MeV per nucleon
  const mp = 938.272;   // Proton rest mass energy in MeV (m_p c²)
  
  // Calculate total energy (kinetic + rest mass) for A nucleons
  // E_total = E_kinetic + E_rest = A×E + A×m_p×c²
  const Etot = E * A + A * mp;  // Total energy in MeV
  
  // Calculate relativistic momentum using energy-momentum relation:
  // E² = (p·c)² + (m·c²)²
  // Therefore: p·c = √(E² - (m·c²)²)
  // Here m = A×m_p (total mass)
  const p = Math.sqrt(Etot**2 - (A * mp)**2);  // Momentum in MeV/c
  
  // Calculate magnetic rigidity: R = p/(q·e)
  // Divide by 1000 to convert MeV → GeV (GV units)
  const R = p / (q * 1000);  // Rigidity in GV
  
  // Update display element with formatted rigidity value
  const el = $('rigidity-info');
  if (el) {
    el.textContent = `R = ${R.toFixed(3)} GV at 100 MeV/n`;
  }
  
  // Note: This rigidity value is for display/comparison purposes only.
  // AMPS internally computes rigidity at all energies in the spectrum
  // using the full energy-dependent formula during particle tracing.
}

/* ── 3d. STEP 3 TS05 ─────────────────────────────────────────────── */
function ts05Change(){
  const v = k => parseFloat($(k)?.value)||0;
  S.dst=v('ts05-dst'); S.pdyn=v('ts05-pdyn'); S.bz=v('ts05-bz');
  S.vx=v('ts05-vx');   S.nsw=v('ts05-nsw');   S.by=v('ts05-by'); S.bx=v('ts05-bx');
  S.epoch=$('ts05-epoch')?.value||S.epoch;
  validateTs05();
  updateKwPreview();
  bndShueUpdate(); // Shue params depend on Bz, Pdyn
  updateSidebar();
}
const TS05R={
  dst:{lo:-600,hi:50,wl:-300,wh:50},pdyn:{lo:0.1,hi:30,wl:0.5,wh:20},
  bz:{lo:-50,hi:20,wl:-30,wh:15},vx:{lo:-900,hi:-200,wl:-800,wh:-200},
  nsw:{lo:0.5,hi:80,wl:1,wh:50},by:{lo:-40,hi:40},bx:{lo:-40,hi:40},
};
function validateTs05(){
  Object.entries(TS05R).forEach(([key,r])=>{
    const v=S[key]; if(v===undefined) return;
    const el=$(`ts05-${key}`), st=$(`ts05-${key}-status`);
    if(!el) return;
    el.classList.remove('valid','warn','error');
    if(v<r.lo||v>r.hi){ el.classList.add('error'); if(st){st.textContent='✗ Out of TS05 range';st.style.color='var(--red)';} }
    else if((r.wl&&v<r.wl)||(r.wh&&v>r.wh)){ el.classList.add('warn'); if(st){st.textContent='⚠ Unusual — verify data source';st.style.color='var(--orange)';} }
    else{ el.classList.add('valid'); if(st){st.textContent='✓ Within normal range';st.style.color='var(--green)';} }
  });
}
function updateKwPreview(){
  const f=(v,d)=>Number(v).toFixed(d);
  const set=(id,v)=>{ const e=$(id); if(e) e.textContent=v; };
  set('kv-dst', f(S.dst,1)); set('kv-pdyn',f(S.pdyn,2)); set('kv-bz',f(S.bz,2));
  set('kv-vx',  f(S.vx,1));  set('kv-nsw', f(S.nsw,2)); set('kv-by', f(S.by,2));
  set('kv-bx',  f(S.bx,2));  set('kv-epoch', S.epoch);
  // Advanced TS05 extras (optional): dipole tilt + 6 driving variables W1..W6
  const haveW = (S.ts05W1!=null||S.ts05W2!=null||S.ts05W3!=null||S.ts05W4!=null||S.ts05W5!=null||S.ts05W6!=null);
  const advRows = document.querySelectorAll('.ts05-kw-adv');
  advRows.forEach(r=>r.style.display = haveW ? 'inline' : 'none');
  set('kv-ts05-tilt', (Number(S.ts05TiltRad)||0).toFixed(4));
  set('kv-ts05-w1', (S.ts05W1==null?0:Number(S.ts05W1)).toFixed(2));
  set('kv-ts05-w2', (S.ts05W2==null?0:Number(S.ts05W2)).toFixed(2));
  set('kv-ts05-w3', (S.ts05W3==null?0:Number(S.ts05W3)).toFixed(2));
  set('kv-ts05-w4', (S.ts05W4==null?0:Number(S.ts05W4)).toFixed(2));
  set('kv-ts05-w5', (S.ts05W5==null?0:Number(S.ts05W5)).toFixed(2));
  set('kv-ts05-w6', (S.ts05W6==null?0:Number(S.ts05W6)).toFixed(2));
}


/* ── Advanced TS05: parse a single OMNI 5-min record with W1..W6 ─────────
   Format (whitespace-separated):
     YEAR DOY HOUR MIN BXGSM BYGSM BZGSM VXGSE VYGSE VZGSE DEN TEMP SYMH IMFFLAG ISWFLAG TILT PDYN W1 W2 W3 W4 W5 W6
   Units: B[nT], V[km/s], DEN[cm^-3], TEMP[K], SYMH[nT], TILT[rad], PDYN[nPa].
   See: ts05_Data_format.txt and Tsyganenko & Sitnov (2005).
*/
function parseTs05OmniLine(){
  const box = $('ts05-omni-line');
  const st  = $('ts05-omni-status');
  const setText=(id,v)=>{ const e=$(id); if(e) e.textContent=v; };
  if(!box){ if(st) st.textContent='(no input box found)'; return; }
  const raw=(box.value||'').trim();
  if(!raw){ if(st){ st.textContent='Paste a record line first.'; st.style.color='var(--orange)'; } return; }

  const toks=raw.split(/\s+/);
  if(toks.length<24){
    if(st){ st.textContent=`Too few columns: got ${toks.length}, expected 24.`; st.style.color='var(--red)'; }
    return;
  }
  try{
    const i=(k)=>parseInt(toks[k],10);
    const f=(k)=>parseFloat(toks[k]);

    const year=i(0), doy=i(1), hour=i(2), minute=i(3);
    const bx=f(4), by=f(5), bz=f(6);
    const vx=f(7);
    const den=f(10);
    const symh=f(12);
    const imfflag=i(13), iswflag=i(14);
    const tilt=f(15);
    const pdyn=f(16);
    const w=[f(17),f(18),f(19),f(20),f(21),f(22)];

    // Convert (year, DOY, hour, minute) to ISO-local datetime string for the UI.
    // Note: input is UTC; we store the same string for reproducibility.
    const dt=new Date(Date.UTC(year,0,1,hour,minute,0));
    dt.setUTCDate(dt.getUTCDate()+ (doy-1));
    const iso=dt.toISOString().slice(0,16); // YYYY-MM-DDTHH:MM

    // Update state
    S.fieldModel = (S.fieldModel==='TS04') ? 'TS04' : 'TS05';
    S.ts05DriverMode = 'omni_record';
    S.dst = symh;       // SYM-H in OMNI record; used here as a Dst-like proxy.
    S.pdyn = pdyn;
    S.bx = bx; S.by = by; S.bz = bz;
    S.vx = vx;
    S.nsw = den;
    S.epoch = iso;

    S.ts05TiltRad = tilt;
    S.ts05ImfFlag = imfflag;
    S.ts05SwFlag  = iswflag;
    S.ts05W1 = w[0]; S.ts05W2 = w[1]; S.ts05W3 = w[2]; S.ts05W4 = w[3]; S.ts05W5 = w[4]; S.ts05W6 = w[5];

    // Push into UI fields
    if($('ts05-dst')) $('ts05-dst').value = String(symh);
    if($('ts05-pdyn')) $('ts05-pdyn').value = String(pdyn);
    if($('ts05-bz')) $('ts05-bz').value = String(bz);
    if($('ts05-vx')) $('ts05-vx').value = String(vx);
    if($('ts05-nsw')) $('ts05-nsw').value = String(den);
    if($('ts05-by')) $('ts05-by').value = String(by);
    if($('ts05-bx')) $('ts05-bx').value = String(bx);
    if($('ts05-epoch')) $('ts05-epoch').value = iso;

    // Status readout
    setText('ts05-tilt-read', tilt.toFixed(4));
    setText('ts05-imfflag-read', String(imfflag));
    setText('ts05-iswflag-read', String(iswflag));
    setText('ts05-w-read', w.map(x=>Number(x).toFixed(2)).join(', '));

    if(st){ st.textContent='Parsed OK.'; st.style.color='var(--green)'; }

    // Refresh derived views
    ts05Change(); // will re-validate + kw preview + Shue coupling
  }catch(e){
    if(st){ st.textContent='Parse failed: '+(e&&e.message?e.message:String(e)); st.style.color='var(--red)'; }
  }
}

/* ── 3e. STEP 4 BOUNDARY ─────────────────────────────────────────── */

/* ── STEP 3 — BACKGROUND FIELD MODEL SELECTOR ──────────────────────── */
/*    The model selector uses a grid of .model-sel-card cards.           */
/*    Clicking a card calls selectFieldModel(name) which:                */
/*      1. Marks the chosen card as .sel (blue border + ✓)               */
/*      2. Shows the matching driving-parameter sub-form                  */
/*      3. Updates the MHD label if BATSRUS or GAMERA is chosen           */
/*      4. Refreshes the keyword-preview strip                            */

function selectFieldModel(model) {
  S.fieldModel = model;

  // ── Deselect all cards, mark chosen one ──
  document.querySelectorAll('.model-sel-card').forEach(c => c.classList.remove('sel'));
  const card = $(`msc-${model.toLowerCase()}`);
  if (card) card.classList.add('sel');

  // ── Show/hide model-specific driving-parameter forms ──
  const forms = { ts05: 'ts05-form', t96: 't96-form', t01: 't01-form', ts07d: 'ts07d-form', ta15: 'ta15-form', mhd: 'mhd-form' };
  Object.values(forms).forEach(id => {
    const el = $(id);
    if (el) el.style.display = 'none';
  });
  const isMhd  = (model === 'BATSRUS' || model === 'GAMERA');
  const isTs05 = (model === 'TS05' || model === 'TS04');

  const isT96  = (model === 'T96');
  const isT01  = (model === 'T01');
  const isTS07D= (model === 'TS07D');
  const isTA15 = (model === 'TA15');

  if (isTs05) {
    $('ts05-form').style.display = 'block';
    const lbl = $('ts05-label');
    if (lbl) lbl.textContent = model === 'TS05'
      ? 'TS05 Driving Parameters'
      : 'TS04 Driving Parameters (reuse TS05 driver UI)';
  } else if (isT96) {
    $('t96-form').style.display = 'block';
  } else if (isT01) {
    $('t01-form').style.display = 'block';
  } else if (isTS07D) {
    $('ts07d-form').style.display = 'block';
  } else if (isTA15) {
    $('ta15-form').style.display = 'block';
  } else if (isMhd) {
    $('mhd-form').style.display = 'block';
    const lbl = $('mhd-model-label');
    if (lbl) lbl.textContent = `${model} MHD Output`;
  }

  // ── Show/hide KW rows for each model ──
  document.querySelectorAll('.ts05-kw-row').forEach(r => r.style.display = isTs05 ? '' : 'none');
  document.querySelectorAll('.t96-kw-row').forEach(r  => r.style.display = model==='T96'  ? '' : 'none');
  document.querySelectorAll('.t01-kw-row').forEach(r  => r.style.display = model==='T01'  ? '' : 'none');
  document.querySelectorAll('.ts07d-kw-row').forEach(r=> r.style.display = model==='TS07D'? '' : 'none');
  document.querySelectorAll('.ta15-kw-row').forEach(r => r.style.display = model==='TA15' ? '' : 'none');
  document.querySelectorAll('.mhd-kw-row').forEach(r  => r.style.display = isMhd ? '' : 'none');

  // ── Update field-model value in KW strip ──
  const kv = $('kv-field-model');
  if (kv) kv.textContent = model;

  // Update model comment
  const commentMap = {
    TS05: '! Tsyganenko & Sitnov (2005)',
    TS04: '! Tsyganenko & Sitnov (2004)',
    T96:  '! Tsyganenko (1996)',
    T01:  '! Tsyganenko (2001)',
    TS07D:'! Tsyganenko & Sitnov (2007D)',
    TA15: '! Tsyganenko & Andreeva (2015)',
    BATSRUS:'! MHD (Block-Adaptive Tree)',
    GAMERA: '! MHD (Grid Agnostic)',
  };
  const cmt = $('kv-field-model-comment');
  if (cmt) cmt.textContent = commentMap[model] || '! field model';

  // Shue boundary auto-compute depends on TS05 Bz/Pdyn — recompute
  bndShueUpdate();

  updateSidebar();
}

/* t96Change — called on T96 input change */
function t96Change(){
  // Read UI → state (model-specific)
  S.t96Dst  = parseFloat($('t96-dst')?.value)  ?? S.t96Dst;
  S.t96Pdyn = parseFloat($('t96-pdyn')?.value) ?? S.t96Pdyn;
  S.t96By   = parseFloat($('t96-by')?.value)   ?? S.t96By;
  S.t96Bz   = parseFloat($('t96-bz')?.value)   ?? S.t96Bz;
  S.t96Tilt = parseFloat($('t96-tilt')?.value) ?? S.t96Tilt;
  S.t96Epoch = $('t96-epoch')?.value || S.t96Epoch;


  // Keep the generated AMPS_PARAM.in stable: map T96 reduced driver set → generic fields.
  // (Backends can ignore irrelevant fields.)
  if (S.fieldModel === 'T96') {
    S.dst  = Number.isFinite(S.t96Dst)  ? S.t96Dst  : S.dst;
    S.pdyn = Number.isFinite(S.t96Pdyn) ? S.t96Pdyn : S.pdyn;
    S.by   = Number.isFinite(S.t96By)   ? S.t96By   : S.by;
    S.bz   = Number.isFinite(S.t96Bz)   ? S.t96Bz   : S.bz;
  }

  // Keyword preview
  const set=(id,v)=>{const e=$(id); if(e) e.textContent=v;};
  set('kv-t96-dst',  Number(S.t96Dst).toFixed(1));
  set('kv-t96-pdyn', Number(S.t96Pdyn).toFixed(2));
  set('kv-t96-by',   Number(S.t96By).toFixed(2));
  set('kv-t96-bz',   Number(S.t96Bz).toFixed(2));
  set('kv-t96-tilt', Number(S.t96Tilt).toFixed(1));
  // keep global epoch preview consistent
  if (S.fieldModel === 'T96' && S.t96Epoch) { const e=$('kv-epoch'); if(e) e.textContent = S.t96Epoch; }
  set('kv-t96-epoch', S.t96Epoch || '');

  validateT96();
  updateSidebar();
}

/* validateT96 — range guidance + UI feedback (warn vs out-of-range) */
function validateT96(){
  // Guidance ranges summarized from the reference implementation notes (T96_01.FOR):
  //   Pdyn: 0.5–10 nPa, Dst: −100…+20 nT, IMF By/Bz: −10…+10 nT.
  // UI also enforces broader hard limits to prevent typos.
  const R = {
    dst:  { ok:[-100, 20],  hard:[-600, 50],  msgOk:'\u2713 Within normal range', msgWarn:'\u26A0 Outside recommended range', msgBad:'\u2717 Out-of-range' },
    pdyn: { ok:[0.5,  10],  hard:[0.1,  30],  msgOk:'\u2713 Within normal range', msgWarn:'\u26A0 Outside recommended range', msgBad:'\u2717 Out-of-range' },
    by:   { ok:[-10,  10],  hard:[-40,  40],  msgOk:'\u2713 Within normal range', msgWarn:'\u26A0 Outside recommended range', msgBad:'\u2717 Out-of-range' },
    bz:   { ok:[-10,  10],  hard:[-50,  20],  msgOk:'\u2713 Within normal range', msgWarn:'\u26A0 Outside recommended range', msgBad:'\u2717 Out-of-range' },
    tilt: { ok:[-35,  35],  hard:[-35,  35],  msgOk:'\u2713 OK',               msgWarn:'\u26A0 Check',                  msgBad:'\u2717 Out-of-range' }
  };

  const fields = [
    ['t96-dst',  'dst',  't96-dst-status'],
    ['t96-pdyn', 'pdyn', 't96-pdyn-status'],
    ['t96-by',   'by',   't96-by-status'],
    ['t96-bz',   'bz',   't96-bz-status'],
    ['t96-tilt', 'tilt', 't96-tilt-status']
  ];

  let anyWarn = false, anyBad = false;

  for (const [id,k,statusId] of fields){
    const el = $(id);
    const st = $(statusId);
    if(!el) continue;

    const v = parseFloat(el.value);
    // Reset classes
    el.classList.remove('valid','warn','bad','error');

    if(!Number.isFinite(v)){
      if(st){ st.textContent = ''; st.style.color='var(--text-muted)'; }
      continue;
    }

    const ok0 = R[k].ok[0], ok1 = R[k].ok[1];
    const h0  = R[k].hard[0], h1 = R[k].hard[1];

    if(v < h0 || v > h1){
      el.classList.add('bad');
      anyBad = true;
      if(st){ st.textContent = R[k].msgBad; st.style.color='var(--red)'; }
    } else if(v < ok0 || v > ok1){
      el.classList.add('warn');
      anyWarn = true;
      if(st){ st.textContent = R[k].msgWarn; st.style.color='var(--orange)'; }
    } else {
      el.classList.add('valid');
      if(st){ st.textContent = R[k].msgOk; st.style.color='var(--green)'; }
    }
  }

  const st = $('t96-status');
  if(st){
    if(anyBad){
      st.textContent = 'Out-of-range: expect unreliable/extrapolated results.';
      st.style.color = 'var(--red)';
    } else if(anyWarn){
      st.textContent = 'Outside recommended range: use caution (extrapolation).';
      st.style.color = 'var(--yellow)';
    } else {
      st.textContent = 'Within recommended range.';
      st.style.color = 'var(--green)';
    }
  }
}

/* Presets + convenience actions */
function t96PresetQuiet(){
  const setv=(id,v)=>{const e=$(id); if(e){ e.value=String(v); }};
  setv('t96-dst',  -10);
  setv('t96-pdyn',  2.0);
  setv('t96-by',    0.0);
  setv('t96-bz',    2.0);
  setv('t96-tilt',  0.0);
  t96Change();
}
function t96PresetStorm(){
  const setv=(id,v)=>{const e=$(id); if(e){ e.value=String(v); }};
  setv('t96-dst',  -120);
  setv('t96-pdyn',   8.0);
  setv('t96-by',     5.0);
  setv('t96-bz',   -15.0);
  setv('t96-tilt',   0.0);
  t96Change();
}
function t96CopyFromTs05(){
  // If user already has TS05 scalars filled, reuse Dst/Pdyn/By/Bz as a quick way to compare models.
  const setv=(id,v)=>{const e=$(id); if(e && Number.isFinite(v)){ e.value=String(v); }};
  setv('t96-dst',  S.dst);
  setv('t96-pdyn', S.pdyn);
  setv('t96-by',   S.by);
  setv('t96-bz',   S.bz);
  t96Change();
}

/* parseT96OmniLine — parse a whitespace-separated T96 record:
   DST  PDYN  BY  BZ  TILT
   Units: Dst[nT], Pdyn[nPa], By[nT], Bz[nT], Tilt[deg].
*/
function parseT96OmniLine(){
  const box = $('t96-omni-line');
  const st  = $('t96-omni-status');
  const setText=(id,v)=>{ const e=$(id); if(e) e.textContent=v; };
  if(!box){ if(st) st.textContent='(no input box found)'; return; }
  const raw=(box.value||'').trim();
  if(!raw){ if(st){ st.textContent='Paste a record line first.'; st.style.color='var(--orange)'; } return; }

  const toks=raw.split(/\s+/);
  if(toks.length<4){
    if(st){ st.textContent=`Too few columns: got ${toks.length}, expected at least 4 (Dst Pdyn By Bz [Tilt]).`; st.style.color='var(--red)'; }
    return;
  }
  try{
    const f=(k)=>parseFloat(toks[k]);
    const dst=f(0), pdyn=f(1), by=f(2), bz=f(3);
    const tilt=(toks.length>=5) ? f(4) : 0.0;

    // Push into UI fields
    const setv=(id,v)=>{const e=$(id); if(e){ e.value=String(v); }};
    setv('t96-dst',  dst);
    setv('t96-pdyn', pdyn);
    setv('t96-by',   by);
    setv('t96-bz',   bz);
    setv('t96-tilt', tilt);

    // Status readout
    setText('t96-dst-read',  dst.toFixed(1));
    setText('t96-pdyn-read', pdyn.toFixed(2));
    setText('t96-by-read',   by.toFixed(2));
    setText('t96-bz-read',   bz.toFixed(2));
    setText('t96-tilt-read', tilt.toFixed(1));

    if(st){ st.textContent='Parsed OK.'; st.style.color='var(--green)'; }

    t96Change();
  }catch(e){
    if(st){ st.textContent='Parse failed: '+(e&&e.message?e.message:String(e)); st.style.color='var(--red)'; }
  }
}

/* t01Change — called on T01 input change */
function t01Change(){
  // Read UI → state (model-specific)
  S.t01Dst  = parseFloat($('t01-dst')?.value)  ?? S.t01Dst;
  S.t01Pdyn = parseFloat($('t01-pdyn')?.value) ?? S.t01Pdyn;
  S.t01By   = parseFloat($('t01-by')?.value)   ?? S.t01By;
  S.t01Bz   = parseFloat($('t01-bz')?.value)   ?? S.t01Bz;
  S.t01Tilt = parseFloat($('t01-tilt')?.value) ?? S.t01Tilt;
  S.t01G1   = parseFloat($('t01-g1')?.value)   ?? S.t01G1;
  S.t01G2   = parseFloat($('t01-g2')?.value)   ?? S.t01G2;
  S.t01Epoch = $('t01-epoch')?.value || S.t01Epoch;

  // Mirror the shared driver set into generic keys when this model is active,
  // so downstream steps (boundary, E-field) can stay model-agnostic.
  if (S.fieldModel === 'T01') {
    S.dst  = Number.isFinite(S.t01Dst)  ? S.t01Dst  : S.dst;
    S.pdyn = Number.isFinite(S.t01Pdyn) ? S.t01Pdyn : S.pdyn;
    S.by   = Number.isFinite(S.t01By)   ? S.t01By   : S.by;
    S.bz   = Number.isFinite(S.t01Bz)   ? S.t01Bz   : S.bz;
    if (S.t01Epoch) S.epoch = S.t01Epoch;
  }

  // Keyword preview
  const set=(id,v)=>{const e=$(id); if(e) e.textContent=v;};
  set('kv-t01-dst',  Number(S.t01Dst).toFixed(1));
  set('kv-t01-pdyn', Number(S.t01Pdyn).toFixed(2));
  set('kv-t01-by',   Number(S.t01By).toFixed(2));
  set('kv-t01-bz',   Number(S.t01Bz).toFixed(2));
  set('kv-t01-tilt', Number(S.t01Tilt).toFixed(1));
  set('kv-t01-g1',   Number(S.t01G1).toFixed(1));
  set('kv-t01-g2',   Number(S.t01G2).toFixed(1));
  set('kv-t01-epoch', S.t01Epoch || '');

  // keep global epoch preview consistent
  if (S.fieldModel === 'T01' && S.t01Epoch) { const e=$('kv-epoch'); if(e) e.textContent = S.t01Epoch; }

  validateT01();
  updateSidebar();
}

/* validateT01 — driver range checks
   Notes:
     - T01 uses G1/G2 coupling/history indices (computed from ~1-hour averages).
       In the original parameterization, G2 is scaled to be O(0..10) for commonly
       observed conditions, but example storm events can yield larger values.
*/
function validateT01(){
  const R = {
    dst:  { ok:[-100, 20],  hard:[-600, 50],  msgOk:'\u2713 Within normal range', msgWarn:'\u26A0 Outside recommended range', msgBad:'\u2717 Out-of-range' },
    pdyn: { ok:[0.5,  10],  hard:[0.1,  30],  msgOk:'\u2713 Within normal range', msgWarn:'\u26A0 Outside recommended range', msgBad:'\u2717 Out-of-range' },
    by:   { ok:[-10,  10],  hard:[-40,  40],  msgOk:'\u2713 Within normal range', msgWarn:'\u26A0 Outside recommended range', msgBad:'\u2717 Out-of-range' },
    bz:   { ok:[-10,  10],  hard:[-50,  20],  msgOk:'\u2713 Within normal range', msgWarn:'\u26A0 Outside recommended range', msgBad:'\u2717 Out-of-range' },
    tilt: { ok:[-35,  35],  hard:[-90,  90],  msgOk:'\u2713 OK',                 msgWarn:'\u26A0 Large tilt',           msgBad:'\u2717 Out-of-range' },
    g1:   { ok:[0,    10],  hard:[0,    60],  msgOk:'\u2713 Within normal range', msgWarn:'\u26A0 High (storm-time)',    msgBad:'\u2717 Out-of-range' },
    g2:   { ok:[0,    10],  hard:[0,    60],  msgOk:'\u2713 Within normal range', msgWarn:'\u26A0 High (storm-time)',    msgBad:'\u2717 Out-of-range' },
  };

  const check=(id,key)=>{
    const inp=$(id), st=$(id+'-status');
    if(!inp||!st) return true;
    const v=parseFloat(inp.value);
    if(!Number.isFinite(v)){
      inp.classList.remove('valid','warn','bad');
      st.textContent='\u26A0 Enter a number';
      st.style.color='var(--orange)';
      return false;
    }
    const [ok0,ok1]=R[key].ok, [h0,h1]=R[key].hard;
    let cls='valid', msg=R[key].msgOk, col='var(--green)';
    if(v<h0 || v>h1){ cls='bad'; msg=R[key].msgBad; col='var(--red)'; }
    else if(v<ok0 || v>ok1){ cls='warn'; msg=R[key].msgWarn; col='var(--orange)'; }
    inp.classList.remove('valid','warn','bad'); inp.classList.add(cls);
    st.textContent=msg; st.style.color=col;
    return cls!=='bad';
  };

  const ok =
    check('t01-dst','dst') &
    check('t01-pdyn','pdyn') &
    check('t01-by','by') &
    check('t01-bz','bz') &
    check('t01-tilt','tilt') &
    check('t01-g1','g1') &
    check('t01-g2','g2');

  const banner=$('t01-status');
  if(banner){
    banner.textContent = ok ? '\u2713 Inputs look OK' : '\u26A0 Check highlighted fields';
    banner.style.color = ok ? 'var(--green)' : 'var(--orange)';
  }
}

/* Presets */
function t01PresetQuiet(){
  const setv=(id,v)=>{const e=$(id); if(e) e.value=String(v);};
  setv('t01-dst', 0.0);
  setv('t01-pdyn', 2.0);
  setv('t01-by', 0.0);
  setv('t01-bz', 5.0);
  setv('t01-tilt', 0.0);
  setv('t01-g1', 0.0);
  setv('t01-g2', 0.0);
  t01Change();
}
function t01PresetStorm(){
  const setv=(id,v)=>{const e=$(id); if(e) e.value=String(v);};
  setv('t01-dst', -120.0);
  setv('t01-pdyn', 8.0);
  setv('t01-by', 2.0);
  setv('t01-bz', -10.0);
  setv('t01-tilt', 0.0);
  setv('t01-g1', 20.0);
  setv('t01-g2', 20.0);
  t01Change();
}

/* Convenience: copy shared scalars from TS05 → T01 (for quick A/B comparisons) */
function t01CopyFromTs05(){
  const setv=(id,v)=>{const e=$(id); if(e && Number.isFinite(v)) e.value=String(v);};
  setv('t01-dst',  S.dst);
  setv('t01-pdyn', S.pdyn);
  setv('t01-by',   S.by);
  setv('t01-bz',   S.bz);
  t01Change();
}

/* parseT01OmniLine — parse a pasted text record into T01 inputs
   Expected: PDYN DST BY BZ G1 G2 TILT_DEG [EPOCH]
*/
function parseT01OmniLine(){
  const box=$('t01-omni-line');
  const st=$('t01-omni-status');
  const setText=(id,v)=>{const e=$(id); if(e) e.textContent=v;};

  if(!box){ if(st) st.textContent='(no input box found)'; return; }
  const raw=(box.value||'').trim();
  if(!raw){
    if(st){ st.textContent='Paste a record line first.'; st.style.color='var(--orange)'; }
    return;
  }
  const toks=raw.split(/\s+/);
  const MIN=7;
  if(toks.length<MIN){
    if(st){
      st.textContent=`Too few columns: got ${toks.length}, expected at least ${MIN}.`;
      st.style.color='var(--red)';
    }
    return;
  }

  try{
    const f=(k)=>parseFloat(toks[k]);
    const pdyn=f(0), dst=f(1), by=f(2), bz=f(3), g1=f(4), g2=f(5), tilt=f(6);
    const epoch = (toks.length>=8 && /T\d\d:\d\d/.test(toks[7])) ? toks[7] : '';

    const setv=(id,v)=>{const e=$(id); if(e && Number.isFinite(v)) e.value=String(v);};
    setv('t01-pdyn', pdyn);
    setv('t01-dst',  dst);
    setv('t01-by',   by);
    setv('t01-bz',   bz);
    setv('t01-g1',   g1);
    setv('t01-g2',   g2);
    setv('t01-tilt', tilt);
    if(epoch && $('t01-epoch')) $('t01-epoch').value = epoch;

    setText('t01-pdyn-read', Number(pdyn).toFixed(2));
    setText('t01-dst-read',  Number(dst).toFixed(1));
    setText('t01-by-read',   Number(by).toFixed(2));
    setText('t01-bz-read',   Number(bz).toFixed(2));
    setText('t01-g1-read',   Number(g1).toFixed(1));
    setText('t01-g2-read',   Number(g2).toFixed(1));
    setText('t01-tilt-read', Number(tilt).toFixed(1));
    setText('t01-epoch-read', epoch || '—');

    if(st){ st.textContent='Parsed OK.'; st.style.color='var(--green)'; }
    t01Change();
  }catch(err){
    if(st){
      st.textContent='Parse error: '+(err?.message||String(err));
      st.style.color='var(--red)';
    }
  }
}


/* ts07dChange — coefficient source + epoch */
function ts07dChange(){
  S.ts07dSource = $('ts07d-source')?.value || S.ts07dSource;
  S.ts07dEpoch  = $('ts07d-epoch')?.value  || S.ts07dEpoch;
  const dz = $('ts07d-dropzone');
  if(dz) dz.style.display = (S.ts07dSource==='file') ? 'block' : 'none';
  const set=(id,v)=>{const e=$(id); if(e) e.textContent=v;};
  set('kv-ts07d-source', S.ts07dSource);
  set('kv-ts07d-epoch',  S.ts07dEpoch);
  updateSidebar();
}

/* ta15Change — GOES B + solar wind + Dst */
function ta15Change(){
  S.ta15Dst  = parseFloat($('ta15-dst')?.value)  || S.ta15Dst;
  S.ta15Pdyn = parseFloat($('ta15-pdyn')?.value) || S.ta15Pdyn;
  S.ta15Bz   = parseFloat($('ta15-bz')?.value)   || S.ta15Bz;
  S.ta15Goes = parseFloat($('ta15-goes')?.value) || S.ta15Goes;
  const set=(id,v)=>{const e=$(id); if(e) e.textContent=v;};
  set('kv-ta15-dst',  Number(S.ta15Dst).toFixed(1));
  set('kv-ta15-pdyn', Number(S.ta15Pdyn).toFixed(2));
  set('kv-ta15-bz',   Number(S.ta15Bz).toFixed(2));
  set('kv-ta15-goes', Number(S.ta15Goes).toFixed(1));
  bndShueUpdate();
  updateSidebar();
}

/* mhdChange — called on MHD interpolation setting change */
function mhdChange() {
  S.mhdInterp = $('mhd-interp')?.value || S.mhdInterp;
  const set = (id,v) => { const e=$(id); if(e) e.textContent=v; };
  set('kv-mhd-interp', S.mhdInterp);
  updateSidebar();
}


