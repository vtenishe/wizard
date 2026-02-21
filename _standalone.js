
/* ═══════════════════════════════════════════════════════════════════
   AMPS CCMC — INTERACTIVE APPLICATION SCRIPT  (v3 — Part 1 Fix)
   Single consolidated script — no duplicates.
   Functions are grouped by wizard step. All major sections are
   labelled with §-prefixed banners for quick navigation.

   §1  Global state & shared constants
   §2  Wizard navigation
   §3a Section collapse/expand
   §3b Step 1 – Run info
   §3c Step 2 – Particle species
   §3d Step 3 – Background field (TS05 shared) + model selector
   §3e Step 4 – Domain boundary (BOX / Shue 1998)
   §3f Step 5 – Electric field (corotation + Volland-Stern / Weimer)
   §3g Step 6 – Temporal variability
   §3h Step 7 – Particle source spectrum
   §3i Step 8 – Output domain
   §3j Step 9 – Output options & energy bins
   §4  SVG grid initialiser
   §5  Review & AMPS_PARAM.in file builder
   §6  Sidebar progress
   §7  Help modal
   §8  Init
═══════════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════════
   AMPS CCMC — INLINE APPLICATION SCRIPT
   All interactive logic for the 9-step submission wizard.
   Separated into logical sections:
     1. State & Constants
     2. Wizard Navigation
     3. Step-specific handlers
     4. SVG diagram renderers (Box + Shue)
     5. Spectrum canvas
     6. Review & param file builder
     7. Init
═══════════════════════════════════════════════════════════════════ */

/* ── 1. GLOBAL STATE ─────────────────────────────────────────────── */
const S = {
  step: 1, done: new Set(),
  runName:'SEP_Sep2017_VanAllenProbeA', piName:'', piEmail:'', institution:'',
  species:'proton', charge:1, mass:1.0073,
  fieldModel:'TS05', dst:-142.0, pdyn:3.5, bz:-18.5, vx:-650.0, nsw:12.0, by:3.2, bx:0.0,
  epoch:'2017-09-10T16:00',
  // ---- Additional driver sets for other Tsyganenko-type models (Step 3) ----
  // T96 drivers (Dst, Pdyn, IMF By/Bz, dipole tilt)
  t96Dst:-20.0, t96Pdyn:2.0, t96By:0.0, t96Bz:2.0, t96Tilt:0.0,
  // T01 drivers (same core set as T96; backend selects quiet/storm coefficients)
  t01Dst:-20.0, t01Pdyn:2.0, t01By:0.0, t01Bz:2.0, t01Tilt:0.0,
  // TS07D coefficient-driven model
  ts07dSource:'omni', ts07dEpoch:'2017-09-10T16:00',
  // TA15 drivers (adds GOES |B|)
  ta15Dst:-20.0, ta15Pdyn:2.0, ta15Bz:2.0, ta15Goes:120.0,
  // MHD upload options
  mhdInterp:'LINEAR',
  boundaryType:'SHUE', shueMode:'auto',
  boxXmax:15, boxXmin:-60, boxYmax:25, boxYmin:-25, boxZmax:20, boxZmin:-20, boxRinner:2.0,
  shueR0:null, shueAlpha:null, xtail:-60, shueRinner:2.0,
  tempMode:'TIME_SERIES', eventStart:'2017-09-07T00:00', eventEnd:'2017-09-10T20:00',
  fieldDt:5, injectDt:30, tsSource:'omni',
  specType:'POWER_LAW', specJ0:10000, specGamma:3.5, specE0:10, specEmin:1, specEmax:1000,
  specEc:500, specPhi:550, specLisJ0:10000, specLisGamma:2.7,
  outputMode:'TRAJECTORY', fluxDt:1.0, trajLoaded:false,
  fluxType:'DIFFERENTIAL', outputCutoff:true, outputPitch:false,
  outputFormat:'NETCDF4', outputCoords:'GEO',
  energyBins:[1,5,10,30,100,300,1000],
  // Electric field model state (Step 5)
  eFieldCoro:true,            // Corotation E included by default (physically correct)
  eFieldConvModel:'VOLLAND_STERN', // Convection E: Volland-Stern (robust default) or WEIMER or NONE
  vsKpMode:'auto',            // Kp source for VS model: 'auto' (derived from Dst) or 'manual'
  vsKp:5.0,                   // Kp index (updated from Dst on init)
  vsGamma:2.0,                // Volland-Stern shielding exponent (typical 2.0)
  vsA:null,                   // VS intensity coefficient (computed from Kp by vsIntensityA)
  weimerMode:'auto',          // Weimer input: 'auto' (from TS05 drivers) or 'file'
  // T95m / T15 extra drivers
  t95mDst:-142.0, t95mKp:5.0,
  t15Goes:100.0, t15Dst:-142.0, t15Pdyn:3.5, t15Bz:-18.5, t15Vx:-650.0, t15Nsw:12.0,
};

const $ = id => document.getElementById(id);
const CX=200, CY=160, SC=5; // SVG canvas centre & scale

/* ── 2. WIZARD NAVIGATION ────────────────────────────────────────── */
function goStep(n) {
  // NOTE: Standalone wizard has 10 steps (1..10). A previous typo limited
  // navigation to 1..9 which made the last step unreachable.
  if(n < 1 || n > 10) return;
  S.done.add(S.step);
  S.step = n;
  for(let i=1;i<=10;i++) {
    const p=$(`panel-${i}`); if(p) p.classList.toggle('active', i===n);
    const el=document.querySelectorAll('.wz-step')[i-1];
    if(el){ el.classList.remove('done','active');
      if(S.done.has(i)) el.classList.add('done');
      else if(i===n) el.classList.add('active'); }
  }
  $('btn-prev').disabled = n===1;
  $('btn-next').style.display = n<10?'inline-flex':'none';
  $('btn-submit').style.display = n===10?'inline-flex':'none';
  window.scrollTo({top:0,behavior:'smooth'});
  updateSidebar();
  if(n===10) buildReview();
}
function nextStep(){ goStep(S.step+1); }
function prevStep(){ goStep(S.step-1); }
// The final "Review & Submit" screen is step 10 in this wizard.
function goToReview(){ goStep(10); }

// Init wizard step indicators
document.querySelectorAll('.wz-step').forEach((el,i)=>{
  el.addEventListener('click',()=>goStep(i+1));
});

/* ── 3a. SECTION COLLAPSE ────────────────────────────────────────── */
function toggleSection(id){
  const el=$(id); if(el) el.classList.toggle('closed');
}

/* ── 3b. STEP 1 HANDLERS ─────────────────────────────────────────── */
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
     Each AMPS simulation run traces ONE particle species backward in time.
   
   AMPS KEYWORDS GENERATED:
     SPECIES  = species identifier (e.g., 'proton', 'helium', 'custom')
     CHARGE   = charge state in elementary charges Z
     MASS_AMU = atomic mass in unified atomic mass units
   
   CURRENT SPECIES:
     - proton:  H⁺ proton (Z=+1, A=1.0073 AMU)
     - helium:  He²⁺ alpha (Z=+2, A=4.0026 AMU)
     - custom:  User-defined ion with manual Z and A input
   
   EXTENSIBILITY:
     To add more species, see PARTICLE_SPECIES_EXTENSION_GUIDE.md
     Commented-out species below can be re-enabled.
══════════════════════════════════════════════════════════════════════════════ */

/**
 * SPECIES object: Maps species keys to physical parameters
 * Each entry: key: {Z: charge, A: mass_AMU, label: 'Display Name'}
 */
