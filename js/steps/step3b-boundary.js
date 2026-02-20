/**
 * Step 3b — Domain Boundary
 * Two boundary geometries:
 *   BOX   — axis-aligned rectangular cuboid in GSM (RE)
 *   SHUE  — Shue et al. (1998) empirical magnetopause surface
 *
 * Both geometries rendered as live SVG cross-sections (GSM X-Z plane, Y=0).
 * All inputs connected live to STATE and keyword preview.
 */
'use strict';
import { $, $$, STATE, emit, getShueParams, shueR,
         gsmToSvgX, gsmToSvgZ, clamp, svgEl, drawSvgGrid,
         fmt1, fmt2, fmt3 } from '../core.js';
import { updateSidebar } from '../wizard.js';

const CX=200, CY=160, SC=5; // SVG canvas constants

export function initBoundary() {
  /* Boundary type toggle */
  $('bc-box')?.addEventListener('click',  () => setBoundary('BOX'));
  $('bc-shue')?.addEventListener('click', () => setBoundary('SHUE'));

  /* Box inputs */
  ['box-xmax','box-xmin','box-ymax','box-ymin','box-zmax','box-zmin','box-rinner'].forEach(id => {
    $(id)?.addEventListener('input', () => {
      pullBoxState();
      updateBoxDiagram();
      updateBoxKw();
      updateSidebar();
    });
  });

  /* Shue inputs */
  ['shue-r0-in','shue-alpha-in','shue-xtail','shue-rinner'].forEach(id => {
    $(id)?.addEventListener('input', () => {
      pullShueState();
      updateBoundaryDiagram();
      updateShueKw();
      updateSidebar();
    });
  });

  /* Shue auto/manual toggle */
  $$('.shue-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.shue-mode-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      STATE.shueMode = btn.dataset.mode;
      const mf = $('shue-manual-fields');
      const ab = $('shue-auto-box');
      if(mf) mf.style.display = STATE.shueMode === 'manual' ? 'block' : 'none';
      if(ab) ab.style.opacity = STATE.shueMode === 'manual' ? '0.5' : '1';
      updateBoundaryDiagram();
      updateShueKw();
    });
  });

  // Init grids
  drawSvgGrid($('shue-grid'));
  drawSvgGrid($('box-grid'));

  setBoundary('SHUE');
}

/* Pull input values → STATE */
function pullBoxState() {
  ['xmax','xmin','ymax','ymin','zmax','zmin','rinner'].forEach(k => {
    const el = $(`box-${k}`);
    if(el) STATE[`box${k.charAt(0).toUpperCase()+k.slice(1)}`] = parseFloat(el.value) || 0;
  });
}

function pullShueState() {
  STATE.xtail      = parseFloat($('shue-xtail')?.value) || -60;
  STATE.shueRinner = parseFloat($('shue-rinner')?.value) || 2.0;
  if(STATE.shueMode === 'manual') {
    STATE.shueR0    = parseFloat($('shue-r0-in')?.value) || null;
    STATE.shueAlpha = parseFloat($('shue-alpha-in')?.value) || null;
  }
}

/* ── PUBLIC: called from step3 when Bz/Pdyn change ── */
export function updateBoundaryDiagram() {
  if(STATE.boundaryType === 'SHUE') updateShueDiagram();
  else updateBoxDiagram();
}

/* ── BOUNDARY TYPE SWITCH ── */
export function setBoundary(type) {
  STATE.boundaryType = type;
  $('bc-box')?.classList.toggle('sel',  type === 'BOX');
  $('bc-shue')?.classList.toggle('sel', type === 'SHUE');
  const bp = $('bnd-box-panel');
  const sp = $('bnd-shue-panel');
  if(bp) bp.style.display = type === 'BOX'  ? 'block' : 'none';
  if(sp) sp.style.display = type === 'SHUE' ? 'block' : 'none';
  if(type === 'SHUE') updateShueDiagram();
  else                updateBoxDiagram();
  updateSidebar();
}

