/**
 * AMPS CCMC — WIZARD STEP NAVIGATION
 * Manages the 7-step submission wizard:
 *   step transitions, progress tracking, breadcrumb updates,
 *   and the sidebar configuration summary.
 */

'use strict';
import { $, $$, STATE, emit } from './core.js';
import { buildParamFile } from './param-builder.js';

/* Steps definition */
const STEPS = [
  { id:1, key:'run-info',   label:'Run Info',      panel:'panel-1' },
  { id:2, key:'particle',   label:'Particle Type', panel:'panel-2' },
  { id:3, key:'bg-field',   label:'Bkg Field',     panel:'panel-3' },
  { id:4, key:'boundary',   label:'Domain Boundary',panel:'panel-3b'},
  { id:5, key:'temporal',   label:'Temporal',      panel:'panel-4a'},
  { id:6, key:'spectrum',   label:'Spectrum / BC', panel:'panel-4b'},
  { id:7, key:'output-dom', label:'Output Domain', panel:'panel-5' },
  { id:8, key:'out-opts',   label:'Output Options',panel:'panel-6' },
  { id:9, key:'review',     label:'Review & Submit',panel:'panel-7'},
];

let currentStep = 1;
let completedSteps = new Set();

export function goToStep(n) {
  if(n < 1 || n > STEPS.length) return;
  const prev = currentStep;
  currentStep = n;

  // Show/hide panels
  STEPS.forEach(s => {
    const panel = $(s.panel);
    if(panel) panel.classList.toggle('active', s.id === n);
  });

  // Update wizard nav
  $$('.wz-step').forEach((el, i) => {
    const stepId = i + 1;
    el.classList.remove('done','active');
    if(completedSteps.has(stepId)) el.classList.add('done');
    else if(stepId === n) el.classList.add('active');
  });

  // Update submit bar buttons
  const prevBtn = $('btn-prev');
  const nextBtn = $('btn-next');
  const subBtn  = $('btn-submit');
  if(prevBtn) prevBtn.disabled = n === 1;
  if(nextBtn) nextBtn.style.display = n < STEPS.length ? 'inline-flex' : 'none';
  if(subBtn)  subBtn.style.display  = n === STEPS.length ? 'inline-flex' : 'none';

  // Scroll top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  emit('step:change', { prev, current: n });
  updateSidebar();

  // Rebuild AMPS_PARAM.in preview on review step
  if(n === STEPS.length) buildParamFile();
}

export function nextStep() {
  completedSteps.add(currentStep);
  goToStep(currentStep + 1);
}

export function prevStep() {
  goToStep(currentStep - 1);
}

export function getCurrentStep() { return currentStep; }

/* ── SIDEBAR LIVE SUMMARY ───────────────────────────────────────────────── */
export function updateSidebar() {
  const sb = id => { const el = $(`sb-${id}`); return el ? el : { textContent:'', className:'' }; };

  const set = (id, val, cls='') => {
    const el = $(`sb-${id}`);
    if(!el) return;
    el.textContent = val;
    el.className = 'sb-v' + (cls ? ' '+cls : '');
  };

  set('run-name',    STATE.runName   || '(not set)', STATE.runName ? '' : 'o');
  set('species',     STATE.species === 'proton' ? 'H⁺ (proton)' :
                     STATE.species === 'helium' ? 'He²⁺' :
                     STATE.species === 'electron' ? 'e⁻' : STATE.species, 'g');
  set('field-model', STATE.fieldModel, 'g');
  set('temporal',    STATE.temporalMode.replace('_',' '), 'g');
  set('boundary',    STATE.boundaryType === 'SHUE' ? 'Shue 1998' : 'Box (GSM)',
                     STATE.boundaryType === 'SHUE' ? 'g' : '');
  set('output-mode', STATE.outputMode.replace('_',' '), 'g');
  set('spec-type',   STATE.spectrumType.replace('_',' '), '');

  // Progress bar: how many steps completed
  const pct = Math.round((completedSteps.size / STEPS.length) * 100);
  const fill = $('progress-fill');
  if(fill) fill.style.width = pct + '%';
  const pctEl = $('progress-pct');
  if(pctEl) pctEl.textContent = pct + '%';

  // Estimated compute
  const energyBins = (STATE.energyBins || []).length;
  const sbq = (val, id) => { const el = $(id); if(el) el.textContent = val; };
  sbq(STATE.temporalMode === 'COUPLED_MHD' ? '2–5 days' : '4–8 hours', 'est-queue');
  sbq(STATE.temporalMode === 'COUPLED_MHD' ? '~50,000 SBU' : '~5,000 SBU', 'est-sbu');
  sbq((energyBins * 0.8).toFixed(0) + ' GB', 'est-output');
}

/* ── SECTION COLLAPSE TOGGLE ────────────────────────────────────────────── */
export function toggleSection(id) {
  const el = $(id);
  if(el) el.classList.toggle('closed');
}

/* Init: attach nav click handlers */
export function initWizard() {
  $$('.wz-step').forEach((el, i) => {
    el.addEventListener('click', () => goToStep(i+1));
  });
  $('btn-prev')?.addEventListener('click', prevStep);
  $('btn-next')?.addEventListener('click', nextStep);
  goToStep(1);
}
