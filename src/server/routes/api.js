const express = require('express');
const JSZip = require('jszip');
const { callAI, AIError } = require('../ai');
const { builders } = require('../prompts');
const { normalizeOptions } = require('../options');
const { extractJson, parseFileBlocks, sanitizePath } = require('../utils/parse');
const keysStore = require('../keys-store');

const REQUIRED_FILES = {
  api: {
    backend: [
      { path: 'README.md', purpose: '專案簡介、目錄結構、快速開始' },
      { path: '.env.example', purpose: '所有環境變數範例與註解' },
      { path: 'FRONTEND_MIGRATION.md', purpose: '原前端改為呼叫 API 的對照與步驟' },
      { path: 'docs/index.html', purpose: '啟用說明網頁：安裝、config 參數、測試區/正式區切換、API 一覽、部署' },
    ],
    fullstack: [
      { path: 'README.md', purpose: '整包簡介：如何同時啟動前端與後端、目錄說明' },
      { path: 'backend/.env.example', purpose: '後端所有環境變數範例與註解' },
      { path: 'docs/index.html', purpose: '啟用說明網頁：前後端安裝、config 參數、測試區/正式區切換、API 一覽、部署' },
    ],
  },
  skill: {
    backend: [
      { path: 'SKILL.md', purpose: 'Skill 主檔（YAML frontmatter + 工作流程：只拆後端）' },
      { path: 'README.md', purpose: 'Skill 安裝與使用說明' },
    ],
    fullstack: [
      { path: 'SKILL.md', purpose: 'Skill 主檔（YAML frontmatter + 工作流程：同時產出前端與後端）' },
      { path: 'README.md', purpose: 'Skill 安裝與使用說明' },
    ],
  },
};