/* ── BOX SVG ── */
function updateBoxDiagram() {
  const p = STATE;
  const rx = clamp(gsmToSvgX(p.boxXmin, CX, SC), 5, 390);
  const ry = clamp(gsmToSvgZ(p.boxZmax, CY, SC), 5, 310);
  const rw = Math.max(0, clamp(gsmToSvgX(p.boxXmax, CX, SC), 5, 390) - rx);
  const rh = Math.max(0, clamp(gsmToSvgZ(p.boxZmin, CY, SC), 5, 310) - ry);

  const rect = $('box-rect');
  if(rect) { rect.setAttribute('x',rx.toFixed(1)); rect.setAttribute('y',ry.toFixed(1));
             rect.setAttribute('width',rw.toFixed(1)); rect.setAttribute('height',rh.toFixed(1)); }

  const rin = $('inner-box');
  if(rin) rin.setAttribute('r', (p.boxRinner * SC).toFixed(1));

  const setLabel = (id, txt, x, y) => {
    const l = $(id); if(!l) return;
    l.setAttribute('x', x.toFixed(1)); l.setAttribute('y', y.toFixed(1)); l.textContent = txt;
  };
  setLabel('box-lbl-xmax', `Xmax=${p.boxXmax}`, clamp(gsmToSvgX(p.boxXmax,CX,SC)+2,5,368), CY+14);
  setLabel('box-lbl-xmin', `Xmin=${p.boxXmin}`, clamp(gsmToSvgX(p.boxXmin,CX,SC)-34,5,368), CY+14);
  setLabel('box-lbl-zmax', `Zmax=${p.boxZmax}`, CX+4, clamp(gsmToSvgZ(p.boxZmax,CY,SC)-3,12,308));
  setLabel('box-lbl-zmin', `Zmin=${p.boxZmin}`, CX+4, clamp(gsmToSvgZ(p.boxZmin,CY,SC)+11,12,308));

  updateBoxValidation();
}

function updateBoxValidation() {
  const p = STATE;
  const rows = [
    { id:'bv-xrange', ok: p.boxXmax > 9,  msg_ok:'✓ Dayside OK', msg_fail:'⚠ Xmax < 9 RE — may clip magnetopause' },
    { id:'bv-yrange', ok: p.boxYmax >= 15, msg_ok:'✓ Y flanks OK', msg_fail:'⚠ Flanks < 15 RE' },
    { id:'bv-zrange', ok: p.boxZmax > 12 && Math.abs(p.boxZmin) > 12, msg_ok:'✓ Z range OK', msg_fail:'⚠ |Z| < 12 RE — clips polar cap' },
    { id:'bv-inner',  ok: p.boxRinner >= 1.5 && p.boxRinner <= 3.5, msg_ok:'✓ R_inner OK', msg_fail:'⚠ Typical R_inner: 1.5–3.5 RE' },
  ];
  rows.forEach(r => {
    const el = $(r.id); if(!el) return;
    el.innerHTML = r.ok
      ? `<span class="v-ok">${r.msg_ok}</span>`
      : `<span class="v-warn">${r.msg_fail}</span>`;
  });
}

function updateBoxKw() {
  const p = STATE;
  const vals = { xmax:p.boxXmax, xmin:p.boxXmin, ymax:p.boxYmax, ymin:p.boxYmin,
                 zmax:p.boxZmax, zmin:p.boxZmin, rinner:p.boxRinner };
  Object.entries(vals).forEach(([k,v]) => {
    const el = $(`kw-${k}`); if(el) el.textContent = fmt1(v);
  });
}

