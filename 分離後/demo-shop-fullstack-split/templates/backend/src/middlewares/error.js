'use strict';

/*
 * 統一錯誤處理中介層
 * - 以標準 JSON 格式回應錯誤
 * - 隱藏 stack（可由設定 exposeStack 控管）
 * - 在回應中可選擇加入 traceId（供前後端對照）
 * - 根據 err.status / err.statusCode 決定 HTTP 狀態
 */

function errorMiddleware(options = {}) {
  const {
    exposeStack = false,
    includeTraceId = true,
    defaultMessage = 'Internal Server Error',
  } = options;

  return function errorHandler(err, req, res, next) {
    try {
      // 若已送出回應則交由 Express 預設
      if (res.headersSent) return next(err);

      const status =
        err.status ||
        err.statusCode ||
        (err.name === 'UnauthorizedError' ? 401 : 0) ||
        500;

      const code =
        err.code ||
        (status === 400
          ? 'BAD_REQUEST'
          : status === 401
          ? 'UNAUTHORIZED'
          : status === 403
          ? 'FORBIDDEN'
          : status === 404
          ? 'NOT_FOUND'
          : status === 429
          ? 'RATE_LIMIT'
          : 'INTERNAL_ERROR');

      // 僅對 4xx 類型錯誤回傳原訊息；5xx 一律使用預設訊息避免外洩
      const safeMessage =
        status >= 500
          ? defaultMessage
          : err.publicMessage || err.message || defaultMessage;

      const payload = {
        success: false,
        error: {
          code,
          message: safeMessage,
        },
      };

      // 開發/除錯用途：是否暴露 stack 或錯誤細節
      if (exposeStack && err.stack) {
        payload.error.stack = String(err.stack);
      }
      if (Array.isArray(err.details) && err.details.length) {
        // 供驗證錯誤等情境使用，但避免包含敏感字串
        payload.error.details = sanitizeDetails(err.details);
      }

      if (includeTraceId && req && req.traceId) {
        payload.traceId = req.traceId;
      }

      // 於伺服器端記錄錯誤（不將 stack 暴露給前端）
      logServerError(err, {
        traceId: req && req.traceId,
        method: req && req.method,
        url: req && (req.originalUrl || req.url),
        status,
        code,
      });

      res.status(status).json(payload);
    } catch (fatal) {
      // 發生於錯誤處理器內的例外，回傳最小錯誤
      try {
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: defaultMessage },
          traceId: includeTraceId && req && req.traceId ? req.traceId : undefined,
        });
      } catch (_) {
        // 無法回應則放棄
      }
    }
  };
}

function sanitizeDetails(details) {
  try {
    // 僅保留可序列化的基礎欄位，避免洩漏敏感資料
    return details.map((d) => {
      if (!d || typeof d !== 'object') return d;
      const out = {};
      for (const k of Object.keys(d)) {
        if (['message', 'field', 'path', 'type'].includes(k)) {
          out[k] = d[k];
        }
      }
      return out;
    });
  } catch {
    return [];
  }
}

function logServerError(err, meta = {}) {
  const base = `[ERROR] ${meta.code || 'INTERNAL_ERROR'} ${meta.status || 500}`;
  const where = `${meta.method || ''} ${meta.url || ''}`.trim();
  const trace = meta.traceId ? ` traceId=${meta.traceId}` : '';
  // 於伺服器端輸出完整堆疊，便於除錯（不回傳給客戶端）
  if (err && err.stack) {
    console.error(`${base} ${where}${trace}\n${err.stack}`);
  } else {
    console.error(`${base} ${where}${trace} ${err ? String(err) : ''}`);
  }
}

module.exports = errorMiddleware;