const SPECIES = {
  // PROTON (H⁺) — Default SEP particle
  // Charge: +1e, Mass: 1.0073 AMU
  // Most common particle in solar energetic particle events
  proton: {
    Z: 1,
    A: 1.0073,
    label: 'H⁺ Proton'
  },
  
  // ALPHA PARTICLE (He²⁺) — Second most common SEP heavy ion
  // Charge: +2e, Mass: 4.0026 AMU
  // Fully ionized helium nucleus (2 protons + 2 neutrons)
  helium: {
    Z: 2,
    A: 4.0026,
    label: 'He²⁺ Alpha'
  },
  
  // CUSTOM ION — User-defined particle species
  // Shows custom input panel for manual Z and A entry
  // Default: Z=1, A=1.0 (user should update before submitting)
  custom: {
    Z: 1,
    A: 1.0,
    label: 'Custom'
  },
  
  // ══════════════════════════════════════════════════════════════════════════
  // COMMENTED OUT SPECIES — Available for re-enabling
  // To re-enable: Uncomment here + add HTML card in Step 2 panel
  // ══════════════════════════════════════════════════════════════════════════
  
  /* ELECTRON (e⁻) — Relativistic lepton
  electron: {
    Z: -1,
    A: 0.000549,
    label: 'e⁻ Electron'
  }, */
  
  /* OXYGEN (O⁸⁺) — Heavy SEP ion
  oxygen: {
    Z: 8,
    A: 15.999,
    label: 'O⁸⁺ Oxygen'
  }, */
  
  /* IRON (Fe²⁶⁺) — Heaviest common SEP species
  iron: {
    Z: 26,
    A: 55.845,
    label: 'Fe²⁶⁺ Iron'
  }, */
};

/**
 * selectSpecies() — Handle particle species selection
 * 
 * Called when user clicks a species card.
 * Updates global state S and UI highlighting.
 * 
 * @param {string} key - Species identifier ('proton', 'helium', 'custom')
 * @param {HTMLElement} card - The clicked card element
 */
function selectSpecies(key, card) {
  const sp = SPECIES[key];
  if (!sp) {
    console.error(`Unknown species key: ${key}`);
    return;
  }
  
  // Update global state
  S.species = key;
  S.charge = sp.Z;
  S.mass = sp.A;
  
  // Visual feedback: deselect all, then select clicked
  document.querySelectorAll('.opt-card[id^="sp-"]').forEach(c => {
    c.classList.remove('sel');
  });
  if (card) card.classList.add('sel');
  
  // Show/hide custom input panel
  const customPanel = $('custom-species-panel');
  if (customPanel) {
    customPanel.style.display = (key === 'custom') ? 'block' : 'none';
  }
  
  // Pre-fill custom inputs with selected species values
  if (key !== 'custom') {
    const chargeInput = $('charge-input');
    const massInput = $('mass-input');
    if (chargeInput) chargeInput.value = sp.Z;
    if (massInput) massInput.value = sp.A;
  }
  
  updateRigidity();
}

/**
 * updateRigidity() — Calculate and display magnetic rigidity
 * 
 * Rigidity R = p/(q·e) at reference energy 100 MeV/nucleon
 * 
 * Formula:
 *   E_total = A × 100 MeV + A × m_p c²
 *   p = √(E_total² - (A·m_p·c²)²)
 *   R [GV] = p [MeV/c] / (Z [e] × 1000)
 * 
 * Updates #rigidity-info display element
 */
