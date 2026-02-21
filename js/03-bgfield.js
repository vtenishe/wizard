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

     T04s  — Tsyganenko (2004s) storm-time variant of T04.
             Same 8-driver interface as TS05; legacy compatibility.
             FIELD_MODEL = T04s

     T95m  — Tsyganenko (1995) modified.
             Requires only Dst and Kp — useful for surveys where full
             solar wind data are unavailable.
             FIELD_MODEL = T95m

     T15   — Tsyganenko & Andreeva (2015).
             Most complete empirical model; additionally requires
             GOES geostationary total-B (|B| ≥ 50 nT typical).
             FIELD_MODEL = T15

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
     ts05Change()            — sync TS05/T04s inputs → S + update KW
     t95mChange()            — sync T95m inputs → S
     t15Change()             — sync T15 inputs → S
     mhdChange()             — sync MHD file-upload inputs → S
     validateTs05()          — flag out-of-range TS05 parameter inputs
     updateKwPreview()       — refresh AMPS_PARAM.in keyword-preview strip

   DEPENDS ON: 01-state.js (S, $, set), 02-wizard.js (updateSidebar)
=============================================================================*/

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
  const forms = { ts05: 'ts05-form', t95m: 't95m-form', t15: 't15-form', mhd: 'mhd-form' };
  Object.values(forms).forEach(id => {
    const el = $(id);
    if (el) el.style.display = 'none';
  });
  const isMhd  = (model === 'BATSRUS' || model === 'GAMERA');
  const isTs05 = (model === 'TS05' || model === 'T04s');

  if (isTs05) {
    $('ts05-form').style.display = 'block';
    const lbl = $('ts05-label');
    if (lbl) lbl.textContent = model === 'TS05'
      ? 'TS05 Driving Parameters'
      : 'T04s Driving Parameters (Dst, Pdyn, Bz, Vx, Nsw required)';
  } else if (model === 'T95m') {
    $('t95m-form').style.display = 'block';
  } else if (model === 'T15') {
    $('t15-form').style.display = 'block';
  } else if (isMhd) {
    $('mhd-form').style.display = 'block';
    const lbl = $('mhd-model-label');
    if (lbl) lbl.textContent = `${model} MHD Output`;
  }

  // ── Show/hide KW rows for each model ──
  document.querySelectorAll('.ts05-kw-row').forEach(r => r.style.display = isTs05 ? '' : 'none');
  document.querySelectorAll('.t95m-kw-row').forEach(r => r.style.display = model==='T95m' ? '' : 'none');
  document.querySelectorAll('.t15-kw-row').forEach(r  => r.style.display = model==='T15'  ? '' : 'none');
  document.querySelectorAll('.mhd-kw-row').forEach(r  => r.style.display = isMhd ? '' : 'none');

  // ── Update field-model value in KW strip ──
  const kv = $('kv-field-model');
  if (kv) kv.textContent = model;

  // Shue boundary auto-compute depends on TS05 Bz/Pdyn — recompute
  bndShueUpdate();

  updateSidebar();
}

/* t95mChange — called on T95m input change */
function t95mChange() {
  S.dst   = parseFloat($('t95m-dst')?.value)  || S.dst;
  S.t95Kp = parseFloat($('t95m-kp')?.value)   || S.t95Kp;
  const set = (id,v) => { const e=$(id); if(e) e.textContent=v; };
  set('kv-t95m-dst', Number(S.dst).toFixed(1));
  set('kv-t95m-kp',  Number(S.t95Kp).toFixed(1));
  updateSidebar();
}

/* t15Change — called on T15 input change */
function t15Change() {
  S.dst      = parseFloat($('t15-dst')?.value)   || S.dst;
  S.pdyn     = parseFloat($('t15-pdyn')?.value)  || S.pdyn;
  S.bz       = parseFloat($('t15-bz')?.value)    || S.bz;
  S.t15GoesB = parseFloat($('t15-goes')?.value)  || S.t15GoesB;
  const set = (id,v) => { const e=$(id); if(e) e.textContent=v; };
  set('kv-t15-dst',  Number(S.dst).toFixed(1));
  set('kv-t15-pdyn', Number(S.pdyn).toFixed(2));
  set('kv-t15-bz',   Number(S.bz).toFixed(1));
  set('kv-t15-goes', Number(S.t15GoesB).toFixed(1));
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


