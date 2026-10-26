import { $, downloadBlob } from './util.js';
import { postJson, postForBlob } from './api.js';
import { getProject, projectPayload, findSourceFiles } from './project.js';
import { getActiveKey, toAiPayload } from './keys.js';
import { getImages } from './images.js';
import { collectOptions, validateOptions } from './options.js';
import { resetResult, log, setProgress, renderResult, initPreview } from './result.js';

const SHARED_PATTERN =
  /(^|\/)(config|configs|sdk|frontend-sdk)\/|(^|\/)(package\.json|pom\.xml|build\.gradle(\.kts)?|go\.mod|composer\.json|CMakeLists\.txt|Cargo\.toml|\.env\.example|SKILL\.md|README\.md)$|(^|\/)(app|server|main|index|bootstrap|application)\.[a-z]+$/i;

let settings;
let state = null;
let controller = null;

export function initPipeline(config) {
  settings = config.generation;
  $('#run-api').addEventListener('click', () => start('api'));
  $('#run-skill').addEventListener('click', () => start('skill'));
  $('#run-cancel').addEventListener('click', () => controller?.abort());
  $('#result-body').addEventListener('click', (e) => {
    if (e.target.closest('#download-zip')) downloadZip();
    if (e.target.closest('#retry-failed')) retryFailed();
  });
  initPreview((path) => state?.generated.get(path));
}

function showError(message) {
  const el = $('#form-error');
  el.textContent = message;
  el.classList.toggle('hidden', !message);
}

function validate() {
  const errors = [];
  const project = getProject();
  if (!project || !project.files.length) errors.push('請先選擇主專案資料夾（必填）');
  if (!getActiveKey()) errors.push('請先新增至少一組 AI API Key（必填）');
  errors.push(...validateOptions(collectOptions()));
  return errors;
}

function setBusy(busy) {
  $('#run-api').disabled = busy;
  $('#run-skill').disabled = busy;
  $('#run-cancel').classList.toggle('hidden', !busy);
}