function updateRigidity() {
  const q = Math.abs(S.charge || 1);  // |Z| in elementary charges
  const A = S.mass || 1;              // Mass in AMU
  
  const E = 100;        // Reference energy: 100 MeV/nucleon
  const mp = 938.272;   // Proton rest mass energy: 938.272 MeV
  
  // Relativistic energy-momentum calculation
  const Etot = E * A + A * mp;  // Total energy in MeV
  const p = Math.sqrt(Etot**2 - (A * mp)**2);  // Momentum in MeV/c
  const R = p / (q * 1000);  // Rigidity in GV
  
  const el = $('rigidity-info');
  if (el) {
    el.textContent = `R = ${R.toFixed(3)} GV at 100 MeV/n`;
  }
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
function bndSet(type){
  S.boundaryType=type;
  $('bc-box')?.classList.toggle('sel',type==='BOX');
  $('bc-shue')?.classList.toggle('sel',type==='SHUE');
  $('bnd-box-panel').style.display=type==='BOX'?'block':'none';
  $('bnd-shue-panel').style.display=type==='SHUE'?'block':'none';
  if(type==='SHUE') bndShueUpdate(); else bndBoxUpdate();
  updateSidebar();
}
function shueMode(m){
  S.shueMode=m;
  $('shue-auto-btn')?.classList.toggle('on',m==='auto');
  $('shue-manual-btn')?.classList.toggle('on',m==='manual');
  $('shue-manual-fields').style.display=m==='manual'?'block':'none';
  $('shue-auto-box').style.opacity=m==='manual'?'0.5':'1';
  bndShueUpdate();
}
function shueCalc(){
  const bz=S.bz, pd=Math.max(0.1,S.pdyn);
  const r0=Math.max(4,Math.min(15,(11.4+0.013*bz)*Math.pow(pd,-1/6.6)));
  const al=Math.max(0.3,Math.min(0.9,(0.58-0.007*bz)*(1+0.024*Math.log(pd))));
  return {r0,alpha:al};
}
function getShue(){
  if(S.shueMode==='manual'&&S.shueR0&&S.shueAlpha) return {r0:S.shueR0,alpha:S.shueAlpha};
  return shueCalc();
}
function shueR(r0,al,deg){
  const th=deg*Math.PI/180, d=1+Math.cos(th); return d<1e-9?Infinity:r0*Math.pow(2/d,al);
}
// Map GSM → SVG
const gx=re=>CX+re*SC, gz=re=>CY-re*SC, cl=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

function bndBoxUpdate(){
  const v=k=>parseFloat($(k)?.value)||0;
  S.boxXmax=v('box-xmax'); S.boxXmin=v('box-xmin'); S.boxYmax=v('box-ymax');
  S.boxYmin=v('box-ymin'); S.boxZmax=v('box-zmax'); S.boxZmin=v('box-zmin');
  S.boxRinner=v('box-rinner');
  // Draw rectangle
  const rx=cl(gx(S.boxXmin),5,390), ry=cl(gz(S.boxZmax),5,310);
  const rw=cl(gx(S.boxXmax),5,390)-rx, rh=cl(gz(S.boxZmin),5,310)-ry;
  const rect=$('box-rect');
  if(rect){ rect.setAttribute('x',rx); rect.setAttribute('y',ry);
            rect.setAttribute('width',Math.max(0,rw)); rect.setAttribute('height',Math.max(0,rh)); }
  const ib=$('inner-box'); if(ib) ib.setAttribute('r',S.boxRinner*SC);
  const sl=(id,t,x,y)=>{ const e=$(id); if(e){e.setAttribute('x',x);e.setAttribute('y',y);e.textContent=t;} };
  sl('box-lbl-xmax','Xmax='+S.boxXmax, cl(gx(S.boxXmax)+2,10,360), CY+14);
  sl('box-lbl-xmin','Xmin='+S.boxXmin, cl(gx(S.boxXmin)-34,5,300), CY+14);
  sl('box-lbl-zmax','Zmax='+S.boxZmax, CX+4, cl(gz(S.boxZmax)-3,14,306));
  sl('box-lbl-zmin','Zmin='+S.boxZmin, CX+4, cl(gz(S.boxZmin)+11,14,306));
  // Validation
  const vi=(id,ok,okTxt,failTxt)=>{ const e=$(id); if(e) e.innerHTML=ok?`<span class="v-ok">${okTxt}</span>`:`<span class="v-warn">${failTxt}</span>`; };
  vi('bv-xrange', S.boxXmax>9,  '✓ Dayside OK',       '⚠ Xmax < 9 RE');
  vi('bv-yrange', S.boxYmax>=15,'✓ Flanks OK',        '⚠ Y < 15 RE');
  vi('bv-zrange', S.boxZmax>12&&Math.abs(S.boxZmin)>12,'✓ Z range OK','⚠ |Z| < 12 RE');
  vi('bv-inner',  S.boxRinner>=1.5&&S.boxRinner<=3.5,  '✓ R_inner OK','⚠ Typical 1.5–3.5 RE');
  // KW
  ['xmax','xmin','ymax','ymin','zmax','zmin','rinner'].forEach(k=>{
    const e=$('kw-'+k); if(e) e.textContent=Number(S['box'+k.charAt(0).toUpperCase()+k.slice(1)]).toFixed(1);
  });
}

function bndShueUpdate(){
  const v=k=>parseFloat($(k)?.value);
  S.xtail=v('shue-xtail')||S.xtail;
  S.shueRinner=v('shue-rinner')||S.shueRinner;
  if(S.shueMode==='manual'){ S.shueR0=v('shue-r0-in')||null; S.shueAlpha=v('shue-alpha-in')||null; }
  const {r0,alpha}=getShue();
  // Update auto-compute display (r0, alpha, Xsub, Rflank)
  const set=(id,v)=>{ const e=$(id); if(e) e.textContent=v; };
  set('shue-r0-val',    r0.toFixed(2));
  set('shue-alpha-val', alpha.toFixed(3));
  set('shue-xsub-val',  r0.toFixed(2));  // Xsub = r0 at θ=0°
  const rFlank=shueR(r0,alpha,90);
  set('shue-rflank-val', isFinite(rFlank)?rFlank.toFixed(1):'—');
  // Build Shue path
  const xtSvgX=cl(gx(S.xtail),8,390);
  let upper=[],lower=[];
  for(let d=0;d<=180;d+=1){
    const r=shueR(r0,alpha,d); if(!isFinite(r)) continue;
    const th=d*Math.PI/180, gx2=r*Math.cos(th), gz2=r*Math.sin(th);
    if(gx2<S.xtail) continue;
    upper.push([cl(gx(gx2),5,390), cl(gz(gz2),5,310)]);
    lower.unshift([cl(gx(gx2),5,390), cl(gz(-gz2),5,310)]);
  }
  if(upper.length>1){
    let path=`M ${upper[0][0]},${upper[0][1]}`;
    upper.forEach(([x,y])=>path+=` L ${x},${y}`);
    const tailZ=shueR(r0,alpha,179.9)*Math.sin(179.9*Math.PI/180);
    path+=` L ${xtSvgX},${cl(gz(-tailZ),5,310)}`;
    lower.forEach(([x,y])=>path+=` L ${x},${y}`);
    path+=' Z';
    $('shue-path')?.setAttribute('d',path);
  }
  // Tail cap
  const tc=$('shue-tailcap');
  if(tc){ tc.setAttribute('x1',xtSvgX); tc.setAttribute('x2',xtSvgX); tc.setAttribute('y1','20'); tc.setAttribute('y2','300'); }
  const tl=$('shue-tailcap-lbl'); if(tl){ tl.setAttribute('x',xtSvgX+3); tl.textContent='Xtail='+S.xtail; }
  // Inner boundary
  const ish=$('inner-shue'); if(ish) ish.setAttribute('r',S.shueRinner*SC);
  set('inner-shue-lbl', `R_in=${S.shueRinner} RE`);
  // r₀ annotation arrow
  const r0svgX=cl(gx(r0),10,385);
  const r0line=$('shue-r0-line');
  if(r0line){ r0line.setAttribute('x2',r0svgX); r0line.setAttribute('y2',CY); }
  const r0lbl=$('shue-r0-lbl');
  if(r0lbl){ r0lbl.setAttribute('x',cl(gx(r0/2),10,370)); r0lbl.textContent=`r₀=${r0.toFixed(1)}`; }
  // Flank annotation arrow (Earth → terminator, X=0, Z=R_flank)
  if(isFinite(rFlank)){
    const flkSvgY=cl(gz(Math.min(rFlank,28)),10,300);
    const flkLine=$('shue-flank-line');
    if(flkLine){ flkLine.setAttribute('x1',CX); flkLine.setAttribute('y1',CY); flkLine.setAttribute('x2',CX); flkLine.setAttribute('y2',flkSvgY); }
    const flkLbl=$('shue-flank-lbl');
    if(flkLbl){ flkLbl.setAttribute('y',((flkSvgY+CY)/2).toFixed(1)); flkLbl.textContent=`Rflk=${rFlank.toFixed(1)}`; }
  }
  // Dynamic text readouts inside SVG
  set('shue-svg-r0',    `r₀=${r0.toFixed(2)} RE`);
  set('shue-svg-alpha', `α=${alpha.toFixed(3)}`);
  set('shue-svg-dst',   `Dst=${S.dst<0?'−'+Math.abs(S.dst):S.dst} nT`);
  set('shue-svg-pdyn',  `Pdyn=${S.pdyn} nPa`);
  // Validation
  const vi=(id,ok,okT,failT)=>{ const e=$(id); if(e) e.innerHTML=ok?`<span class="bv-ok">${okT}</span>`:`<span class="bv-warn">${failT}</span>`; };
  vi('sv-r0',    r0>5&&r0<13,          `✓ r₀=${r0.toFixed(2)} R<sub>E</sub> (storm-time)`, `⚠ r₀=${r0.toFixed(2)} — outside 5–13 R<sub>E</sub>`);
  vi('sv-alpha', alpha>0.4&&alpha<0.8, `✓ α=${alpha.toFixed(3)} (normal range)`,            `⚠ α=${alpha.toFixed(3)} — outside 0.40–0.80`);
  vi('sv-tail',  S.xtail<-20,          `✓ Tail cap at ${S.xtail} R<sub>E</sub>`,            `⚠ X_tail should be < −20 R<sub>E</sub>`);
  // KW strip
  const isM=S.shueMode==='manual';
  set('kw-shue-r0',     isM?r0.toFixed(2):'AUTO');
  set('kw-shue-alpha',  isM?alpha.toFixed(3):'AUTO');
  set('kw-xtail',       S.xtail.toFixed(1));
  set('kw-shue-rinner', S.shueRinner.toFixed(1));
}

/* ── 3f. STEP 5 TEMPORAL ─────────────────────────────────────────── */
function setTempMode(m){
  S.tempMode=m;
  document.querySelectorAll('.temp-card').forEach(c=>c.classList.toggle('sel',c.dataset.mode===m));
  $('ts-form').style.display=m!=='STEADY_STATE'?'block':'none';
  updateSidebar();
}
function checkDtPair(){
  const fd=parseFloat($('field-update-dt')?.value)||5;
  const id=parseFloat($('inject-dt')?.value)||30;
  S.fieldDt=fd; S.injectDt=id;
  $('dt-warn').style.display = id<fd?'block':'none';
  updateTimeline();
}
function updateTimeline(){
  const tl=$('ts-timeline'); if(!tl) return;
  tl.innerHTML='<div class="fu-axis"></div>';
  const dur=120, fd=Math.max(1,S.fieldDt), id_=Math.max(1,S.injectDt);
  for(let t=0;t<=dur;t+=fd){
    const pct=(t/dur)*100;
    const tick=document.createElement('div'); tick.className='fu-tick';
    tick.style.left=pct+'%'; tl.appendChild(tick);
    if(t%30===0){ const lbl=document.createElement('div'); lbl.className='fu-label'; lbl.style.left=pct+'%'; lbl.textContent=t+'m'; tl.appendChild(lbl); }
  }
  for(let t=id_;t<=dur;t+=id_){
    const pct=(t/dur)*100;
    const p=document.createElement('div'); p.className='fu-particle'; p.style.left=(pct-.5)+'%'; p.textContent='⚡'; tl.appendChild(p);
  }
}
function setTsSource(btnOrSrc, src){
  // Called as setTsSource(btn, 'omni') from new HTML or setTsSource('omni') from old refs
  const mode = src || btnOrSrc;
  S.tsSource=mode;
  document.querySelectorAll('#ts-source-tog .tog-btn').forEach(b=>b.classList.remove('on'));
  const btnId={'omni':'ts-omni-btn','file':'ts-file-btn','scalar':'ts-scalar-btn'}[mode];
  if(btnId) $(btnId)?.classList.add('on');
  $('omni-panel').style.display=mode==='omni'?'block':'none';
  $('file-panel').style.display=mode==='file'?'block':'none';
}
function simulateOmniFetch(){
  const cadSel=$('omni-cadence');
  const cadMin=cadSel&&cadSel.value.startsWith('1 min')?1:cadSel&&cadSel.value.startsWith('1 hr')?60:5;
  const startEl=$('event-start'), endEl=$('event-end');
  const start=startEl?new Date(startEl.value):new Date('2017-09-07T00:00');
  const end=endEl?new Date(endEl.value):new Date('2017-09-10T20:00');
  const hrs=Math.max(0,(end-start)/(1000*3600));
  const rowCount=Math.round(hrs*60/cadMin);
  const msgs=[
    `⏳ Querying omniweb.gsfc.nasa.gov for ${cadMin}-min OMNI…`,
    '⏳ Querying wdc.kugi.kyoto-u.ac.jp for Dst / Sym-H…',
    '⏳ Merging streams and gap-filling…',
    '⏳ Generating preview and data quality report…'
  ];
  const steps=['os-1','os-2','os-3','os-4'];
  steps.forEach(id=>{ const e=$(id); if(e){e.classList.remove('done');e.className='os-num pending';e.textContent=steps.indexOf(id)+1;} });
  const st=$('omni-status'); if(st) st.innerHTML=`<span style="color:var(--orange)">${msgs[0]}</span>`;
  let i=0;
  const adv=()=>{
    if(i>0){ const pe=$(steps[i-1]); if(pe){pe.className='os-num done';pe.textContent='✓';} }
    if(i<steps.length){
      const ce=$(steps[i]); if(ce){ce.className='os-num';ce.style.background='var(--orange)';ce.textContent='…';}
      if(st&&msgs[i]) st.innerHTML=`<span style="color:var(--orange)">${msgs[i]}</span>`;
      i++; setTimeout(adv,700);
    } else {
      const s=startEl?startEl.value.replace('T',' '):'-', e=endEl?endEl.value.replace('T',' '):'-';
      if(st) st.innerHTML=`<span class="ok">✓ Fetch complete</span>&nbsp;&nbsp;Time range: <span style="color:#fff;">${s} → ${e} UTC</span><br/>`+
        `${rowCount} rows @ ${cadMin} min cadence&nbsp;·&nbsp;<span class="warn">⚠ 1 gap 19:00–19:30 UTC — linear interpolation applied (6 rows)</span>`;
    }
  };
  adv();
}

/* ── 3g. STEP 6 SPECTRUM ─────────────────────────────────────────── */
function setSpec(type,card){
  S.specType=type;
  document.querySelectorAll('.spec-card').forEach(c=>c.classList.remove('sel'));
  if(card) card.classList.add('sel');
  ['pl-form','plc-form','lis-form','band-form','table-form'].forEach(id=>{
    const m={'pl-form':'POWER_LAW','plc-form':'POWER_LAW_CUTOFF','lis-form':'LIS_FORCE_FIELD','band-form':'BAND','table-form':'TABLE'};
    const el=$(id); if(el) el.style.display=m[id]===type?'block':'none';
  });
  drawSpec();
}
function drawSpec(){
  S.specJ0=parseFloat($('spec-j0')?.value)||S.specJ0;
  S.specGamma=parseFloat($('spec-gamma')?.value)||S.specGamma;
  S.specE0=parseFloat($('spec-e0')?.value)||S.specE0;
  S.specEmin=parseFloat($('spec-emin')?.value)||S.specEmin;
  S.specEmax=parseFloat($('spec-emax')?.value)||S.specEmax;
  S.specEc=parseFloat($('spec-ec')?.value)||S.specEc;
  S.specPhi=parseFloat($('spec-phi')?.value)||S.specPhi;
  S.specLisJ0=parseFloat($('lis-j0')?.value)||S.specLisJ0;
  S.specLisGamma=parseFloat($('lis-gamma')?.value)||S.specLisGamma;
  const canvas=$('spec-canvas'); if(!canvas) return;
  const W=canvas.parentElement.clientWidth||400, H=160;
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#060e1c'; ctx.fillRect(0,0,W,H);
  const emin=Math.max(0.1,S.specEmin), emax=Math.min(1e5,S.specEmax);
  const lemin=Math.log10(emin), lemax=Math.log10(emax);
  const ljmin=-2, ljmax=8, pad=28;
  ctx.strokeStyle='#0d2040'; ctx.lineWidth=0.5;
  for(let le=Math.ceil(lemin);le<=Math.floor(lemax);le++){
    const x=((le-lemin)/(lemax-lemin))*(W-pad-10)+pad;
    ctx.beginPath(); ctx.moveTo(x,5); ctx.lineTo(x,H-18); ctx.stroke();
    ctx.fillStyle='#2a4060'; ctx.font='8px IBM Plex Mono';
    ctx.fillText('10^'+le,x-8,H-4);
  }
  for(let lj=ljmin;lj<=ljmax;lj+=2){
    const y=H-18-((lj-ljmin)/(ljmax-ljmin))*(H-22);
    ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-8,y); ctx.stroke();
    ctx.fillStyle='#2a4060'; ctx.font='7px IBM Plex Mono'; ctx.fillText('10^'+lj,1,y+3);
  }
  ctx.strokeStyle='#38c0ff'; ctx.lineWidth=2; ctx.beginPath();
  let started=false;
  for(let i=0;i<=300;i++){
    const le=lemin+(i/300)*(lemax-lemin), E=Math.pow(10,le);
    let J;
    if(S.specType==='POWER_LAW') {
      J=S.specJ0*Math.pow(E/(S.specE0||10),-(S.specGamma||3.5));
    } else if(S.specType==='POWER_LAW_CUTOFF') {
      const j0=parseFloat($('plc-j0')?.value)||S.specJ0;
      const gamma=parseFloat($('plc-gamma')?.value)||S.specGamma;
      const e0=parseFloat($('plc-e0')?.value)||S.specE0;
      const ec=S.specEc||500;
      J=j0*Math.pow(E/e0,-gamma)*Math.exp(-E/ec);
    } else if(S.specType==='LIS_FORCE_FIELD') {
      const jLis=S.specLisJ0||10000;
      const gammaLis=S.specLisGamma||2.7;
      const e0=parseFloat($('lis-e0')?.value)||S.specE0;
      const phi=S.specPhi||550;
      const M=938.272;
      const Ephi=E+phi;
      const Esq=E*E, Ephisq=Ephi*Ephi;
      const Jlis_at_Ephi=jLis*Math.pow(Ephi/e0,-gammaLis);
      J=Jlis_at_Ephi*(Esq+2*E*M)/(Ephisq+2*Ephi*M);
    } else if(S.specType==='BAND'){
      const g1=parseFloat($('band-gamma1')?.value)||3.5, g2=parseFloat($('band-gamma2')?.value)||1.5;
      const e0=parseFloat($('band-e0')?.value)||10, Eb=(g1-g2)*e0;
      J=E<Eb?S.specJ0*Math.pow(E/e0,-g1)*Math.exp(-E/e0):S.specJ0*Math.pow((g1-g2),g1-g2)*Math.exp(g2-g1)*Math.pow(E/e0,-g2);
    } else break;
    const lJ=Math.log10(Math.max(1e-4,J));
    const x=((le-lemin)/(lemax-lemin))*(W-pad-10)+pad;
    const y=H-18-((lJ-ljmin)/(ljmax-ljmin))*(H-22);
    if(!started){ ctx.moveTo(x,Math.max(5,Math.min(H-18,y))); started=true; }
    else ctx.lineTo(x,Math.max(5,Math.min(H-18,y)));
  }
  ctx.stroke();
}

