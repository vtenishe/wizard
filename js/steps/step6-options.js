/**
 * Step 6 — Output Options
 * Flux type, cutoff rigidity, pitch angles, energy bins,
 * output file format, coordinate system.
 */
'use strict';
import { $, $$, STATE, emit } from '../core.js';
import { updateSidebar } from '../wizard.js';

const DEFAULT_BINS = [1, 5, 10, 30, 100, 300, 1000];

export function initOutputOptions() {
  /* Flux type toggle */
  $$('.flux-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.flux-type-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      STATE.outputFluxType = btn.dataset.type;
    });
  });

  /* Checkboxes */
  $('output-cutoff')?.addEventListener('change', e => { STATE.outputCutoff = e.target.checked; });
  $('output-pitch')?.addEventListener('change',  e => { STATE.outputPitch  = e.target.checked; });

  /* Format select */
  $('output-format')?.addEventListener('change', e => { STATE.outputFormat = e.target.value; });
  $('output-coords')?.addEventListener('change', e => { STATE.outputCoords = e.target.value; });

  /* Energy bins */
  $('add-bin')?.addEventListener('click', addEnergyBin);
  $('preset-bins')?.addEventListener('change', applyPreset);

  STATE.energyBins = [...DEFAULT_BINS];
  renderEnergyBins();
}

function renderEnergyBins() {
  const container = $('ebin-list');
  if(!container) return;
  container.innerHTML = '';
  const maxFlux = Math.max(...STATE.energyBins.map((e,i) => fluxAtEnergy(e)));
  STATE.energyBins.sort((a,b)=>a-b).forEach((e,i) => {
    const row = document.createElement('div');
    row.className = 'ebin-row';
    const pct = (Math.log10(Math.max(fluxAtEnergy(e),1e-3)) - Math.log10(1e-3)) /
                (Math.log10(maxFlux+1) - Math.log10(1e-3)) * 100;
    row.innerHTML = `
      <span class="ebin-range" style="color:#38c0ff">${e} MeV/n</span>
      <div class="ebin-bar-wrap"><div class="ebin-bar" style="width:${Math.max(5,pct).toFixed(0)}%"></div></div>
      <span style="font-size:10px;color:var(--text-dim);">${fluxAtEnergy(e).toExponential(1)} p/cm²/s/sr/(MeV/n)</span>
      <span class="ebin-del" onclick="removeEnergyBin(${i})" title="Remove">✕</span>`;
    container.appendChild(row);
  });
  const totalEl = $('total-output-size');
  if(totalEl) {
    const gb = (STATE.energyBins.length * 0.8).toFixed(1);
    totalEl.textContent = `~${gb} GB output`;
  }
}

function fluxAtEnergy(E) {
  return STATE.specJ0 * Math.pow(E / (STATE.specE0||10), -(STATE.specGamma||3.5));
}

function addEnergyBin() {
  const inp = $('new-bin-val');
  if(!inp) return;
  const v = parseFloat(inp.value);
  if(v > 0 && !STATE.energyBins.includes(v)) {
    STATE.energyBins.push(v);
    renderEnergyBins();
    inp.value = '';
  }
}

window.removeEnergyBin = function(i) {
  STATE.energyBins.splice(i,1);
  renderEnergyBins();
};

function applyPreset() {
  const sel = $('preset-bins');
  if(!sel) return;
  const presets = {
    default:  [1,5,10,30,100,300,1000],
    fine_lep: [1,2,3,5,7,10,15,20,30,50,70,100,200,300,500,1000],
    goes:     [5,10,30,50,60,100,300,500],
    broad:    [1,10,100,1000],
  };
  if(presets[sel.value]) {
    STATE.energyBins = [...presets[sel.value]];
    renderEnergyBins();
  }
}