async function start(mode) {
  const errors = validate();
  showError(errors.join('\n'));
  if (errors.length) {
    if (!getProject()) $('#card-project').scrollIntoView({ behavior: 'smooth' });
    else if (!getActiveKey()) $('#card-keys').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const key = getActiveKey();
  state = {
    mode,
    ai: toAiPayload(key),
    project: projectPayload(),
    options: collectOptions(),
    plan: null,
    generated: new Map(),
    failed: new Set(),
    done: false,
  };

  controller = new AbortController();
  setBusy(true);
  resetResult(mode, state.options.splitScope);

  try {
    log(`使用 ${key.name}（${state.ai.model}）分析專案「${state.project.name}」，共 ${state.project.files.length} 個檔案，範圍：${state.options.splitScope === 'fullstack' ? '前後端一起' : '只分離後端'}…`);
    setProgress(0.03, 'AI 分析專案與規劃中，大型專案可能需要數分鐘…');
    const { plan } = await postJson(
      '/api/plan',
      { mode, ai: state.ai, project: state.project, options: state.options, images: getImages() },
      controller.signal
    );
    state.plan = plan;
    log(`規劃完成：${plan.endpoints.length} 支 API、${plan.files.length} 個檔案`, 'ok');
    renderResult(state);

    await generateFiles(plan.files.map((f) => f.path));
  } catch (err) {
    handleError(err);
  } finally {
    finish();
  }
}

async function retryFailed() {
  if (!state?.failed.size) return;
  const paths = [...state.failed];
  state.failed.clear();
  state.done = false;
  controller = new AbortController();
  setBusy(true);
  try {
    log(`重試 ${paths.length} 個失敗的檔案…`);
    await generateFiles(paths);
  } catch (err) {
    handleError(err);
  } finally {
    finish();
  }
}

function handleError(err) {
  if (err.name === 'AbortError') log('已取消', 'warn');
  else log(`錯誤：${err.message}`, 'error');
  if (state?.plan) {
    for (const f of state.plan.files) if (!state.generated.has(f.path)) state.failed.add(f.path);
  }
}

function finish() {
  setBusy(false);
  if (!state) return;
  state.done = true;
  if (state.plan) {
    renderResult(state);
    const total = state.plan.files.length;
    setProgress(state.generated.size / total, `完成 ${state.generated.size} / ${total} 個檔案${state.failed.size ? `，${state.failed.size} 個失敗` : ''}`);
    if (state.generated.size === total) log('全部檔案產生完成，可以下載 ZIP 了', 'ok');
  } else {
    setProgress(0, '未完成');
  }
}

/**
 * 分批請 AI 產生檔案；被截斷或漏掉的檔案會改為單檔重試。
 */
async function generateFiles(paths) {
  const { plan } = state;
  const byPath = new Map(plan.files.map((f) => [f.path, f]));
  const queue = paths.map((p) => ({ file: byPath.get(p), attempts: 0 })).filter((q) => q.file);
  const total = plan.files.length;

  while (queue.length) {
    const batch = queue[0].attempts > 0 ? queue.splice(0, 1) : takeFresh(queue, settings.filesPerBatch);
    const targets = batch.map((q) => q.file);
    const names = targets.map((t) => t.path).join('、');
    setProgress(0.05 + 0.95 * (state.generated.size / total), `產生中（${state.generated.size} / ${total}）：${names}`);
    log(`產生 ${names}${batch[0].attempts ? `（第 ${batch[0].attempts + 1} 次嘗試）` : ''}`);

    const result = await postJson(
      '/api/generate',
      {
        mode: state.mode,
        ai: state.ai,
        project: { name: state.project.name },
        options: state.options,
        plan,
        targets: targets.map(({ path, purpose }) => ({ path, purpose })),
        sources: findSourceFiles(targets.flatMap((t) => t.sources)).map(({ path, content }) => ({ path, content })),
        shared: sharedFiles(targets),
      },
      controller.signal
    );

    for (const f of result.files) state.generated.set(f.path, f.content);
    if (result.files.length) log(`完成 ${result.files.map((f) => f.path).join('、')}`, 'ok');

    for (const path of result.missing) {
      const item = batch.find((q) => q.file.path === path);
      item.attempts++;
      if (item.attempts > settings.maxRetriesPerFile) {
        state.failed.add(path);
        log(`放棄 ${path}：多次嘗試仍無法完整產生`, 'error');
      } else {
        queue.unshift(item);
        log(`${path} ${result.truncated ? '輸出被截斷' : '未產生'}，稍後單獨重試`, 'warn');
      }
    }
    renderResult(state);
  }
}

function takeFresh(queue, n) {
  const out = [];
  for (let i = 0; i < queue.length && out.length < n; ) {
    if (queue[i].attempts === 0) out.push(...queue.splice(i, 1));
    else i++;
  }
  return out;
}

function sharedFiles(targets) {
  const exclude = new Set(targets.map((t) => t.path));
  return [...state.generated.entries()]
    .filter(([path]) => !exclude.has(path) && SHARED_PATTERN.test(path))
    .sort((a, b) => a[1].length - b[1].length)
    .map(([path, content]) => ({ path, content }));
}

async function downloadZip() {
  const btn = $('#download-zip');
  btn.disabled = true;
  try {
    const files = [...state.generated.entries()].map(([path, content]) => ({ path, content }));
    files.push({ path: '.splitter/plan.json', content: JSON.stringify(state.plan, null, 2) });
    const blob = await postForBlob('/api/zip', { name: state.plan.projectName, files });
    downloadBlob(blob, `${state.plan.projectName}.zip`);
  } catch (err) {
    alert(`打包失敗：${err.message}`);
  } finally {
    btn.disabled = false;
  }
}