/* ── 3h. STEP 7 OUTPUT DOMAIN ────────────────────────────────────── */
function setMode(m,card){
  S.outputMode=m;
  document.querySelectorAll('.mode-card').forEach(c=>c.classList.remove('sel'));
  if(card) card.classList.add('sel');
  ['panel-mode-a','panel-mode-b','panel-mode-c'].forEach(id=>{
    const map={'panel-mode-a':'POINTS','panel-mode-b':'TRAJECTORY','panel-mode-c':'SHELLS'};
    const el=$(id); if(el) el.style.display=map[id]===m?'block':'none';
  });
  updateSidebar();
}
function loadTrajExample(){
  S.trajLoaded=true;
  const dz=$('traj-dropzone');
  if(dz){ dz.classList.add('loaded');
    dz.innerHTML='<div class="dz-icon">✅</div><div class="dz-primary" style="color:var(--green)">VanAllenProbeA_sep2017.txt</div><div class="dz-sub">14,412 rows · Gregorian format · 2017-09-07 → 2017-09-10 UTC</div>'; }
  $('traj-preview-panel').style.display='block';
}

/* ── 3i. STEP 8 OUTPUT OPTIONS ───────────────────────────────────── */
function setFluxType(t,btn){
  S.fluxType=t;
  document.querySelectorAll('.flux-type-btn').forEach(b=>b.classList.remove('on'));
  if(btn) btn.classList.add('on');
}
const PRESETS={
  default:[1,5,10,30,100,300,1000],
  fine:[1,2,3,5,7,10,15,20,30,50,70,100,200,300,500,1000],
  goes:[5,10,30,50,60,100,300,500],
  broad:[1,10,100,1000],
};
function applyBinPreset(k){ if(PRESETS[k]){ S.energyBins=[...PRESETS[k]]; renderBins(); } }
function addBin(){
  const inp=$('new-bin-val'); if(!inp) return;
  const v=parseFloat(inp.value);
  if(v>0&&!S.energyBins.includes(v)){ S.energyBins.push(v); renderBins(); inp.value=''; }
}
function removeBin(i){ S.energyBins.splice(i,1); renderBins(); }
function renderBins(){
  S.energyBins.sort((a,b)=>a-b);
  const c=$('ebin-list'); if(!c) return; c.innerHTML='';
  const jAtE=E=>S.specJ0*Math.pow(E/(S.specE0||10),-(S.specGamma||3.5));
  const maxJ=Math.max(...S.energyBins.map(jAtE));
  S.energyBins.forEach((e,i)=>{
    const pct=Math.max(5,Math.min(100,(Math.log10(jAtE(e))-Math.log10(1e-3))/(Math.log10(maxJ+1)-Math.log10(1e-3))*100));
    const row=document.createElement('div'); row.className='ebin-row';
    row.innerHTML=`<span class="ebin-range" style="color:#38c0ff">${e} MeV/n</span>
      <div class="ebin-bar-wrap"><div class="ebin-bar" style="width:${pct.toFixed(0)}%"></div></div>
      <span style="font-size:10px;color:var(--text-dim)">${jAtE(e).toExponential(1)} p/cm²/s/sr/(MeV/n)</span>
      <span class="ebin-del" onclick="removeBin(${i})" title="Remove">✕</span>`;
    c.appendChild(row);
  });
  const ts=$('total-output-size'); if(ts) ts.textContent=`~${(S.energyBins.length*0.8).toFixed(1)} GB output`;
}

