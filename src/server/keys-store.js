const fs = require('fs');
const path = require('path');
const { AIError } = require('./ai/errors');

const FILE = path.resolve(__dirname, '../../config.js');
const EXAMPLE = path.resolve(__dirname, '../../config.example.js');
const ALLOWED = new Set(['openai', 'anthropic']);

function ensureFile() {
  if (fs.existsSync(FILE)) return;
  const src = fs.existsSync(EXAMPLE) ? EXAMPLE : null;
  if (src) fs.copyFileSync(src, FILE);
  else {
    fs.writeFileSync(
      FILE,
      `'use strict';\nmodule.exports = { activeKeyId: '', keys: [] };\n`,
      'utf8'
    );
  }
}

function clearCache() {
  try {
    delete require.cache[require.resolve(FILE)];
  } catch {
    /* 尚未載入過 */
  }
}

function sanitizeKey(raw, index) {
  const provider = String(raw?.provider || '').trim();
  if (!ALLOWED.has(provider)) {
    throw new AIError(`第 ${index + 1} 組 Key 的供應商無效（僅支援 openai / anthropic）`, 400);
  }
  const apiKey = String(raw?.apiKey || '').trim();
  if (!apiKey) throw new AIError(`第 ${index + 1} 組 Key 尚未填寫 apiKey`, 400);
  const maxTokens = raw?.maxTokens == null || raw.maxTokens === '' ? null : Number(raw.maxTokens);
  return {
    id: String(raw?.id || `key-${index + 1}`).trim(),
    provider,
    name: String(raw?.name || `${provider} Key`).trim(),
    apiKey,
    model: String(raw?.model || '').trim(),
    baseUrl: String(raw?.baseUrl || '').trim(),
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : null,
  };
}

function normalize(raw) {
  const keys = Array.isArray(raw?.keys) ? raw.keys.map(sanitizeKey) : [];
  const ids = new Set(keys.map((k) => k.id));
  let activeKeyId = String(raw?.activeKeyId || '').trim();
  if (activeKeyId && !ids.has(activeKeyId)) activeKeyId = '';
  if (!activeKeyId && keys[0]) activeKeyId = keys[0].id;
  return { activeKeyId, keys };
}

function load() {
  ensureFile();
  clearCache();
  try {
    return normalize(require(FILE));
  } catch (err) {
    if (err instanceof AIError) throw err;
    throw new AIError(`無法讀取 config.js：${err.message}`, 500);
  }
}

function writeAtomic(content) {
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, FILE);
  } catch {
    fs.copyFileSync(tmp, FILE);
    fs.unlinkSync(tmp);
  }
}

function save(data) {
  const next = normalize(data);
  const body = JSON.stringify(next, null, 2);
  const content = `'use strict';

/**
 * AI API Key 設定（寫在這個檔，不要放瀏覽器 localStorage）
 * 也可在網頁「API Key 管理」新增／修改／刪除，儲存後會寫回這裡。
 */
module.exports = ${body};
`;
  writeAtomic(content);
  clearCache();
  return next;
}

function resolveAi(partial = {}) {
  if (partial?.apiKey && partial?.provider) {
    return {
      provider: String(partial.provider).trim(),
      apiKey: String(partial.apiKey).trim(),
      model: partial.model || undefined,
      baseUrl: partial.baseUrl || undefined,
      maxTokens: partial.maxTokens || undefined,
    };
  }
  const store = load();
  const id = String(partial?.keyId || store.activeKeyId || '').trim();
  const rec = store.keys.find((k) => k.id === id) || store.keys[0];
  if (!rec) throw new AIError('請先在 config.js 或網頁新增至少一組 API Key', 400);
  return {
    provider: rec.provider,
    apiKey: rec.apiKey,
    model: rec.model || undefined,
    baseUrl: rec.baseUrl || undefined,
    maxTokens: rec.maxTokens || undefined,
    name: rec.name,
    keyId: rec.id,
  };
}

module.exports = { load, save, resolveAi, FILE };