function requiredFiles(mode, splitScope) {
  const byMode = REQUIRED_FILES[mode] || {};
  return byMode[splitScope] || byMode.backend || [];
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** 用戶端斷線時中止 AI 請求 */
function abortOnClose(res) {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

function getMode(mode) {
  if (!builders[mode]) throw new AIError(`未知的模式：${mode}`, 400);
  return mode;
}

function takeWithinBudget(files, budget) {
  const out = [];
  let used = 0;
  for (const f of files || []) {
    const size = (f.content || '').length + f.path.length;
    if (used + size > budget) continue;
    used += size;
    out.push(f);
  }
  return out;
}

function normalizePlan(plan, mode, maxFiles, splitScope) {
  if (!plan || !Array.isArray(plan.files)) throw new AIError('AI 回傳的規劃缺少 files 欄位', 502);

  const required = requiredFiles(mode, splitScope);
  const seen = new Set();
  const files = [];
  for (const f of plan.files) {
    const path = sanitizePath(f.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    files.push({
      path,
      purpose: String(f.purpose || ''),
      sources: Array.isArray(f.sources) ? f.sources.map(String) : [],
    });
  }

  const missingRequired = required.filter((r) => !seen.has(r.path));
  const kept = files.slice(0, Math.max(0, maxFiles - missingRequired.length));
  // 必要檔案若原本就在清單中但被裁掉，也要保留
  for (const f of files.slice(kept.length)) {
    if (required.some((r) => r.path === f.path)) kept.push(f);
  }
  kept.push(...missingRequired.map((r) => ({ ...r, sources: [] })));

  const defaultName =
    mode === 'skill'
      ? splitScope === 'fullstack'
        ? 'fullstack-split-skill'
        : 'backend-split-skill'
      : splitScope === 'fullstack'
        ? 'fullstack-api'
        : 'backend-api';

  return {
    projectName: sanitizePath(plan.projectName || '').replace(/\//g, '-') || defaultName,
    summary: String(plan.summary || ''),
    detectedStack: String(plan.detectedStack || ''),
    endpoints: Array.isArray(plan.endpoints) ? plan.endpoints : [],
    architecture: String(plan.architecture || ''),
    files: kept,
    frontendChanges: Array.isArray(plan.frontendChanges) ? plan.frontendChanges : [],
    notes: String(plan.notes || ''),
    splitScope,
  };
}

module.exports = function createApiRouter(config) {
  const router = express.Router();
  const gen = config.generation;

  router.get('/config', (req, res) => {
    const providers = {};
    for (const [id, p] of Object.entries(config.ai.providers)) {
      providers[id] = { label: p.label, baseUrl: p.baseUrl, defaultModel: p.defaultModel, models: p.models };
    }
    res.json({
      providers,
      languages: config.languages,
      securityItems: config.securityItems,
      upload: config.upload,
      generation: {
        filesPerBatch: gen.filesPerBatch,
        maxRetriesPerFile: gen.maxRetriesPerFile,
        maxImages: gen.maxImages,
        maxPlanFiles: gen.maxPlanFiles,
        maxPlanFilesFullstack: gen.maxPlanFilesFullstack || gen.maxPlanFiles,
      },
      defaultMaxOutputTokens: config.ai.defaultMaxOutputTokens,
    });
  });

  router.get('/keys', (req, res) => {
    res.json(keysStore.load());
  });

  router.put(
    '/keys',
    asyncRoute(async (req, res) => {
      res.json(keysStore.save(req.body || {}));
    })
  );

  router.post(
    '/keys/test',
    asyncRoute(async (req, res) => {
      const ai = keysStore.resolveAi(req.body.ai || {});
      const result = await callAI(
        { ...ai, maxTokens: 20 },
        { system: 'You are a health check.', text: 'Reply with: OK' },
        { config, signal: abortOnClose(res) }
      );
      res.json({ ok: true, reply: result.text.slice(0, 100) });
    })
  );

  router.post(
    '/plan',
    asyncRoute(async (req, res) => {
      const { mode: rawMode, ai: rawAi, project, options, images = [] } = req.body;
      const ai = keysStore.resolveAi(rawAi || {});
      const mode = getMode(rawMode);
      if (!project?.files?.length) throw new AIError('專案沒有可分析的檔案', 400);

      const opts = normalizeOptions(options, config);
      const maxFiles =
        opts.splitScope === 'fullstack' ? gen.maxPlanFilesFullstack || gen.maxPlanFiles : gen.maxPlanFiles;
      const prompt = builders[mode].plan({
        project,
        opts,
        imageCount: Math.min(images.length, gen.maxImages),
        maxContextChars: config.upload.maxContextChars,
        maxFiles,
      });
      const signal = abortOnClose(res);
      const input = { ...prompt, images: images.slice(0, gen.maxImages) };

      let result = await callAI(ai, input, { config, signal });
      let plan;
      try {
        plan = extractJson(result.text);
      } catch {
        // 再給一次機會，要求只輸出合法 JSON
        result = await callAI(
          ai,
          { ...input, text: `${input.text}\n\n重要：上一次的輸出不是合法 JSON${result.truncated ? '（內容太長被截斷）' : ''}。請精簡內容並只輸出合法 JSON。` },
          { config, signal }
        );
        try {
          plan = extractJson(result.text);
        } catch (err) {
          throw new AIError(`無法解析 AI 規劃結果：${err.message}`, 502, result.text.slice(0, 2000));
        }
      }

      res.json({ plan: normalizePlan(plan, mode, maxFiles, opts.splitScope), options: opts });
    })
  );

  router.post(
    '/generate',
    asyncRoute(async (req, res) => {
      const { mode: rawMode, ai: rawAi, project, options, plan, targets, sources, shared } = req.body;
      const ai = keysStore.resolveAi(rawAi || {});
      const mode = getMode(rawMode);
      if (!plan?.files?.length || !targets?.length) throw new AIError('缺少規劃或目標檔案', 400);

      const opts = normalizeOptions(options, config);
      const prompt = builders[mode].generate({
        project: { name: project?.name || 'project' },
        opts,
        plan,
        targets,
        sources: takeWithinBudget(sources, gen.maxSourceCharsPerBatch),
        shared: takeWithinBudget(shared, gen.maxSharedCharsPerBatch),
      });

      const result = await callAI(ai, prompt, { config, signal: abortOnClose(res) });
      const wanted = new Set(targets.map((t) => sanitizePath(t.path)));
      const files = parseFileBlocks(result.text).filter((f) => wanted.has(f.path));
      const got = new Set(files.map((f) => f.path));

      res.json({
        files,
        missing: [...wanted].filter((p) => !got.has(p)),
        truncated: result.truncated,
      });
    })
  );

  router.post(
    '/zip',
    asyncRoute(async (req, res) => {
      const { name, files } = req.body;
      if (!Array.isArray(files) || !files.length) throw new AIError('沒有檔案可打包', 400);

      const root = sanitizePath(name || 'project').replace(/\//g, '-') || 'project';
      const zip = new JSZip();
      for (const f of files) {
        const path = sanitizePath(f.path);
        if (path) zip.file(`${root}/${path}`, f.content ?? '');
      }
      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      res.setHeader('content-type', 'application/zip');
      res.setHeader('content-disposition', `attachment; filename="${encodeURIComponent(root)}.zip"`);
      res.send(buffer);
    })
  );

  return router;
};
