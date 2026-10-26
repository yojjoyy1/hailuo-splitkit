import { $, escapeHtml, formatBytes, formatNumber } from './util.js';

const PRIORITY_PATTERN =
  /\b(fetch|axios|ajax|XMLHttpRequest|api|sql|query|select |insert |update |delete |database|db\.|firebase|supabase|mongo|prisma|sequelize|password|secret|token|apikey|api_key|route|router|controller|service|model|repository|\$_(GET|POST|REQUEST)|mysqli|PDO)\b/gi;

let cfg;
let project = null;

export function initProject(config, onChange) {
  cfg = config.upload;
  const input = $('#project-input');
  const drop = $('#project-drop');

  $('#project-browse').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    if (!input.files.length) return;
    const entries = [...input.files].map((file) => ({ file, fullPath: file.webkitRelativePath || file.name }));
    await load(entries);
    input.value = '';
    onChange?.();
  });

  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const items = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!items.length) return;
    renderLoading();
    const entries = [];
    for (const item of items) await walkEntry(item, '', entries);
    await load(entries);
    onChange?.();
  });
}

export function getProject() {
  return project;
}

/** 依原專案路徑取得檔案內容（plan 裡的 sources 可能帶有前綴或 ./） */
export function findSourceFiles(paths) {
  if (!project) return [];
  const out = new Map();
  for (const raw of paths || []) {
    const p = String(raw).replace(/\\/g, '/').replace(/^\.?\//, '').replace(new RegExp(`^${escapeRegExp(project.name)}/`), '');
    const hit = project.byPath.get(p) || project.files.find((f) => f.path.endsWith('/' + p) || p.endsWith('/' + f.path));
    if (hit) out.set(hit.path, hit);
  }
  return [...out.values()];
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function walkEntry(entry, prefix, out) {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    out.push({ file, fullPath: path });
    return;
  }
  if (entry.isDirectory) {
    if (prefix && cfg.ignoreDirs.includes(entry.name)) return;
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      for (const child of batch) await walkEntry(child, path, out);
    } while (batch.length);
  }
}

function classify(path, file) {
  const segments = path.split('/');
  const name = segments[segments.length - 1];
  if (segments.slice(0, -1).some((s) => cfg.ignoreDirs.includes(s))) return 'ignore';
  if (cfg.ignoreFiles.includes(name)) return 'ignore';
  // 真正的 .env 可能含有機密，不送給 AI
  if (/^\.env(\..+)?$/.test(name) && !/\.(example|sample)$/.test(name)) return '機敏檔案';
  if (/\.min\.(js|css)$|\.map$/.test(name)) return '壓縮檔';
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (!cfg.specialFiles.includes(name) && !cfg.textExtensions.includes(ext)) return '非文字檔';
  if (file.size > cfg.maxFileBytes) return `過大 ${formatBytes(file.size)}`;
  return 'ok';
}

function priorityOf(path, content) {
  let score = (content.match(PRIORITY_PATTERN) || []).length;
  if (/\.(md|txt|css|scss|less|sass)$/i.test(path)) score -= 50;
  if (/(^|\/)(package\.json|composer\.json|pom\.xml|go\.mod|requirements\.txt)$/.test(path)) score += 100;
  return score;
}

async function load(entries) {
  renderLoading();
  const rootName = entries[0]?.fullPath.split('/')[0] || 'project';
  const multiRoot = entries.some((e) => e.fullPath.split('/')[0] !== rootName);

  const files = [];
  const tree = [];
  let skipped = 0;
  let ignored = 0;

  for (const { file, fullPath } of entries) {
    const path = multiRoot ? fullPath : fullPath.split('/').slice(1).join('/') || fullPath;
    const status = classify(path, file);
    if (status === 'ignore') {
      ignored++;
      continue;
    }
    if (status !== 'ok') {
      skipped++;
      tree.push({ path, note: status });
      continue;
    }
    const content = await file.text();
    if (content.includes('\u0000')) {
      skipped++;
      tree.push({ path, note: '二進位' });
      continue;
    }
    files.push({ path, content, size: file.size });
    tree.push({ path });
  }

  files.sort((a, b) => priorityOf(b.path, b.content) - priorityOf(a.path, a.content));
  tree.sort((a, b) => a.path.localeCompare(b.path));

  let budget = cfg.maxContextChars;
  for (const f of files) {
    const cost = f.content.length + f.path.length + 30;
    f.inContext = budget >= cost;
    if (f.inContext) budget -= cost;
  }

  project = {
    name: multiRoot ? 'project' : rootName,
    files,
    byPath: new Map(files.map((f) => [f.path, f])),
    tree,
    skipped,
    ignored,
    totalChars: files.reduce((n, f) => n + f.content.length, 0),
  };
  renderSummary();
}

/** 送給 /api/plan 的專案資料 */
export function projectPayload() {
  const inContext = new Set(project.files.filter((f) => f.inContext).map((f) => f.path));
  return {
    name: project.name,
    tree: project.tree.slice(0, 3000).map((t) => (t.note ? `${t.path}  [未提供內容：${t.note}]` : inContext.has(t.path) ? t.path : `${t.path}  [未提供內容：超過分析長度上限]`)),
    files: project.files.filter((f) => f.inContext).map(({ path, content }) => ({ path, content })),
  };
}

function renderLoading() {
  const box = $('#project-summary');
  box.classList.remove('hidden');
  box.innerHTML = '<p class="muted">讀取專案中…</p>';
}

function renderSummary() {
  const box = $('#project-summary');
  const p = project;
  if (!p.files.length) {
    box.innerHTML = `<p class="form-error">找不到可分析的原始碼檔案，請確認選擇的資料夾。</p>`;
    return;
  }
  const outOfContext = p.files.filter((f) => !f.inContext).length;
  box.innerHTML = `
    <div class="stats">
      <span class="stat">專案：<b>${escapeHtml(p.name)}</b></span>
      <span class="stat">可分析檔案：<b>${formatNumber(p.files.length)}</b></span>
      <span class="stat">略過：<b>${formatNumber(p.skipped)}</b>（另忽略 ${formatNumber(p.ignored)} 個依賴/建置檔）</span>
      <span class="stat">總字元：<b>${formatNumber(p.totalChars)}</b></span>
      ${outOfContext ? `<span class="stat" title="超過 upload.maxContextChars，只會列在檔案樹，規劃時不送內容">超過分析上限：<b>${outOfContext}</b> 檔</span>` : ''}
    </div>
    <details>
      <summary class="small">查看檔案樹</summary>
      <div class="tree">${p.tree
        .map((t) => (t.note ? `<div class="skipped">${escapeHtml(t.path)}（${escapeHtml(t.note)}）</div>` : `<div>${escapeHtml(t.path)}</div>`))
        .join('')}</div>
    </details>`;
}
