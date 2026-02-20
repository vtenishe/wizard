/**
 * Step 2 — Particle Species & Charge State
 * Sets species, charge, mass; computes rigidity units.
 */
'use strict';
import { $, $$, STATE, emit } from '../core.js';
import { updateSidebar } from '../wizard.js';

const SPECIES = {
  proton:   { charge:1, mass:1.0073,  label:'H⁺ Proton',         symbol:'p',   color:'#38c0ff' },
  helium:   { charge:2, mass:4.0026,  label:'He²⁺ Alpha',        symbol:'α',   color:'#ffd04b' },
  oxygen:   { charge:8, mass:15.999,  label:'O⁸⁺',               symbol:'O',   color:'#ff9a3c' },
  electron: { charge:-1, mass:0.000549, label:'e⁻ Electron',     symbol:'e',   color:'#8b6ff7' },
  iron:     { charge:26, mass:55.845, label:'Fe²⁶⁺',             symbol:'Fe',  color:'#ff5a5a' },
  custom:   { charge:1, mass:1.0,     label:'Custom Ion',         symbol:'?',   color:'#6a88b0' },
};

export function initStep2() {
  $$('.species-card').forEach(card => {
    card.addEventListener('click', () => selectSpecies(card.dataset.species));
  });

  $('charge-input')?.addEventListener('input', e => {
    STATE.chargeState = parseFloat(e.target.value) || 1;
    updateRigidityInfo();
  });
  $('mass-input')?.addEventListener('input', e => {
    STATE.massAMU = parseFloat(e.target.value) || 1;
    updateRigidityInfo();
  });

  selectSpecies('proton'); // default
}

function selectSpecies(key) {
  const sp = SPECIES[key];
  if(!sp) return;
  STATE.species    = key;
  STATE.chargeState = sp.charge;
  STATE.massAMU    = sp.mass;

  $$('.species-card').forEach(c => c.classList.toggle('sel', c.dataset.species === key));

  const isCustom = key === 'custom';
  const customPanel = $('custom-species-panel');
  if(customPanel) customPanel.style.display = isCustom ? 'block' : 'none';

  if(!isCustom) {
    const ci = $('charge-input'); if(ci) ci.value = sp.charge;
    const mi = $('mass-input');   if(mi) mi.value  = sp.mass;
  }

  updateRigidityInfo();
  updateSidebar();
}

function updateRigidityInfo() {
  const q = Math.abs(STATE.chargeState || 1);
  const A = STATE.massAMU || 1;
  // Magnetic rigidity R = p/(q·e) in GV; for non-relativistic: R ≈ sqrt(2·A·m_p·E) / q
  // Display magnetic rigidity at 100 MeV/n for reference
  const Emev = 100;        // MeV/n
  const mp_MeV = 938.272;  // MeV/c²
  const E_tot = Emev * A + A * mp_MeV;    // total energy MeV
  const p_MeV_c = Math.sqrt(E_tot**2 - (A * mp_MeV)**2); // momentum MeV/c
  const R_GV = p_MeV_c / (q * 1000);     // rigidity in GV
  const el = $('rigidity-info');
  if(el) el.textContent = `Rigidity at 100 MeV/n: R = ${R_GV.toFixed(3)} GV`;
}
