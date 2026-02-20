/**
 * Step 1 — Run Information
 * Collects run metadata: name, PI, institution, model version,
 * science goal selector, free-text description.
 */
'use strict';
import { $, STATE, emit, nonEmpty, validEmail } from '../core.js';
import { updateSidebar } from '../wizard.js';

export function initStep1() {
  const fields = {
    'run-name':    v => { STATE.runName = v.trim(); validate('run-name', nonEmpty(v), 'Run name is required'); },
    'pi-name':     v => { STATE.piName = v.trim(); validate('pi-name', nonEmpty(v), 'PI name is required'); },
    'pi-email':    v => { STATE.piEmail = v.trim(); validate('pi-email', validEmail(v), 'Valid email required'); },
    'pi-inst':     v => { STATE.institution = v.trim(); },
    'run-desc':    v => { STATE.description = v.trim(); updateCharCount('run-desc', v, 500); },
    'science-goal':v => { STATE.scienceGoal = v; updateGoalHint(v); },
    'model-ver':   v => { STATE.modelVersion = v; },
  };

  Object.entries(fields).forEach(([id, fn]) => {
    const el = $(id);
    if(!el) return;
    el.addEventListener('input', e => { fn(e.target.value); updateSidebar(); });
    if(el.tagName === 'SELECT') el.addEventListener('change', e => fn(e.target.value));
  });
}

function validate(id, ok, msg) {
  const el = $(id);
  if(!el) return;
  el.classList.toggle('valid', ok);
  el.classList.toggle('error', !ok);
  const hint = document.getElementById(id+'-err');
  if(hint) { hint.textContent = ok ? '' : msg; hint.style.color = 'var(--red)'; }
}

function updateCharCount(id, val, max) {
  const n = val.length;
  const cc = document.getElementById(id+'-count');
  if(!cc) return;
  cc.textContent = `${n}/${max}`;
  cc.className = 'char-count' + (n > max*0.9 ? ' near' : '') + (n > max ? ' over' : '');
}

function updateGoalHint(goal) {
  const hints = {
    storm_validation: 'Compare AMPS-predicted cutoff rigidity with Van Allen Probe particle data during the storm main phase.',
    gcr_baseline:     'Compute galactic cosmic ray fluxes at LEO under quiet geomagnetic conditions (Dst ≈ 0 nT).',
    sep_radiation:    'Quantify SEP fluence and dose at ISS altitude during a major solar particle event.',
    parameter_study:  'Systematic sensitivity study: vary Dst, Pdyn, and spectral index to map uncertainty space.',
    custom:           'Describe your science goal in the text field below.',
  };
  const hintEl = $('goal-hint');
  if(hintEl) hintEl.textContent = hints[goal] || '';
}
