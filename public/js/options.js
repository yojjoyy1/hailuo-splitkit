import { $, $$, escapeHtml } from './util.js';
import { load, save } from './storage.js';

const CUSTOM = '__custom__';
let languages = [];

export function initOptions(config) {
  languages = config.languages;

  $('#opt-language').innerHTML = languages
    .map((l) => `<option value="${l.id}">${escapeHtml(l.label)}</option>`)
    .join('');

  $('#security-items').innerHTML = config.securityItems
    .map((s) => `<label><input type="checkbox" name="security-item" value="${s.id}" /> ${escapeHtml(s.label)}</label>`)
    .join('');

  $('#opt-language').addEventListener('change', () => renderFrameworks());
  $('#opt-framework').addEventListener('change', syncVisibility);
  $('#opt-sign-enabled').addEventListener('change', syncVisibility);
  $$('input[name="sign-mode"]').forEach((r) => r.addEventListener('change', syncVisibility));
  $('#opt-security-enabled').addEventListener('change', syncVisibility);
  $$('input[name="split-scope"]').forEach((r) => r.addEventListener('change', syncSplitButtons));

  restore();
  syncSplitButtons();

  document.querySelector('main').addEventListener('change', persist);
  document.querySelector('main').addEventListener('input', persist);
}

function renderFrameworks(selected) {
  const lang = languages.find((l) => l.id === $('#opt-language').value) || languages[0];
  const options = lang.frameworks.map(
    (f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}${f === lang.defaultFramework ? '（預設）' : ''}</option>`
  );
  options.push(`<option value="${CUSTOM}">其他（手填）</option>`);
  $('#opt-framework').innerHTML = options.join('');
  $('#opt-framework').value = selected && [...lang.frameworks, CUSTOM].includes(selected) ? selected : lang.defaultFramework;
  syncVisibility();
}

function syncVisibility() {
  $('#opt-language-custom').classList.toggle('hidden', $('#opt-language').value !== 'other');
  $('#opt-framework-custom').classList.toggle('hidden', $('#opt-framework').value !== CUSTOM);
  $('#sign-options').classList.toggle('hidden', !$('#opt-sign-enabled').checked);
  $('#sign-custom').classList.toggle('hidden', signMode() !== 'custom');
  $('#security-options').classList.toggle('hidden', !$('#opt-security-enabled').checked);
}

function signMode() {
  return $('input[name="sign-mode"]:checked')?.value || 'auto';
}

function splitScope() {
  return $('input[name="split-scope"]:checked')?.value === 'fullstack' ? 'fullstack' : 'backend';
}

function syncSplitButtons() {
  const fullstack = splitScope() === 'fullstack';
  $('#run-api').textContent = fullstack ? '✂️ 切割前後端專案' : '✂️ 切割 API 專案';
  $('#run-skill').textContent = fullstack ? '🧩 建立前後端 SKILL' : '🧩 建立 SKILL 架構';
}

export function collectOptions() {
  return {
    splitScope: splitScope(),
    targetDescription: $('#opt-target').value,
    signKey: {
      enabled: $('#opt-sign-enabled').checked,
      mode: signMode(),
      algorithm: $('#opt-sign-algorithm').value,
      headerName: $('#opt-sign-header').value.trim(),
      timestampHeader: $('#opt-sign-ts').value.trim(),
      nonceHeader: $('#opt-sign-nonce').value.trim(),
      expireSeconds: $('#opt-sign-expire').value,
      secret: $('#opt-sign-secret').value,
      rule: $('#opt-sign-rule').value,
    },
    language: { id: $('#opt-language').value, custom: $('#opt-language-custom').value.trim() },
    framework: { value: $('#opt-framework').value, custom: $('#opt-framework-custom').value.trim() },
    security: {
      enabled: $('#opt-security-enabled').checked,
      items: $$('input[name="security-item"]:checked').map((c) => c.value),
      custom: $('#opt-security-custom').value,
    },
    architecture: $('#opt-architecture').value,
    notes: $('#opt-notes').value,
  };
}

export function validateOptions(opts) {
  const errors = [];
  if (opts.language.id === 'other' && !opts.language.custom) errors.push('選擇「其他」語言時請填入語言名稱');
  if (opts.framework.value === CUSTOM && !opts.framework.custom) errors.push('選擇手填框架時請填入框架名稱');
  return errors;
}

function persist() {
  save('options', collectOptions());
}

function restore() {
  const o = load('options', null);
  if (!o) {
    renderFrameworks();
    return;
  }
  const scope = $(`input[name="split-scope"][value="${o.splitScope === 'fullstack' ? 'fullstack' : 'backend'}"]`);
  if (scope) scope.checked = true;
  $('#opt-target').value = o.targetDescription || '';
  $('#opt-sign-enabled').checked = !!o.signKey?.enabled;
  const mode = $(`input[name="sign-mode"][value="${o.signKey?.mode || 'auto'}"]`);
  if (mode) mode.checked = true;
  $('#opt-sign-algorithm').value = o.signKey?.algorithm || 'HMAC-SHA256';
  $('#opt-sign-header').value = o.signKey?.headerName || '';
  $('#opt-sign-ts').value = o.signKey?.timestampHeader || '';
  $('#opt-sign-nonce').value = o.signKey?.nonceHeader || '';
  $('#opt-sign-expire').value = o.signKey?.expireSeconds || '';
  $('#opt-sign-secret').value = o.signKey?.secret || '';
  $('#opt-sign-rule').value = o.signKey?.rule || '';
  if (languages.some((l) => l.id === o.language?.id)) $('#opt-language').value = o.language.id;
  $('#opt-language-custom').value = o.language?.custom || '';
  $('#opt-framework-custom').value = o.framework?.custom || '';
  $('#opt-security-enabled').checked = !!o.security?.enabled;
  for (const c of $$('input[name="security-item"]')) c.checked = (o.security?.items || []).includes(c.value);
  $('#opt-security-custom').value = o.security?.custom || '';
  $('#opt-architecture').value = o.architecture || '';
  $('#opt-notes').value = o.notes || '';
  renderFrameworks(o.framework?.value);
}