/* ── 4. SVG GRID INIT ────────────────────────────────────────────── */
function drawSvgGrid(svgId){
  const g=document.getElementById(svgId); if(!g) return;
  let html='';
  for(let x=-60;x<=20;x+=5){
    const px=cl(gx(x),5,390);
    html+=`<line x1="${px}" y1="4" x2="${px}" y2="316" stroke="${x===0?'#1e3a5a':'#0c1e38'}" stroke-width="${x===0?1:0.5}" ${x!==0?'stroke-dasharray="3,5"':''}/>`;
    if(x%20===0&&x!==0) html+=`<text x="${px-8}" y="${CY+18}" fill="#1a3050" font-family="IBM Plex Mono" font-size="8">${x}RE</text>`;
  }
  for(let z=-35;z<=35;z+=5){
    const py=cl(gz(z),5,310);
    html+=`<line x1="4" y1="${py}" x2="396" y2="${py}" stroke="${z===0?'#1e3a5a':'#0c1e38'}" stroke-width="${z===0?1:0.5}" ${z!==0?'stroke-dasharray="3,5"':''}/>`;
    if(z%20===0&&z!==0) html+=`<text x="${CX+3}" y="${py+3}" fill="#1a3050" font-family="IBM Plex Mono" font-size="8">${z}RE</text>`;
  }
  g.innerHTML=html;
}

