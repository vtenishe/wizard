/**
 * Step 4b — Particle Spectrum / Boundary Condition
 * Three spectrum types: POWER_LAW, BAND_FUNCTION, TABLE (file upload)
 * Live flux preview rendered on a canvas (log-log scale).
 */
'use strict';
import { $, $$, STATE, emit } from '../core.js';
import { updateSidebar } from '../wizard.js';

export function initSpectrum() {
  $$('.spec-card').forEach(card => {
    card.addEventListener('click', () => setSpecType(card.dataset.type));
  });

  ['spec-j0','spec-gamma','spec-e0','spec-emin','spec-emax',
   'band-gamma1','band-gamma2','band-e0'].forEach(id => {
    $(id)?.addEventListener('input', () => {
      pullSpecState();
      drawSpectrumCanvas();
    });
  });

  setSpecType('POWER_LAW');
}

function setSpecType(type) {
  STATE.spectrumType = type;
  $$('.spec-card').forEach(c => c.classList.toggle('sel', c.dataset.type === type));
  ['pl-form','band-form','table-form'].forEach(id => {
    const el = $(id);
    if(!el) return;
    const match = { 'pl-form':'POWER_LAW', 'band-form':'BAND', 'table-form':'TABLE' };
    el.style.display = match[id] === type ? 'block' : 'none';
  });
  drawSpectrumCanvas();
  updateSidebar();
}

function pullSpecState() {
  STATE.specJ0    = parseFloat($('spec-j0')?.value)    || 1e4;
  STATE.specGamma = parseFloat($('spec-gamma')?.value) || 3.5;
  STATE.specE0    = parseFloat($('spec-e0')?.value)    || 10;
  STATE.specEmin  = parseFloat($('spec-emin')?.value)  || 1;
  STATE.specEmax  = parseFloat($('spec-emax')?.value)  || 1000;
}

/* ── LOG-LOG FLUX CANVAS ── */
export function drawSpectrumCanvas() {
  const canvas = $('spec-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 400, H = canvas.offsetHeight || 160;
  canvas.width = W; canvas.height = H;

  ctx.fillStyle = '#060e1c';
  ctx.fillRect(0,0,W,H);

  const eMin = Math.max(0.1, STATE.specEmin || 1);
  const eMax = Math.min(1e5, STATE.specEmax || 1000);
  const logEmin = Math.log10(eMin), logEmax = Math.log10(eMax);
  const logJmin = -2, logJmax = 8;

  // Grid
  ctx.strokeStyle = '#0d2040'; ctx.lineWidth = 0.5;
  for(let le=Math.ceil(logEmin); le<=Math.floor(logEmax); le++) {
    const x = ((le-logEmin)/(logEmax-logEmin))*(W-40)+20;
    ctx.beginPath(); ctx.moveTo(x,5); ctx.lineTo(x,H-20); ctx.stroke();
    ctx.fillStyle = '#2a4060'; ctx.font='9px IBM Plex Mono';
    ctx.fillText(`10^${le}`, x-10, H-6);
  }
  for(let lj=logJmin; lj<=logJmax; lj+=2) {
    const y = H-20 - ((lj-logJmin)/(logJmax-logJmin))*(H-25);
    ctx.beginPath(); ctx.moveTo(20,y); ctx.lineTo(W-10,y); ctx.stroke();
    ctx.fillStyle = '#2a4060'; ctx.font='8px IBM Plex Mono';
    ctx.fillText(`10^${lj}`,2,y+3);
  }

  // Axis labels
  ctx.fillStyle = '#6a88b0'; ctx.font='10px IBM Plex Sans';
  ctx.fillText('E [MeV/n]', W/2-20, H-1);

  // Spectrum curve
  const pts = 300;
  ctx.beginPath(); ctx.strokeStyle = '#38c0ff'; ctx.lineWidth = 2;
  let started = false;
  for(let i=0; i<pts; i++) {
    const le = logEmin + (i/pts)*(logEmax-logEmin);
    const E = Math.pow(10, le);
    let J;
    if(STATE.spectrumType === 'POWER_LAW') {
      J = STATE.specJ0 * Math.pow(E / (STATE.specE0||10), -(STATE.specGamma||3.5));
    } else if(STATE.spectrumType === 'BAND') {
      const g1 = parseFloat($('band-gamma1')?.value) || 3.5;
      const g2 = parseFloat($('band-gamma2')?.value) || 1.5;
      const e0 = parseFloat($('band-e0')?.value) || 10;
      const Ebreak = (g1-g2)*e0;
      J = E < Ebreak
        ? STATE.specJ0 * Math.pow(E/e0, -g1) * Math.exp(-E/e0)
        : STATE.specJ0 * Math.pow((g1-g2)*e0/e0, g1-g2) * Math.exp(g2-g1) * Math.pow(E/e0, -g2);
    } else { break; }

    const lJ = Math.log10(Math.max(1e-4, J));
    const x = ((le-logEmin)/(logEmax-logEmin))*(W-40)+20;
    const y = H-20 - ((lJ-logJmin)/(logJmax-logJmin))*(H-25);
    if(!started) { ctx.moveTo(x, clampY(y,5,H-20)); started=true; }
    else ctx.lineTo(x, clampY(y,5,H-20));
  }
  ctx.stroke();

  // J0 reference annotation
  if(STATE.spectrumType !== 'TABLE') {
    const e0  = STATE.specE0 || 10;
    const lE0 = Math.log10(e0);
    if(lE0 >= logEmin && lE0 <= logEmax) {
      const x = ((lE0-logEmin)/(logEmax-logEmin))*(W-40)+20;
      ctx.strokeStyle='rgba(255,208,75,.4)'; ctx.lineWidth=1; ctx.setLineDash([3,4]);
      ctx.beginPath(); ctx.moveTo(x,5); ctx.lineTo(x,H-20); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='#ffd04b'; ctx.font='9px IBM Plex Mono';
      ctx.fillText('E₀', x+3, 18);
    }
  }
}

function clampY(y,lo,hi){ return Math.max(lo, Math.min(hi, y)); }
