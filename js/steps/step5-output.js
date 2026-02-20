/**
 * Step 5 — Output Domain
 * Mode A: individual points list
 * Mode B: spacecraft trajectory (NAIRAS format)
 * Mode C: spherical shells
 */
'use strict';
import { $, $$, STATE, emit } from '../core.js';
import { updateSidebar } from '../wizard.js';

export function initOutputDomain() {
  $$('.mode-card').forEach(card => {
    card.addEventListener('click', () => setOutputMode(card.dataset.mode));
  });

  $('flux-dt')?.addEventListener('input', e => {
    STATE.fluxDt = parseFloat(e.target.value) || 1;
  });

  $('traj-dropzone')?.addEventListener('click', simulateUpload);
  $('traj-dropzone')?.addEventListener('dragover', e => {
    e.preventDefault();
    $('traj-dropzone').classList.add('drag-over');
  });
  $('traj-dropzone')?.addEventListener('dragleave', () => {
    $('traj-dropzone').classList.remove('drag-over');
  });
  $('traj-dropzone')?.addEventListener('drop', e => {
    e.preventDefault();
    $('traj-dropzone').classList.remove('drag-over');
    simulateUpload();
  });

  $('coord-sys')?.addEventListener('change', e => {
    STATE.trajCoordSys = e.target.value;
  });

  setOutputMode('TRAJECTORY');
}

function setOutputMode(mode) {
  STATE.outputMode = mode;
  $$('.mode-card').forEach(c => c.classList.toggle('sel', c.dataset.mode === mode));
  ['panel-mode-a','panel-mode-b','panel-mode-c'].forEach(id => {
    const el = $(id);
    if(!el) return;
    const match = { 'panel-mode-a':'POINTS', 'panel-mode-b':'TRAJECTORY', 'panel-mode-c':'SHELLS' };
    el.style.display = match[id] === mode ? 'block' : 'none';
  });
  updateSidebar();
}

/* Simulates parsing a NAIRAS trajectory file and showing preview rows */
function simulateUpload() {
  const dz = $('traj-dropzone');
  if(!dz) return;
  dz.classList.remove('drag-over');
  dz.classList.add('loaded');
  dz.innerHTML = `
    <div class="dz-icon">✅</div>
    <div class="dz-primary" style="color:var(--green)">VanAllenProbeA_sep2017_trajectory.txt</div>
    <div class="dz-sub">14,412 rows · Gregorian format auto-detected · Time span: 2017-09-07 00:00 → 2017-09-10 20:00 UTC</div>`;

  const preview = $('traj-preview-panel');
  if(preview) preview.style.display = 'block';

  // Run validation checks
  const checks = [
    { id:'vcheck-rows',    ok:true,  msg:'14,412 rows (min 2 required)' },
    { id:'vcheck-mono',    ok:true,  msg:'Timestamps monotonically increasing' },
    { id:'vcheck-lat',     ok:true,  msg:'Latitude range: −65.3° to +65.3°' },
    { id:'vcheck-alt',     ok:true,  msg:'Altitude range: 21,000 – 36,500 km' },
    { id:'vcheck-overlap', ok:true,  msg:'Time range overlaps TS05 event window ✓' },
    { id:'vcheck-dup',     ok:true,  msg:'No duplicate timestamps' },
    { id:'vcheck-format',  ok:true,  msg:'Gregorian (9-col) format confirmed' },
  ];
  checks.forEach(c => {
    const el = $(c.id);
    if(!el) return;
    el.innerHTML = c.ok
      ? `<span class="vt-pass">✓ PASS</span>  ${c.msg}`
      : `<span class="vt-fail">✗ FAIL</span>  ${c.msg}`;
  });
}