/* ── 5. REVIEW & PARAM FILE ──────────────────────────────────────── */
function buildReview(){
  const {r0,alpha}=getShue();
  const isM=S.shueMode==='manual';
  const f=(v,d)=>Number(v).toFixed(d);
  const txt=[
`! ═══════════════════════════════════════════════════════════════
! AMPS_PARAM.in — generated by CCMC Runs-on-Request interface
! Run: ${S.runName||'unnamed'}
! ═══════════════════════════════════════════════════════════════

#RUN_INFO
RUN_ID                 ${S.runName||'unnamed'}
PI_NAME                ${S.piName||'Unknown'}
PI_EMAIL               ${S.piEmail||'unknown@unknown.edu'}
SCIENCE_GOAL           ${$('science-goal')?.value||'custom'}

#PARTICLE_SPECIES
SPECIES                ${S.species.toUpperCase()}
CHARGE                 ${S.charge}               ! elementary charge
MASS_AMU               ${S.mass}           ! atomic mass units

#BACKGROUND_FIELD
FIELD_MODEL            ${S.fieldModel}
TS05_DST               ${f(S.dst,1)}         ! nT ring current index
TS05_PDYN              ${f(S.pdyn,2)}          ! nPa dynamic pressure
TS05_BZ                ${f(S.bz,2)}         ! nT IMF Bz GSM
TS05_VX                ${f(S.vx,1)}       ! km/s solar wind Vx
TS05_NSW               ${f(S.nsw,2)}         ! cm-3 proton density
TS05_BY                ${f(S.by,2)}          ! nT IMF By
TS05_BX                ${f(S.bx,2)}          ! nT IMF Bx
EPOCH                  ${S.epoch}  ! UTC snapshot

#DOMAIN_BOUNDARY
BOUNDARY_TYPE          ${S.boundaryType}${S.boundaryType==='SHUE'?'  ! Shue et al. 1998 magnetopause':'  ! rectangular box in GSM'}`,
S.boundaryType==='BOX'?`DOMAIN_X_MAX           ${f(S.boxXmax,1)}         ! RE dayside
DOMAIN_X_MIN           ${f(S.boxXmin,1)}        ! RE nightside
DOMAIN_Y_MAX           ${f(S.boxYmax,1)}         ! RE dusk
DOMAIN_Y_MIN           ${f(S.boxYmin,1)}        ! RE dawn
DOMAIN_Z_MAX           ${f(S.boxZmax,1)}         ! RE north
DOMAIN_Z_MIN           ${f(S.boxZmin,1)}        ! RE south
R_INNER                ${f(S.boxRinner,1)}           ! RE inner loss sphere`:
`SHUE_R0                ${isM?f(r0,2):'AUTO'}            ! RE; AUTO = from TS05 Bz,Pdyn
SHUE_ALPHA             ${isM?f(alpha,3):'AUTO'}         ! flaring; AUTO = from TS05
DOMAIN_X_TAIL          ${f(S.xtail,1)}        ! RE nightside cap
R_INNER                ${f(S.shueRinner,1)}           ! RE inner loss sphere`,
`
#TEMPORAL
TEMPORAL_MODE          ${S.tempMode}`,
S.tempMode!=='STEADY_STATE'?`EVENT_START            ${S.eventStart}   ! UTC
EVENT_END              ${S.eventEnd}   ! UTC
FIELD_UPDATE_DT        ${S.fieldDt}                ! min
INJECT_DT              ${S.injectDt}               ! min
TS_INPUT_MODE          ${S.tsSource==='omni'?'OMNIWEB':S.tsSource==='file'?'FILE':'SCALAR'}`:
`EPOCH                  ${S.epoch}`,
`
#SPECTRUM
SPECTRUM_TYPE          ${S.specType}`,
S.specType==='POWER_LAW'?`SPEC_J0                ${S.specJ0.toExponential(2)}   ! p/cm2/s/sr/(MeV/n)
SPEC_GAMMA             ${f(S.specGamma,2)}         ! spectral index
SPEC_E0                ${f(S.specE0,1)}          ! MeV/n pivot`:
S.specType==='POWER_LAW_CUTOFF'?`SPEC_J0                ${S.specJ0.toExponential(2)}   ! p/cm2/s/sr/(MeV/n)
SPEC_GAMMA             ${f(S.specGamma,2)}         ! spectral index
SPEC_E0                ${f(S.specE0,1)}          ! MeV/n pivot
SPEC_EC                ${f(S.specEc,1)}        ! MeV/n exponential cutoff`:
S.specType==='LIS_FORCE_FIELD'?`SPEC_LIS_J0            ${S.specLisJ0.toExponential(2)}   ! p/cm2/s/sr/(MeV/n) LIS normalization
SPEC_LIS_GAMMA         ${f(S.specLisGamma,2)}         ! LIS spectral index
SPEC_E0                ${f($('lis-e0')?.value||S.specE0,1)}          ! MeV/n pivot
SPEC_PHI               ${f(S.specPhi,0)}          ! MV solar modulation potential`:
S.specType==='BAND'?`SPEC_J0                ${S.specJ0.toExponential(2)}   ! p/cm2/s/sr/(MeV/n)
SPEC_GAMMA1            ${f(parseFloat($('band-gamma1')?.value)||3.5,2)}         ! low-energy index
SPEC_GAMMA2            ${f(parseFloat($('band-gamma2')?.value)||1.5,2)}         ! high-energy index
SPEC_E0                ${f(parseFloat($('band-e0')?.value)||10,1)}          ! MeV/n break energy`:
S.specType==='TABLE'?`SPEC_TABLE_FILE        sep_spectrum_H+.txt  ! user-provided E vs J table`:``,
`SPEC_EMIN              ${f(S.specEmin,1)}          ! MeV/n
SPEC_EMAX              ${f(S.specEmax,1)}       ! MeV/n

#OUTPUT_DOMAIN
OUTPUT_MODE            ${S.outputMode}
FLUX_DT                ${f(S.fluxDt,1)}           ! min output cadence

#OUTPUT_OPTIONS
FLUX_TYPE              ${S.fluxType}
OUTPUT_CUTOFF          ${$('output-cutoff')?.checked?'T':'F'}                    ! cutoff rigidity maps
OUTPUT_PITCH           ${$('output-pitch')?.checked?'T':'F'}                    ! pitch angle distributions
OUTPUT_FORMAT          ${$('output-format')?.value||S.outputFormat}
OUTPUT_COORDS          ${$('output-coords')?.value||S.outputCoords}
ENERGY_BINS            ${S.energyBins.join(' ')}   ! MeV/n

#NUMERICAL
N_PARTICLES            10000              ! test particles per injection
MAX_BOUNCE             500                ! max mirror reflections
DT_TRACE               1.0               ! s integration step
PITCH_ISOTROPIC        T                 ! isotropic injection

#END`
].join('\n');

  const el=$('review-param'); if(!el) return;
  el.innerHTML=txt
    .replace(/^(#\w[\w_]*)/gm,'<span class="r-section">$1</span>')
    .replace(/^(! .+)/gm,'<span class="r-comment">$1</span>')
    .replace(/(AUTO)/g,'<span class="r-auto">AUTO</span>');

  buildManifest(); buildValidation();
  return txt;
}

function copyParam(){ navigator.clipboard.writeText(buildReview().replace(/<[^>]+>/g,'')).then(()=>{ const b=$('copy-param'); if(b){b.textContent='✓ Copied';setTimeout(()=>{b.textContent='📋 Copy';},2000);} }); }
function downloadParam(){
  const txt=(buildReview()||'').replace(/<[^>]+>/g,'');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'}));
  a.download='AMPS_PARAM.in'; a.click();
}

function buildManifest(){
  const tb=$('manifest-tbody'); if(!tb) return;
  const files=[
    {name:'AMPS_PARAM.in',      role:'Main configuration',            req:true, auto:true,  ok:true},
    {name:'AMPS_MANIFEST.json', role:'Run metadata (auto-generated)', req:true, auto:true,  ok:true},
    {name:'trajectory.txt',     role:'Spacecraft trajectory (Mode B)',req:S.outputMode==='TRAJECTORY', auto:false, ok:S.trajLoaded},
    {name:'ts05_driving.txt',   role:'TS05 time-series drivers',      req:S.tempMode==='TIME_SERIES'&&S.tsSource==='file', auto:S.tsSource==='omni', ok:true},
    {name:'sep_spectrum_H+.txt',role:'Spectrum table (if TABLE mode)',req:S.specType==='TABLE', auto:false, ok:S.specType!=='TABLE'},
  ];
  tb.innerHTML=files.filter(f=>f.req||f.auto).map(f=>`
    <tr>
      <td style="font-family:var(--font-mono);color:var(--text)">${f.name}</td>
      <td style="color:var(--text-dim)">${f.role}</td>
      <td style="color:${f.req?'var(--text)':'var(--text-muted)'}">${f.req?'Required':'Optional'}</td>
      <td style="color:${f.auto?'var(--green)':'var(--text-dim)'}">${f.auto?'Auto-generated':'User upload'}</td>
      <td class="${f.ok?'vt-pass':'vt-fail'}">${f.ok?'✓ READY':'✗ MISSING'}</td>
    </tr>`).join('');
}

function buildValidation(){
  const {r0,alpha}=getShue();
  const chks=[
    {l:'Run name set',           ok:!!(S.runName?.trim())},
    {l:'PI email valid',         ok:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('pi-email')?.value||'')},
    {l:'Dst in TS05 range',      ok:S.dst>=-600&&S.dst<=50},
    {l:'Pdyn > 0.1 nPa',         ok:S.pdyn>0.1},
    {l:'Domain boundary set',    ok:['BOX','SHUE'].includes(S.boundaryType)},
    {l:'Shue r₀ plausible (5–13 RE)', ok:S.boundaryType!=='SHUE'||( r0>5&&r0<13)},
    {l:'Inject Δt ≥ Field Update', ok:S.tempMode==='STEADY_STATE'||S.injectDt>=S.fieldDt},
    {l:'Energy bins defined',    ok:S.energyBins.length>0},
    {l:'Spectrum type selected', ok:['POWER_LAW','POWER_LAW_CUTOFF','LIS_FORCE_FIELD','BAND','TABLE'].includes(S.specType)},
    {l:'Output mode selected',   ok:['POINTS','TRAJECTORY','SHELLS'].includes(S.outputMode)},
    {l:'Trajectory file loaded', ok:S.outputMode!=='TRAJECTORY'||S.trajLoaded, warn:true},
  ];
  const pass=chks.filter(c=>c.ok).length;
  const fail=chks.filter(c=>!c.ok&&!c.warn).length;
  const warn=chks.filter(c=>!c.ok&&c.warn).length;
  const rs=$('review-summary');
  if(rs) rs.innerHTML=`<span class="v-ok">✓ ${pass} passed</span> · <span class="v-warn">⚠ ${warn} warning</span> · <span class="v-err">✗ ${fail} fatal</span>`;
  const rc=$('review-checks'); if(rc){ rc.innerHTML='';
    chks.forEach(c=>{ const d=document.createElement('div');
      d.className='review-item '+(c.ok?'ri-ok':c.warn?'ri-warn':'');
      d.innerHTML=`<div class="ri-label">${c.l}</div><div class="ri-val">${c.ok?'✓ PASS':c.warn?'⚠ WARN':'✗ FAIL'}</div>`;
      rc.appendChild(d); }); }
  const sb=$('submit-btn-final'); if(sb) sb.disabled=fail>0;
}

function finalSubmit(){
  const m=$('submit-modal'); if(m) m.style.display='flex';
}

/* ── 6. SIDEBAR ──────────────────────────────────────────────────── */
function updateSidebar(){
  const set=(id,v,cls)=>{ const e=$(id); if(e){e.textContent=v;if(cls)e.className='sb-v '+cls;} };
  set('sb-run-name', S.runName||'(not set)', S.runName?'':'o');
  set('sb-species',  S.species==='proton'?'H⁺ Proton':S.species==='helium'?'He²⁺':S.species==='electron'?'e⁻':S.species,'g');
  set('sb-field-model','TS05','g');
  set('sb-boundary', S.boundaryType==='SHUE'?'Shue 1998':'Box (GSM)','g');
  set('sb-temporal', S.tempMode.replace('_',' '),'');
  const prettySpec = {
    POWER_LAW: 'POWER LAW',
    POWER_LAW_CUTOFF: 'PL + EXP CUTOFF',
    LIS_FORCE_FIELD: 'LIS + FORCE-FIELD',
    BAND: 'BAND FUNCTION',
    TABLE: 'TABLE FILE'
  };
  set('sb-spec-type', prettySpec[S.specType] || S.specType.replace('_',' '),'');
  set('sb-output-mode', S.outputMode.replace('_',' '),'g');
  const pct=Math.round((S.done.size/9)*100);
  const pf=$('progress-fill'); if(pf) pf.style.width=pct+'%';
  const pp=$('progress-pct'); if(pp) pp.textContent=pct+'%';
}

/* ── 7. HELP MODAL ───────────────────────────────────────────────── */
function openHelpModal(){ const m=$('help-modal'); if(m) m.style.display='flex'; }


/* ── §3d-extra  BACKGROUND FIELD MODEL SELECTOR ─────────────────── */
/*    selectFieldModel(model) : activates model card, shows parameter
      form, updates KW preview.  t95mChange/t15Change/mhdChange: live
      state sync for model-specific driving parameters.              */

/*
  =============================================================================
  STEP 3 JS (Bkg B-Field) — updated selector + driver sync

  IMPORTANT (do not change this to <!-- ... -->):
    Inside <script> tags, "<!--" is treated as a *single-line* JavaScript
    comment by legacy web-compat rules. That means only the first line would
    be commented out, while the separator lines (e.g., "=====") would be parsed
    as JavaScript and trigger a syntax error. When that happens, the wizard
    initialization code never runs and the step switching breaks.

  This standalone file inlines the same logic as js/03-bgfield.js.
  Keep these functions in sync with the multi-file site.
  =============================================================================
*/
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

  // Shue boundary auto-compute depends on TS05 Bz/Pdyn — recompute
  bndShueUpdate();

  updateSidebar();
}

