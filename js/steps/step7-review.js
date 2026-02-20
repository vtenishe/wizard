/**
 * Step 7 — Review & Submit
 * Final validation sweep, AMPS_PARAM.in full preview,
 * file manifest table, submission confirmation.
 */
'use strict';
import { $, $$, STATE, getShueParams } from '../core.js';
import { buildParamFile } from '../param-builder.js';

export function initReview() {
  buildParamFile();
  renderManifest();
  renderValidationSummary();

  $('copy-param')?.addEventListener('click', () => {
    navigator.clipboard.writeText(buildParamFile()).then(() => {
      const btn = $('copy-param');
      if(btn) { btn.textContent='✓ Copied!'; btn.className='copy-btn copied'; }
      setTimeout(() => { if($('copy-param')) { $('copy-param').textContent='Copy'; $('copy-param').className='copy-btn'; } }, 2000);
    });
  });

  $('download-param')?.addEventListener('click', () => {
    const text = buildParamFile();
    const blob = new Blob([text], { type:'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'AMPS_PARAM.in';
    a.click();
  });

  $('submit-btn-final')?.addEventListener('click', showSubmitConfirm);
}

function renderManifest() {
  const tbody = $('manifest-tbody');
  if(!tbody) return;
  const files = [
    { name:'AMPS_PARAM.in',          role:'Main configuration',          required:true,  generated:true,  status:'ready' },
    { name:'AMPS_MANIFEST.json',      role:'Run metadata',                required:true,  generated:true,  status:'ready' },
    { name:'trajectory.txt',          role:'NAIRAS trajectory (Mode B)',   required:STATE.outputMode==='TRAJECTORY', generated:false, status: STATE.trajFile ? 'ready' : 'missing' },
    { name:'ts05_driving.txt',        role:'TS05 time-series drivers',     required:STATE.temporalMode==='TIME_SERIES' && STATE.tsSource==='file', generated:STATE.tsSource==='omni', status:'ready' },
    { name:'sep_spectrum_H+.txt',     role:'Spectrum table (if TABLE mode)', required:STATE.spectrumType==='TABLE', generated:false, status:STATE.spectrumType==='TABLE'?'missing':'n/a' },
  ];

  tbody.innerHTML = '';
  files.forEach(f => {
    if(!f.required && f.status==='n/a') return;
    const tr = document.createElement('tr');
    const statusClass = f.status==='ready' ? 'vt-pass' : f.status==='missing' ? 'vt-fail' : 'vt-na';
    const statusTxt   = f.status==='ready' ? '✓ READY' : f.status==='missing' ? '✗ MISSING' : '— N/A';
    tr.innerHTML = `
      <td style="font-family:var(--font-mono);color:var(--text)">${f.name}</td>
      <td style="color:var(--text-dim)">${f.role}</td>
      <td style="color:${f.required?'var(--text)':'var(--text-muted)'}">${f.required?'Required':'Optional'}</td>
      <td style="color:${f.generated?'var(--green)':'var(--text-dim)'}">${f.generated?'Auto-generated':'User upload'}</td>
      <td class="${statusClass}">${statusTxt}</td>`;
    tbody.appendChild(tr);
  });
}

function renderValidationSummary() {
  const container = $('review-checks');
  if(!container) return;
  const shue = getShueParams();

  const checks = [
    { label:'Run name set',                ok: !!STATE.runName?.trim() },
    { label:'PI email valid',              ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(STATE.piEmail||'') },
    { label:'Dst in TS05 range [−600, +50 nT]', ok: STATE.dst >= -600 && STATE.dst <= 50 },
    { label:'Pdyn > 0.1 nPa',              ok: STATE.pdyn > 0.1 },
    { label:'Domain boundary set',         ok: ['BOX','SHUE'].includes(STATE.boundaryType) },
    { label:'Shue r₀ in range (5–13 RE)',  ok: STATE.boundaryType!=='SHUE' || (shue.r0 > 5 && shue.r0 < 13) },
    { label:'Inject Δt ≥ Field Update Δt', ok: STATE.temporalMode==='STEADY_STATE' || STATE.injectDt >= STATE.fieldUpdateDt },
    { label:'Energy bins defined',         ok: STATE.energyBins?.length > 0 },
    { label:'Spectrum type selected',      ok: ['POWER_LAW','BAND','TABLE'].includes(STATE.spectrumType) },
    { label:'Output mode selected',        ok: ['POINTS','TRAJECTORY','SHELLS'].includes(STATE.outputMode) },
    { label:'Trajectory file uploaded',    ok: STATE.outputMode !== 'TRAJECTORY' || !!STATE.trajFile, warn: true },
  ];

  const passes = checks.filter(c => c.ok).length;
  const fails  = checks.filter(c => !c.ok && !c.warn).length;
  const warns  = checks.filter(c => !c.ok && c.warn).length;

  const summary = $('review-summary');
  if(summary) {
    summary.innerHTML = `
      <span class="v-ok">✓ ${passes} passed</span>  
      <span style="color:var(--text-muted)">·</span>  
      <span class="v-warn">⚠ ${warns} warning(s)</span>  
      <span style="color:var(--text-muted)">·</span>  
      <span class="v-err">✗ ${fails} fatal</span>`;
  }

  container.innerHTML = '';
  checks.forEach(c => {
    const div = document.createElement('div');
    div.className = 'review-item ' + (c.ok ? 'ri-ok' : c.warn ? 'ri-warn' : '');
    div.innerHTML = `
      <div class="ri-label">${c.label}</div>
      <div class="ri-val">${c.ok ? '✓ PASS' : c.warn ? '⚠ WARN' : '✗ FAIL'}</div>`;
    container.appendChild(div);
  });

  const submitBtn = $('submit-btn-final');
  if(submitBtn) submitBtn.disabled = fails > 0;
}

function showSubmitConfirm() {
  const modal = $('submit-modal');
  if(modal) modal.style.display = 'flex';
}

window.closeModal = function() {
  const modal = $('submit-modal');
  if(modal) modal.style.display = 'none';
};

window.confirmSubmit = function() {
  const modal = $('submit-modal');
  if(modal) modal.innerHTML = `
    <div style="background:var(--bg-panel);border:1px solid var(--green);border-radius:12px;padding:32px;text-align:center;max-width:500px;">
      <div style="font-size:48px;margin-bottom:16px;">🚀</div>
      <h2 style="color:var(--green);margin-bottom:8px;">Run Submitted!</h2>
      <p style="color:var(--text-dim);margin-bottom:16px;">Your run <strong style="color:#fff">${STATE.runName}</strong> has been queued at CCMC.<br>
      Estimated queue: <strong style="color:var(--orange)">1–3 days</strong> · Compute: <strong style="color:var(--orange)">~5,000 SBU</strong></p>
      <p style="font-size:11px;color:var(--text-muted)">Confirmation email will be sent to ${STATE.piEmail || '(no email set)'}.</p>
    </div>`;
};
