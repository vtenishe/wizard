/**
 * Step 3 — Background Magnetic Field (TS05 scalar parameters)
 * Manages the 8 TS05 driving parameter fields and validates
 * their ranges against Tsyganenko 2005 model limits.
 */
'use strict';
import { $, STATE, emit, fmt1, fmt2, inRange } from '../core.js';
import { updateSidebar } from '../wizard.js';
import { updateBoundaryDiagram } from './step3b-boundary.js';

/* Valid ranges per TS05 documentation */
const RANGES = {
  dst:  { lo:-600, hi:+50,  warnLo:-300, warnHi:50,  unit:'nT',    label:'Dst',  hint:'Storm main phase: −100 to −300 nT. Clamp to −600 nT.' },
  pdyn: { lo:0.1,  hi:30,   warnLo:0.5,  warnHi:20,  unit:'nPa',   label:'Pdyn', hint:'Solar wind dynamic pressure. Typical 0.5–10 nPa.' },
  bz:   { lo:-50,  hi:+20,  warnLo:-30,  warnHi:15,  unit:'nT',    label:'IMF Bz', hint:'Negative (southward) drives reconnection & storm onset.' },
  vx:   { lo:-900, hi:-200, warnLo:-800, warnHi:-200,unit:'km/s',  label:'Vx',   hint:'Solar wind bulk velocity (negative = sunward). Typical −400 km/s.' },
  nsw:  { lo:0.5,  hi:80,   warnLo:1,    warnHi:50,  unit:'cm⁻³',  label:'Nsw',  hint:'Proton number density. Typical 5–20 cm⁻³.' },
  by:   { lo:-40,  hi:+40,  warnLo:null, warnHi:null, unit:'nT',   label:'IMF By', hint:'Controls dawn-dusk asymmetry in field-aligned currents.' },
  bx:   { lo:-40,  hi:+40,  warnLo:null, warnHi:null, unit:'nT',   label:'IMF Bx', hint:'Affects subsolar flux tube geometry. Often set to 0.' },
};

export function initStep3() {
  Object.keys(RANGES).forEach(key => {
    const el = $(`ts05-${key}`);
    if(!el) return;
    el.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      STATE[key] = v;
      validateField(key, v);
      updateKwPreview();
      updateBoundaryDiagram(); // Shue parameters depend on Bz and Pdyn
      updateSidebar();
    });
  });

  $('ts05-epoch')?.addEventListener('change', e => {
    STATE.epoch = e.target.value;
    updateSidebar();
  });

  updateKwPreview();
}

function validateField(key, v) {
  const r = RANGES[key];
  if(!r) return;
  const el = $(`ts05-${key}`);
  const hint = $(`ts05-${key}-hint`);

  el.classList.remove('valid','warn','error');
  const status = $(`ts05-${key}-status`);

  if(!inRange(v, r.lo, r.hi)) {
    el.classList.add('error');
    if(status) { status.textContent = `✗ Out of TS05 range [${r.lo}, ${r.hi}] ${r.unit}`; status.className = 'field-note'; status.style.color='var(--red)'; }
  } else if((r.warnLo !== null && v < r.warnLo) || (r.warnHi !== null && v > r.warnHi)) {
    el.classList.add('warn');
    if(status) { status.textContent = `⚠ Unusual value — verify against data source`; status.className = 'field-note'; status.style.color='var(--orange)'; }
  } else {
    el.classList.add('valid');
    if(status) { status.textContent = '✓ Within normal range'; status.className = 'field-note'; status.style.color='var(--green)'; }
  }
}

function updateKwPreview() {
  const el = $('ts05-kw-preview');
  if(!el) return;
  el.innerHTML = [
    `<span class="kw-section">#BACKGROUND_FIELD</span>`,
    `<span class="kw-key">FIELD_MODEL</span>     <span class="kw-val">${STATE.fieldModel}</span>`,
    `<span class="kw-key">TS05_DST</span>        <span class="kw-val">${fmt1(STATE.dst)}</span>    <span class="kw-comment">! nT</span>`,
    `<span class="kw-key">TS05_PDYN</span>       <span class="kw-val">${fmt2(STATE.pdyn)}</span>    <span class="kw-comment">! nPa</span>`,
    `<span class="kw-key">TS05_BZ</span>         <span class="kw-val">${fmt2(STATE.bz)}</span>   <span class="kw-comment">! nT GSM</span>`,
    `<span class="kw-key">TS05_VX</span>         <span class="kw-val">${fmt1(STATE.vx)}</span>  <span class="kw-comment">! km/s</span>`,
    `<span class="kw-key">TS05_NSW</span>        <span class="kw-val">${fmt2(STATE.nsw)}</span>    <span class="kw-comment">! cm⁻³</span>`,
    `<span class="kw-key">TS05_BY</span>         <span class="kw-val">${fmt2(STATE.by)}</span>     <span class="kw-comment">! nT</span>`,
    `<span class="kw-key">EPOCH</span>           <span class="kw-val">${STATE.epoch}</span>`,
  ].join('\n');
}