/* ── SHUE SVG ── */
function updateShueDiagram() {
  const { r0, alpha } = getShueParams();
  const xtail = STATE.xtail || -60;
  const rin   = (STATE.shueMode === 'auto' ? STATE.shueRinner : STATE.shueRinner) || 2.0;

  // Update derived readouts
  const rFlank = shueR(r0, alpha, 90);
  const set = (id,v) => { const el=$(id); if(el) el.textContent=v; };
  set('shue-r0-val',    r0.toFixed(2));
  set('shue-alpha-val', alpha.toFixed(3));
  set('shue-xsub-val',  r0.toFixed(2));
  set('shue-rflank-val', isFinite(rFlank) ? rFlank.toFixed(1) : '—');
  set('shue-svg-r0',    `r₀=${r0.toFixed(2)} RE`);
  set('shue-svg-alpha', `α=${alpha.toFixed(3)}`);
  set('shue-svg-dst',   `Dst=${STATE.dst} nT`);
  set('shue-svg-pdyn',  `Pdyn=${STATE.pdyn} nPa`);

  // Build path
  const upper=[], lower=[];
  for(let deg=0; deg<=180; deg+=1.5) {
    const r = shueR(r0, alpha, deg);
    if(!isFinite(r)) continue;
    const th = deg * Math.PI / 180;
    const gx = r*Math.cos(th), gz = r*Math.sin(th);
    if(gx < xtail) continue;
    upper.push([clamp(gsmToSvgX(gx,CX,SC),5,390), clamp(gsmToSvgZ( gz,CY,SC),5,310)]);
    lower.unshift([clamp(gsmToSvgX(gx,CX,SC),5,390), clamp(gsmToSvgZ(-gz,CY,SC),5,310)]);
  }
  if(upper.length < 2) return;

  const tcSvgX = clamp(gsmToSvgX(xtail,CX,SC), 8, 390);
  let d = `M ${upper[0][0].toFixed(1)},${upper[0][1].toFixed(1)}`;
  upper.forEach(([x,y])=>{ d+=` L ${x.toFixed(1)},${y.toFixed(1)}`; });
  const tailZ = shueR(r0,alpha,179.9)*Math.sin(179.9*Math.PI/180);
  d += ` L ${tcSvgX.toFixed(1)},${clamp(gsmToSvgZ(-tailZ,CY,SC),5,310).toFixed(1)}`;
  lower.forEach(([x,y])=>{ d+=` L ${x.toFixed(1)},${y.toFixed(1)}`; });
  d += ' Z';
  $('shue-path')?.setAttribute('d', d);

  // Tail cap line
  const tc = $('shue-tailcap');
  if(tc) { tc.setAttribute('x1',tcSvgX.toFixed(1)); tc.setAttribute('x2',tcSvgX.toFixed(1)); }
  const tl = $('shue-tailcap-lbl');
  if(tl) { tl.setAttribute('x',(tcSvgX+3).toFixed(1)); tl.textContent=`Xtail=${xtail}`; }

  // Inner sphere
  $('inner-shue')?.setAttribute('r', (rin*SC).toFixed(1));
  const il = $('inner-shue-lbl'); if(il) il.textContent=`R_in=${rin} RE`;

  // r0 arrow
  const r0l = $('shue-r0-line');
  if(r0l) { r0l.setAttribute('x2', gsmToSvgX(r0,CX,SC).toFixed(1)); r0l.setAttribute('y2',CY.toFixed(1)); }
  const r0lb = $('shue-r0-lbl');
  if(r0lb) { r0lb.setAttribute('x', gsmToSvgX(r0/2,CX,SC).toFixed(1)); r0lb.textContent=`r₀=${r0.toFixed(1)}`; }

  updateShueValidation(r0, alpha, xtail);
  updateShueKw();
}

function updateShueValidation(r0, alpha, xtail) {
  const rows = [
    { id:'sv-r0',    ok: r0>5 && r0<13,       ok_msg:`✓ r₀ = ${r0.toFixed(2)} RE`, fail_msg:`⚠ r₀ = ${r0.toFixed(2)} — outside 5–13 RE` },
    { id:'sv-alpha', ok: alpha>0.4 && alpha<0.8, ok_msg:`✓ α = ${alpha.toFixed(3)}`, fail_msg:`⚠ α = ${alpha.toFixed(3)} — outside 0.40–0.80` },
    { id:'sv-tail',  ok: xtail < -20,           ok_msg:`✓ Tail cap ${xtail} RE`, fail_msg:`⚠ X_tail should be < −20 RE` },
  ];
  rows.forEach(r => {
    const el=$(r.id); if(!el) return;
    el.innerHTML = r.ok ? `<span class="v-ok">${r.ok_msg}</span>` : `<span class="v-warn">${r.fail_msg}</span>`;
  });
}

function updateShueKw() {
  const { r0, alpha } = getShueParams();
  const isManual = STATE.shueMode === 'manual';
  const set = (id,v) => { const el=$(id); if(el) el.textContent=v; };
  set('kw-shue-r0',    isManual ? fmt2(r0)    : 'AUTO');
  set('kw-shue-alpha', isManual ? fmt3(alpha) : 'AUTO');
  set('kw-xtail',      fmt1(STATE.xtail||−60));
  set('kw-shue-rinner', fmt1(STATE.shueRinner||2));
}
