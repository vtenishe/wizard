/**
 * Step 4a — Temporal Variability of Geomagnetic Field
 * Three modes: STEADY_STATE, TIME_SERIES, COUPLED_MHD
 * TIME_SERIES: TS05 driving source (OMNIWeb | file | scalar)
 */
'use strict';
import { $, $$, STATE, emit } from '../core.js';
import { updateSidebar } from '../wizard.js';

export function initTemporal() {
  $$('.temp-card').forEach(card => {
    card.addEventListener('click', () => {
      if(card.classList.contains('disabled')) return;
      setTemporalMode(card.dataset.mode);
    });
  });

  ['event-start','event-end'].forEach(id => {
    $(id)?.addEventListener('change', e => {
      STATE[id.replace('-','') === 'eventstart' ? 'eventStart' : 'eventEnd'] = e.target.value;
      updateTimeline();
    });
  });

  $('field-update-dt')?.addEventListener('input', e => {
    STATE.fieldUpdateDt = parseFloat(e.target.value) || 5;
    validateDtPair();
    updateTimeline();
  });
  $('inject-dt')?.addEventListener('input', e => {
    STATE.injectDt = parseFloat(e.target.value) || 30;
    validateDtPair();
    updateTimeline();
  });

  $$('.ts-src-btn').forEach(btn => {
    btn.addEventListener('click', () => setTsSource(btn.dataset.src));
  });

  setTemporalMode('TIME_SERIES');
}

function setTemporalMode(mode) {
  STATE.temporalMode = mode;
  $$('.temp-card').forEach(c => c.classList.toggle('sel', c.dataset.mode === mode));
  const tsForm = $('ts-form');
  if(tsForm) tsForm.style.display = mode === 'TIME_SERIES' ? 'block' : 'none';
  updateSidebar();
  updateTimeline();
}

function setTsSource(src) {
  STATE.tsSource = src;
  $$('.ts-src-btn').forEach(b => b.classList.toggle('on', b.dataset.src === src));
  $('omni-panel')?.style && ($('omni-panel').style.display = src === 'omni' ? 'block' : 'none');
  $('file-panel')?.style && ($('file-panel').style.display = src === 'file' ? 'block' : 'none');
}

function validateDtPair() {
  const field = STATE.fieldUpdateDt;
  const inject = STATE.injectDt;
  const warn = $('dt-warn');
  if(!warn) return;
  if(inject < field) {
    warn.textContent = '⚠ Inject Δt must be ≥ Field Update Δt (particles can only be injected after the field is updated)';
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}

function updateTimeline() {
  const tl = $('ts-timeline');
  if(!tl) return;
  tl.innerHTML = '';

  const axis = document.createElement('div'); axis.className='fu-axis'; tl.appendChild(axis);

  const steps = 12;
  for(let i=0; i<=steps; i++) {
    const pct = (i/steps)*100;
    const isField  = i % Math.max(1, Math.round(STATE.fieldUpdateDt/10)) === 0;
    const isInject = i % Math.max(1, Math.round(STATE.injectDt/10)) === 0 && i > 0;

    if(isField) {
      const t = document.createElement('div');
      t.className='fu-tick'; t.style.left=pct+'%'; tl.appendChild(t);
      if(i % 3 === 0) {
        const l=document.createElement('div'); l.className='fu-label';
        l.style.left=pct+'%'; l.textContent=`${i*10}min`; tl.appendChild(l);
      }
    }
    if(isInject) {
      const t=document.createElement('div'); t.className='fu-tick inject'; t.style.left=pct+'%'; tl.appendChild(t);
      const p=document.createElement('div'); p.className='fu-particle'; p.style.left=(pct-.5)+'%'; p.textContent='⚡'; tl.appendChild(p);
    }
  }
}

/* Simulate OMNIWeb fetch */
export function simulateOmniFetch() {
  const steps = ['os-1','os-2','os-3','os-4'];
  const msgs = [
    { state:'running', text:'Querying omniweb.gsfc.nasa.gov for 1-min OMNI data…' },
    { state:'running', text:'Querying WDC Kyoto for hourly Dst index…' },
    { state:'running', text:'Merging streams, filling 2 data gaps by interpolation…' },
    { state:'done',    text:'Preview ready — 4,320 rows · 0 FATAL gaps · 2 warnings' },
  ];

  let step = 0;
  steps.forEach(id => {
    const el = $(id); if(el) { el.classList.remove('done','running'); el.classList.add('pending'); }
  });

  const el = $(steps[0]); if(el) el.classList.replace('pending','running');
  const statusEl = $('omni-status');

  const advance = () => {
    if(step >= steps.length) return;
    const el2 = $(steps[step]);
    if(el2) { el2.classList.remove('running'); el2.classList.add('done'); }
    step++;
    if(step < steps.length) {
      const next = $(steps[step]);
      if(next) next.classList.replace('pending','running');
      if(statusEl) statusEl.innerHTML = `<span class="ok">${msgs[step].text}</span>`;
      setTimeout(advance, 900);
    } else {
      if(statusEl) statusEl.innerHTML = `<span class="ok">✓ ${msgs[3].text}</span>`;
      $('omni-preview')?.style && ($('omni-preview').style.display='block');
    }
  };

  if(statusEl) statusEl.innerHTML = `<span class="ok">${msgs[0].text}</span>`;
  setTimeout(advance, 800);
}