function t96Change(){
  S.t96Dst  = parseFloat($('t96-dst')?.value)  || S.t96Dst;
  S.t96Pdyn = parseFloat($('t96-pdyn')?.value) || S.t96Pdyn;
  S.t96By   = parseFloat($('t96-by')?.value)   || S.t96By;
  S.t96Bz   = parseFloat($('t96-bz')?.value)   || S.t96Bz;
  S.t96Tilt = parseFloat($('t96-tilt')?.value) || S.t96Tilt;
  const set=(id,v)=>{const e=$(id); if(e) e.textContent=v;};
  set('kv-t96-dst',  Number(S.t96Dst).toFixed(1));
  set('kv-t96-pdyn', Number(S.t96Pdyn).toFixed(2));
  set('kv-t96-by',   Number(S.t96By).toFixed(2));
  set('kv-t96-bz',   Number(S.t96Bz).toFixed(2));
  set('kv-t96-tilt', Number(S.t96Tilt).toFixed(1));
  updateSidebar();
}

function t01Change(){
  S.t01Dst  = parseFloat($('t01-dst')?.value)  || S.t01Dst;
  S.t01Pdyn = parseFloat($('t01-pdyn')?.value) || S.t01Pdyn;
  S.t01By   = parseFloat($('t01-by')?.value)   || S.t01By;
  S.t01Bz   = parseFloat($('t01-bz')?.value)   || S.t01Bz;
  S.t01Tilt = parseFloat($('t01-tilt')?.value) || S.t01Tilt;
  const set=(id,v)=>{const e=$(id); if(e) e.textContent=v;};
  set('kv-t01-dst',  Number(S.t01Dst).toFixed(1));
  set('kv-t01-pdyn', Number(S.t01Pdyn).toFixed(2));
  set('kv-t01-by',   Number(S.t01By).toFixed(2));
  set('kv-t01-bz',   Number(S.t01Bz).toFixed(2));
  set('kv-t01-tilt', Number(S.t01Tilt).toFixed(1));
  updateSidebar();
}

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


