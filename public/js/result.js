import { $, escapeHtml } from './util.js';

function modeTitle(mode, splitScope) {
  const fullstack = splitScope === 'fullstack';
  if (mode === 'skill') return fullstack ? '前後端 SKILL 架構' : 'SKILL 架構';
  return fullstack ? '前後端專案' : '後端 API 專案';
}

export function resetResult(mode, splitScope) {
  $('#card-result').classList.remove('hidden');
  $('#result-title').textContent = `產生${modeTitle(mode, splitScope)}`;
  $('#log').innerHTML = '';
  $('#result-body').innerHTML = '';
  setProgress(0, '準備中…');
  $('#card-result').scrollIntoView({ behavior: 'smooth' });
}

export function log(message, level = '') {
  const li = document.createElement('li');
  li.className = level;
  li.innerHTML = `<time>${new Date().toLocaleTimeString('zh-Hant', { hour12: false })}</time>${escapeHtml(message)}`;
  $('#log').appendChild(li);
  li.scrollIntoView({ block: 'nearest' });
}

export function setProgress(ratio, text) {
  $('#progress-bar').style.width = `${Math.round(ratio * 100)}%`;
  if (text !== undefined) $('#progress-text').textContent = text;
}

/**
 * @param {object} state { mode, plan, generated: Map<path, content>, failed: Set<path>, done: boolean }
 */
export function renderResult(state) {
  const { mode, plan, generated, failed } = state;
  const endpoints = plan.endpoints || [];

  const files = plan.files
    .map((f) => {
      const status = generated.has(f.path) ? 'done' : failed.has(f.path) ? 'failed' : 'pending';
      const label = { done: '完成', failed: '失敗', pending: '等待中' }[status];
      return `<li>
        <span><code>${escapeHtml(f.path)}</code><br /><span class="muted small">${escapeHtml(f.purpose)}</span></span>
        <span>
          <span class="file-status ${status}">${label}</span>
          ${status === 'done' ? `<button type="button" class="btn ghost small" data-preview="${escapeHtml(f.path)}">預覽</button>` : ''}
        </span>
      </li>`;
    })
    .join('');

  const frontend = (plan.frontendChanges || [])
    .map((c) => `<tr><td><code>${escapeHtml(c.file)}</code></td><td>${escapeHtml(c.change)}</td></tr>`)
    .join('');

  $('#result-body').innerHTML = `
    <div class="result-section">
      <h3>📋 分析摘要 <span class="muted small">${escapeHtml(plan.detectedStack || '')}</span></h3>
      <div class="summary-box">${escapeHtml(plan.summary || '（無）')}</div>
    </div>
    ${endpoints.length ? `
    <div class="result-section">
      <h3>🔌 ${mode === 'skill' ? 'Skill 涵蓋的 API' : '拆出的 API'}（${endpoints.length}）</h3>
      <table>
        <thead><tr><th>Method</th><th>Path</th><th>模組</th><th>說明</th><th>來源檔案</th></tr></thead>
        <tbody>${endpoints.map((e) => `<tr>
          <td><span class="method ${escapeHtml(String(e.method).toUpperCase())}">${escapeHtml(String(e.method).toUpperCase())}</span></td>
          <td><code>${escapeHtml(e.path)}</code></td>
          <td>${escapeHtml(e.module || '')}</td>
          <td>${escapeHtml(e.description || '')}</td>
          <td class="small">${(e.sourceFiles || []).map((s) => `<code>${escapeHtml(s)}</code>`).join('<br />')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
    ${plan.architecture ? `<div class="result-section"><h3>🗂️ 專案架構</h3><pre class="arch">${escapeHtml(plan.architecture)}</pre></div>` : ''}
    ${frontend ? `<div class="result-section"><h3>🖥️ ${state.options?.splitScope === 'fullstack' ? '前端改寫對照' : '前端需修改處'}</h3><table><thead><tr><th>檔案</th><th>${state.options?.splitScope === 'fullstack' ? '改寫方式 / 新路徑' : '修改方式'}</th></tr></thead><tbody>${frontend}</tbody></table></div>` : ''}
    <div class="result-section">
      <h3>📄 檔案（${generated.size} / ${plan.files.length}）</h3>
      <ul class="file-list">${files}</ul>
    </div>
    ${generated.size ? `
    <div class="download-row">
      <button type="button" class="btn primary big" id="download-zip">⬇️ 下載 ${escapeHtml(plan.projectName)}.zip</button>
      ${state.done && failed.size ? `<button type="button" class="btn ghost" id="retry-failed">🔁 重試失敗的 ${failed.size} 個檔案</button>` : ''}
    </div>
    ${mode === 'skill' && state.done ? `<p class="muted small">解壓縮後放到專案的 <code>.cursor/skills/${escapeHtml(plan.projectName)}/</code>（或 <code>~/.cursor/skills/</code>），再請 Agent 依 Skill ${state.options?.splitScope === 'fullstack' ? '同時產出前端與後端' : '拆出後端'}。</p>` : ''}
    ${mode === 'api' && state.done ? `<p class="muted small">${state.options?.splitScope === 'fullstack' ? '解壓縮後打開 <code>docs/index.html</code>；先啟動 <code>backend/</code>，再開啟 <code>frontend/</code>。測試區 / 正式區在後端 config 與前端 SDK 的 baseURL 切換。' : '解壓縮後打開 <code>docs/index.html</code> 查看啟用說明；在 <code>config/</code> 與 <code>.env</code> 切換測試區 / 正式區。'}</p>` : ''}` : ''}
  `;
}

export function initPreview(getContent) {
  const modal = $('#preview-modal');
  $('#result-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preview]');
    if (!btn) return;
    const path = btn.dataset.preview;
    $('#preview-title').textContent = path;
    $('#preview-content').textContent = getContent(path) ?? '';
    modal.classList.remove('hidden');
  });
  $('#preview-close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  $('#preview-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('#preview-content').textContent);
    $('#preview-copy').textContent = '已複製';
    setTimeout(() => ($('#preview-copy').textContent = '複製'), 1500);
  });
}
