import { $, escapeHtml, maskKey, uid } from './util.js';
import { getKeys, putKeys, postJson } from './api.js';

let providers = {};
let keys = [];
let activeId = null;

export async function initKeys(config) {
  providers = config.providers;
  const stored = await getKeys();
  keys = Array.isArray(stored.keys) ? stored.keys : [];
  activeId = stored.activeKeyId || keys[0]?.id || null;

  const providerSelect = $('#key-provider');
  providerSelect.innerHTML = Object.entries(providers)
    .map(([id, p]) => `<option value="${id}">${escapeHtml(p.label)}</option>`)
    .join('');
  providerSelect.addEventListener('change', () => syncModelList(true));
  syncModelList(true);

  $('#key-toggle').addEventListener('click', () => {
    const input = $('#key-value');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('#key-toggle').textContent = show ? '隱藏' : '顯示';
  });

  $('#key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveForm();
  });
  $('#key-cancel').addEventListener('click', resetForm);

  $('#keys-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    const actions = { use: useKey, edit: editKey, remove: removeKey, test: testKey };
    actions[btn.dataset.action]?.(id, btn);
  });

  render();
}

export function getActiveKey() {
  return keys.find((k) => k.id === activeId) || keys[0] || null;
}

export function toAiPayload(key) {
  return { keyId: key.id };
}

async function persist() {
  const saved = await putKeys({ keys, activeKeyId: activeId });
  keys = saved.keys;
  activeId = saved.activeKeyId;
}

function syncModelList(setDefault) {
  const p = providers[$('#key-provider').value];
  $('#key-model-list').innerHTML = p.models.map((m) => `<option value="${escapeHtml(m)}"></option>`).join('');
  $('#key-model').placeholder = `預設 ${p.defaultModel}`;
  if (setDefault && !$('#key-id').value) $('#key-model').value = '';
  $('#key-value').placeholder = $('#key-provider').value === 'anthropic' ? 'sk-ant-...' : 'sk-...';
}

async function saveForm() {
  const apiKey = $('#key-value').value.trim();
  if (!apiKey) {
    alert('請輸入 API Key');
    $('#key-value').focus();
    return;
  }
  const provider = $('#key-provider').value;
  const id = $('#key-id').value || uid();
  const data = {
    id,
    provider,
    name: $('#key-name').value.trim() || `${providers[provider].label} Key`,
    apiKey,
    model: $('#key-model').value.trim(),
    baseUrl: $('#key-baseurl').value.trim(),
    maxTokens: Number($('#key-maxtokens').value) || null,
  };
  const idx = keys.findIndex((k) => k.id === id);
  if (idx >= 0) keys[idx] = data;
  else keys.push(data);
  if (!activeId || !keys.some((k) => k.id === activeId)) activeId = id;
  try {
    await persist();
  } catch (err) {
    alert(`無法寫入 config.js：${err.message}`);
    return;
  }
  resetForm();
  render();
}

function resetForm() {
  $('#key-form').reset();
  $('#key-id').value = '';
  $('#key-save').textContent = '💾 儲存 Key';
  $('#key-cancel').classList.add('hidden');
  $('#key-value').type = 'password';
  $('#key-toggle').textContent = '顯示';
  syncModelList(true);
}

async function useKey(id) {
  activeId = id;
  try {
    await persist();
  } catch (err) {
    alert(`無法寫入 config.js：${err.message}`);
  }
  render();
}

function editKey(id) {
  const k = keys.find((x) => x.id === id);
  if (!k) return;
  $('#key-id').value = k.id;
  $('#key-provider').value = k.provider;
  syncModelList(false);
  $('#key-name').value = k.name;
  $('#key-value').value = k.apiKey;
  $('#key-model').value = k.model || '';
  $('#key-baseurl').value = k.baseUrl || '';
  $('#key-maxtokens').value = k.maxTokens || '';
  $('#key-save').textContent = '💾 更新 Key';
  $('#key-cancel').classList.remove('hidden');
  $('#key-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function removeKey(id) {
  const k = keys.find((x) => x.id === id);
  if (!k || !confirm(`確定刪除「${k.name}」？`)) return;
  keys = keys.filter((x) => x.id !== id);
  if (activeId === id) activeId = keys[0]?.id || null;
  if ($('#key-id').value === id) resetForm();
  try {
    await persist();
  } catch (err) {
    alert(`無法寫入 config.js：${err.message}`);
  }
  render();
}

async function testKey(id, btn) {
  const k = keys.find((x) => x.id === id);
  if (!k) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '測試中…';
  try {
    await postJson('/api/keys/test', { ai: toAiPayload(k) });
    btn.textContent = '✅ 可用';
  } catch (err) {
    btn.textContent = '❌ 失敗';
    alert(`「${k.name}」測試失敗：\n${err.message}`);
  } finally {
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 2500);
  }
}

function render() {
  const list = $('#keys-list');
  $('#keys-required').classList.toggle('hidden', keys.length > 0);
  if (!keys.length) {
    list.innerHTML = '<p class="muted small">尚未新增任何 API Key。請在下方表單新增，或直接編輯專案根目錄的 <code>config.js</code>。</p>';
    return;
  }
  const active = getActiveKey();
  list.innerHTML = keys
    .map((k) => {
      const isActive = active?.id === k.id;
      const model = k.model || providers[k.provider]?.defaultModel;
      return `
      <div class="key-item ${isActive ? 'active' : ''}" data-id="${k.id}">
        <div class="meta">
          <div><span class="provider-tag ${k.provider}">${escapeHtml(providers[k.provider]?.label || k.provider)}</span><strong>${escapeHtml(k.name)}</strong>${isActive ? ' <span class="small">（使用中）</span>' : ''}</div>
          <div class="small muted mono">${escapeHtml(maskKey(k.apiKey))} ・ ${escapeHtml(model)}${k.baseUrl ? ` ・ ${escapeHtml(k.baseUrl)}` : ''}</div>
        </div>
        <div class="actions">
          ${isActive ? '' : '<button type="button" class="btn ghost small" data-action="use">使用</button>'}
          <button type="button" class="btn ghost small" data-action="test">測試</button>
          <button type="button" class="btn ghost small" data-action="edit">修改</button>
          <button type="button" class="btn ghost small" data-action="remove">刪除</button>
        </div>
      </div>`;
    })
    .join('');
}