function dstToKp(dst) {
  return Math.max(0, Math.min(9, Math.round((-dst / 28 + 0.8) * 10) / 10));
}
function vsIntensityA(kp) {
  const d = Math.pow(1 - 0.159*kp + 0.0093*kp*kp, 3);
  return d > 0 ? 0.045/d : 0.045;
}
function setCorotation(include) {
  S.eFieldCoro = include;
  $('ecoro-yes-btn')?.classList.toggle('on', include);
  $('ecoro-no-btn')?.classList.toggle('on', !include);
  const warn = $('ecoro-off-warn'); if (warn) warn.style.display = !include ? 'block' : 'none';
  const kw = $('kw-efield-coro'); if (kw) kw.textContent = include ? 'YES' : 'NO';
  updateSidebar();
}
function setConvModel(model) {
  S.eFieldConvModel = model;
  document.querySelectorAll('.bnd-card[id^="econv-"]').forEach(c => c.classList.remove('sel'));
  $(`econv-${model.toLowerCase().replace('_','-')}`)?.classList.add('sel');
  $('vs-panel').style.display     = model === 'VOLLAND_STERN' ? 'block' : 'none';
  $('weimer-panel').style.display = model === 'WEIMER'        ? 'block' : 'none';
  document.querySelectorAll('.vs-kw-row').forEach(r =>
    r.style.display = model === 'VOLLAND_STERN' ? '' : 'none');
  document.querySelectorAll('.weimer-kw-row').forEach(r =>
    r.style.display = model === 'WEIMER' ? '' : 'none');
  const kw = $('kw-efield-conv'); if (kw) kw.textContent = model;
  drawEfieldSchematic();
  updateSidebar();
}
function setVsKpMode(mode) {
  S.vsKpMode = mode;
  $('vs-kp-auto-btn')?.classList.toggle('on', mode === 'auto');
  $('vs-kp-man-btn')?.classList.toggle('on',  mode === 'manual');
  $('vs-kp-auto-row').style.display   = mode === 'auto'   ? 'flex' : 'none';
  $('vs-kp-manual-row').style.display = mode === 'manual' ? 'flex' : 'none';
  vsParamChange();
}
function vsParamChange() {
  if (S.vsKpMode === 'manual') S.vsKp = parseFloat($('vs-kp-input')?.value) ?? S.vsKp;
  else { S.vsKp = dstToKp(S.dst); const d=$('vs-kp-auto-display'); if(d) d.textContent=S.vsKp.toFixed(1); }
  S.vsGamma = parseFloat($('vs-gamma')?.value) || S.vsGamma;
  S.vsA = vsIntensityA(S.vsKp);
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
  set('vs-a-display', S.vsA.toFixed(4));
  set('kw-vs-kp',     S.vsKpMode==='auto' ? 'AUTO' : S.vsKp.toFixed(1));
  set('kw-vs-gamma',  S.vsGamma.toFixed(1));
  set('kw-vs-a',      S.vsA.toFixed(4));
  const st=$('vs-kp-status');
  if(st){
    if(S.vsKp<2){st.textContent='🟢 Quiet';st.style.color='var(--green)';}
    else if(S.vsKp<5){st.textContent='🟡 Moderate';st.style.color='var(--orange)';}
    else{st.textContent='🔴 Storm';st.style.color='var(--red)';}
  }
  drawEfieldSchematic();
}
function setWeimerMode(mode) {
  S.weimerMode = mode;
  $('weimer-auto-btn')?.classList.toggle('on', mode==='auto');
  $('weimer-file-btn')?.classList.toggle('on', mode==='file');
  $('weimer-auto-panel').style.display = mode==='auto' ? 'block' : 'none';
  $('weimer-file-panel').style.display = mode==='file' ? 'block' : 'none';
}
function drawEfieldSchematic() {
  const svg=$('efield-svg'); if(!svg) return;
  const CX=100,CY=100; let h='';
  if(S.eFieldCoro){
    for(let r=20;r<=85;r+=22)
      h+=`<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="rgba(45,212,160,.2)" stroke-width="1" stroke-dasharray="4,4"/>`;
    h+=`<text x="128" y="38" font-size="9" fill="rgba(45,212,160,.55)" font-family="IBM Plex Mono">corot.</text>`;
  }
  if(S.eFieldConvModel==='VOLLAND_STERN'){
    const kp=S.vsKp||5, sc=0.55+kp*0.06;
    [18,36,58].forEach(d=>{
      const off=d*sc*0.35;
      h+=`<ellipse cx="${CX-off}" cy="${CY}" rx="${d}" ry="${d*.75}" fill="none" stroke="rgba(56,192,255,.28)" stroke-width="1.2" transform="rotate(-12,${CX},${CY})"/>`;
      h+=`<ellipse cx="${CX+off}" cy="${CY}" rx="${d}" ry="${d*.75}" fill="none" stroke="rgba(255,154,60,.28)" stroke-width="1.2" transform="rotate(12,${CX},${CY})"/>`;
    });
    h+=`<text x="8" y="105" font-size="9" fill="rgba(56,192,255,.65)" font-family="IBM Plex Mono">Dawn+</text>`;
    h+=`<text x="148" y="105" font-size="9" fill="rgba(255,154,60,.65)" font-family="IBM Plex Mono">Dusk−</text>`;
    h+=`<text x="46" y="192" font-size="8" fill="rgba(255,208,75,.6)" font-family="IBM Plex Mono">Kp=${kp.toFixed(1)} γ=${S.vsGamma.toFixed(1)}</text>`;
  } else if(S.eFieldConvModel==='WEIMER'){
    const r1=38+Math.min(3,Math.abs(S.bz||0)/8)*12;
    h+=`<path d="M${CX},${CY-r1} A${r1},${r1*.85} -20 0,1 ${CX+r1*.65},${CY}" fill="none" stroke="rgba(139,111,247,.45)" stroke-width="1.5"/>`;
    h+=`<path d="M${CX},${CY-r1} A${r1},${r1*.85} 20 0,0 ${CX-r1*.65},${CY}" fill="none" stroke="rgba(139,111,247,.45)" stroke-width="1.5"/>`;
    h+=`<text x="30" y="192" font-size="8" fill="rgba(139,111,247,.65)" font-family="IBM Plex Mono">Weimer Bz=${(S.bz||0).toFixed(1)} nT</text>`;
  }
  h+=`<circle cx="${CX}" cy="${CY}" r="6" fill="#1a88d4"/>`;
  h+=`<line x1="${CX}" y1="${CY}" x2="168" y2="${CY}" stroke="rgba(255,208,75,.18)" stroke-width="1" stroke-dasharray="3,4"/>`;
  h+=`<text x="164" y="107" font-size="9" fill="rgba(255,208,75,.45)" font-family="IBM Plex Mono">☀</text>`;
  svg.innerHTML=h;
}

/* ── §8  INIT ─────────────────────────────────────────────────────── */
/* Called once on DOMContentLoaded. Renders all default diagram states
   then navigates the wizard to step 1. */
function init(){
  drawSvgGrid('shue-grid');
  drawSvgGrid('box-grid');
  bndShueUpdate();
  S.vsKp = dstToKp(S.dst);
  S.vsA  = vsIntensityA(S.vsKp);
  const kpAuto = $('vs-kp-auto-display');
  if (kpAuto) kpAuto.textContent = S.vsKp.toFixed(1);
  renderBins();
  drawSpec();
  drawEfieldSchematic();
  updateSidebar();
  goStep(1);
}
document.addEventListener('DOMContentLoaded', init);

