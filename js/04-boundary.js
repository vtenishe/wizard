/* =============================================================================
   FILE:    js/04-boundary.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Step 4 — Simulation domain boundary configuration and live SVG
            diagram renderer for both BOX and Shue (1998) geometries.

   DOMAIN BOUNDARY TYPES
     BOX  — Axis-aligned rectangular cuboid in GSM coordinates.
            Six parameters: Xmax, Xmin, Ymax, Ymin, Zmax, Zmin [RE].
            Simple, predictable. Reproduces AMPS 2016 legacy behaviour.
            Recommended for GCR runs and systematic parameter sweeps.
            Keyword: BOUNDARY_TYPE = BOX

     SHUE — Shue et al. (1998) empirical magnetopause surface.
            r(θ) = r₀ · (2 / (1 + cos θ))^α
            r₀ and α both respond to solar wind Pdyn and IMF Bz,
            automatically compressing the boundary during storm times.
            Reduces wasted particle traces by ~20–30% vs. a fixed box.
            Keyword: BOUNDARY_TYPE = SHUE

   SHUE AUTO-COMPUTE FORMULAS (from Shue et al. 1998)
     r₀ = (11.4 + 0.013·Bz) · Pdyn^(−1/6.6)        [RE]
     α  = (0.58 − 0.007·Bz) · (1 + 0.024·ln(Pdyn))  []
     Bz, Pdyn read from S (set by TS05 driving parameters in Step 3).

   SVG DIAGRAM
     · ViewBox 0 0 400 320; coordinate origin at (CX=200, CY=160)
     · Scale: SC=5 pixels per Earth radius
     · +X_GSM (sunward) → right; +Z_GSM (north) → up (inverted SVG Y)
     · Background grid drawn once by drawSvgGrid() on init
     · BOX diagram: rectangle, dimension labels, R_inner circle
     · Shue diagram: curved path (181 points, 1° steps), tail-cap line,
                     r₀ annotation arrow, flank annotation arrow,
                     4-item parameter readout in SVG text elements

   PUBLIC API (called from HTML onclick / oninput)
     bndSet(type)        — switch between 'BOX' and 'SHUE' (shows correct panel)
     shueMode(m)         — toggle 'auto' / 'manual' Shue parameter mode
     bndBoxUpdate()      — read box inputs → update SVG + KW preview + validate
     bndShueUpdate()     — recompute r₀/α → update Shue SVG + KW preview + validate
     drawSvgGrid(svgId)  — draw the background grid lines (called once on init)

   INTERNAL HELPERS
     shueCalc()          — returns {r0, alpha} from current S.dst/S.pdyn/S.bz
     getShue()           — returns active {r0, alpha} (auto or manual)
     shueR(r0, al, deg)  — Shue radial distance at angle deg from sun–Earth line

   DEPENDS ON: 01-state.js (S, $, set, CX, CY, SC, gx, gz, cl)
=============================================================================*/

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
  // NOTE: Two button-id conventions exist across historical HTML variants:
  //   index.html / AMPS_Interface.html  ->  shue-manual-btn
  //   panel_boundary.html              ->  shue-man-btn
  // Keep both working so standalone and multi-file builds stay in sync.
  $('shue-manual-btn')?.classList.toggle('on',m==='manual');
  $('shue-man-btn')?.classList.toggle('on',m==='manual');

  // Manual override fields container (current id: shue-manual-fields)
  $('shue-manual-fields').style.display=m==='manual'?'block':'none';
  $('shue-auto-box').style.opacity=m==='manual'?'0.5':'1';
  bndShueUpdate();
}

/* ---------------------------------------------------------------------------
   Compatibility shims (DO NOT REMOVE)

   Why:
   - Some older/alternate HTML variants (including legacy snippets) call
     setBoundary('box'|'shue') and setShueMode(this,'auto'|'manual').
   - The standalone AMPS_Interface.html historically drifted from index.html.

   Goal:
   - Make Step 4 resilient: whichever HTML file is opened, manual override and
     boundary selection must work.
--------------------------------------------------------------------------- */

// Legacy alias: setBoundary('box'|'shue')
window.setBoundary = window.setBoundary || function(which){
  const w=String(which||'').toLowerCase();
  if(w==='box')  return bndSet('BOX');
  if(w==='shue') return bndSet('SHUE');
  return bndSet(which);
};

// Legacy alias: setShueMode(this,'auto'|'manual')
window.setShueMode = window.setShueMode || function(_btn,mode){
  return shueMode(mode);
};
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
// IMPORTANT: gx/gz/cl are defined once in js/01-state.js and must not be
// re-declared here. Re-declaring with const causes:
//   "Identifier 'gx' has already been declared"
// which prevents this entire file from loading, and therefore breaks the
// Boundary step in index.html (bndSet/shueMode undefined, drawSvgGrid undefined).
// Use the shared globals from 01-state.js.
//   gx(re) => CX + re*SC
//   gz(re) => CY - re*SC
//   cl(v,lo,hi) => clamp

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

/* ── SVG GRID INITIALISER ──────────────────────────────────────────── */
/* Called once on init() for both 'shue-grid' and 'box-grid' SVG groups. */
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



/* =============================================================================
   COMPATIBILITY SHIMS (INDEX.HTML / PANEL INCLUDE VS STANDALONE)
   -----------------------------------------------------------------------------
   The multi-file site (index.html) loads panel_boundary.html, which historically
   used legacy onclick handlers:
     - setBoundary('box'|'shue')
     - setShueMode(this,'auto'|'manual')
   The standalone AMPS_Interface.html uses the newer handlers:
     - bndSet('BOX'|'SHUE')
     - shueMode('auto'|'manual')
   To keep BOTH variants working and avoid subtle UI regressions when swapping
   panel markup, we provide global shims here. Do NOT remove unless you also
   update ALL boundary panel markup to use only the new API.
============================================================================= */
(function(){
  // Ensure we attach to the global object explicitly (browser window).
  const G = (typeof window !== 'undefined') ? window : globalThis;

  // Legacy: setBoundary('box'|'shue')  -> new: bndSet('BOX'|'SHUE')
  if (typeof G.setBoundary !== 'function') {
    G.setBoundary = function(which){
      const w = String(which||'').toLowerCase();
      if (w === 'box' || w === 'rect' || w === 'rectangular') return bndSet('BOX');
      if (w === 'shue' || w === 'mp'  || w === 'magnetopause') return bndSet('SHUE');
      // fallback: keep current selection
      return bndSet(S.boundary || 'SHUE');
    };
  }

  // Legacy: setShueMode(this,'auto'|'manual') -> new: shueMode('auto'|'manual')
  if (typeof G.setShueMode !== 'function') {
    G.setShueMode = function(_btn, mode){
      // mode string comes from onclick; ignore button reference and let shueMode
      // update the UI consistently.
      return shueMode(String(mode||'auto').toLowerCase());
    };
  }
})();

