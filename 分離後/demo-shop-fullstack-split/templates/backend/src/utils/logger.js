/*
 * utils/logger.js
 * - 簡易分級日誌（error/warn/info/debug），支援 JSON 輸出與遮罩敏感資訊
 * - 與稽核串接：提供 audit(event, detail, ctx) 輸出，統一格式
 * - 預設從 config 讀取層級與遮罩鍵、是否暴露錯誤 stack
 */

const config = require('../config');
const masker = require('./masker');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function levelNum(level) {
  const l = String(level || '').toLowerCase();
  return LEVELS[l] != null ? LEVELS[l] : LEVELS.info;
}

function nowIso() {
  return new Date().toISOString();
}

function serializeError(err, { exposeStack = true } = {}) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: exposeStack ? err.stack : undefined,
    };
  }
  // 非 Error 物件亦嘗試序列化
  return typeof err === 'object' ? err : { message: String(err) };
}

function createLogger(opts = {}) {
  const state = {
    level: levelNum(opts.level || (config && config.logs && config.logs.level) || 'info'),
    maskKeys:
      (opts.maskKeys ||
        (config && config.security && config.security.mask && config.security.mask.keys) ||
        ['password', 'token', 'authorization']) // 保底
        .map((k) => String(k).toLowerCase()),
    exposeStack:
      opts.exposeStack !== undefined
        ? !!opts.exposeStack
        : !!(config && config.security && config.security.error && config.security.error.exposeStack),
    formatter: opts.formatter || jsonFormatter,
    context: opts.context || {}, // 全域附加欄位（例如服務名稱）
  };

  function jsonFormatter(record) {
    // 預設輸出 JSON line，利於收集與搜尋
    return JSON.stringify(record);
  }

  function baseRecord(level, msg, meta) {
    const masked = masker.maskDeep(meta || {}, { keys: state.maskKeys });
    return {
      ts: nowIso(),
      level,
      msg,
      ...state.context,
      ...masked,
    };
  }

  function write(level, msg, meta) {
    const rec = baseRecord(level, msg, meta);
    const line = state.formatter(rec);
    if (level === 'error') {
      // 使用 stderr
      console.error(line);
    } else {
      console.log(line);
    }
  }

  function error(msg, errOrMeta, metaExtra) {
    const isErr = errOrMeta instanceof Error;
    const errMeta = isErr ? { err: serializeError(errOrMeta, { exposeStack: state.exposeStack }) } : errOrMeta || {};
    const merged = { ...(errMeta || {}), ...(metaExtra || {}) };
    if (levelNum('error') <= state.level) write('error', msg, merged);
  }
  function warn(msg, meta) {
    if (levelNum('warn') <= state.level) write('warn', msg, meta);
  }
  function info(msg, meta) {
    if (levelNum('info') <= state.level) write('info', msg, meta);
  }
  function debug(msg, meta) {
    if (levelNum('debug') <= state.level) write('debug', msg, meta);
  }

  // 稽核輸出（統一格式）
  // event: 事件名稱（如 request.start / request.end / auth.login / order.checkout）
  // detail: 任意欄位（會被遮罩）
  // ctx: 額外上下文（如 traceId、userId、ip、path、method、status）
  function audit(event, detail = {}, ctx = {}) {
    const payload = {
      audit: true,
      event,
      ...detail,
      ...ctx,
    };
    // 稽核以 info 層級輸出
    info(`[AUDIT] ${event}`, payload);
  }

  // 子 logger（附加固定 context，例如模組名）
  function child(childContext = {}) {
    return createLogger({
      level: Object.keys(LEVELS).find((k) => LEVELS[k] === state.level) || 'info',
      maskKeys: state.maskKeys,
      exposeStack: state.exposeStack,
      formatter: state.formatter,
      context: { ...state.context, ...childContext },
    });
  }

  function setLevel(newLevel) {
    state.level = levelNum(newLevel);
  }

  return { error, warn, info, debug, audit, child, setLevel };
}

// 預設實例（包含服務名稱）
const defaultLogger = createLogger({
  context: { service: 'demo-shop-backend' },
});

module.exports = defaultLogger;
module.exports.createLogger = createLogger;