'use strict';

/*
 * 稽核日誌中介層
 * - 記錄請求/回應基本資訊、使用者與角色
 * - 遮罩敏感欄位（password、card、token、金鑰等）
 * - 於 response 結束時輸出單行 JSON 便於集中蒐集
 *
 * 使用方式（於 app.js）：
 *   app.use(auditMw({ mask: config.security.mask, logLevel: config.logs.level }));
 */

function auditMiddleware(options = {}) {
  const maskConf = options.mask || { keys: [], maskValue: (v) => v };
  const level = (options.logLevel || 'info').toLowerCase();

  // 建立快取集合以加速遮罩比對（不分大小寫）
  const sensitiveKeySet = new Set(
    (maskConf.keys || []).map((k) => String(k).toLowerCase())
  );

  return function audit(req, res, next) {
    const start = process.hrtime.bigint();
    const traceId = req.traceId;
    const method = req.method;
    const originalUrl = req.originalUrl || req.url || '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const signKeyId = req.headers['x-sign-keyid'] || null;

    // 使用者與角色（由 auth 中介層/控制器注入）
    const user = req.user || null;
    const userInfo = user
      ? {
          id: user.id ?? user.userId ?? null,
          role: user.role ?? user.roles ?? null,
        }
      : null;

    // 預先擷取與遮罩部分請求資訊
    const safeHeaders = maskObject(req.headers || {}, sensitiveKeySet, maskConf);
    const safeQuery = maskObject(req.query || {}, sensitiveKeySet, maskConf);

    // 僅在 debug 模式記錄 body；避免日誌暴增
    const bodyForLog =
      level === 'debug'
        ? truncate(maskObject(safeParseJson(req.rawBody) ?? req.body ?? {}, sensitiveKeySet, maskConf), 2048)
        : undefined;

    let logged = false;

    function logOnce(event) {
      if (logged) return;
      logged = true;

      const end = process.hrtime.bigint();
      const durMs = Number(end - start) / 1_000_000;

      const status = res.statusCode;
      const len = Number(res.getHeader('content-length') || 0) || undefined;

      const entry = {
        ts: new Date().toISOString(),
        traceId,
        event, // 'finish' | 'close'
        req: {
          method,
          url: originalUrl,
          ip,
          ua,
          headers: pickHeadersForLog(safeHeaders),
          query: Object.keys(safeQuery).length ? safeQuery : undefined,
          body: bodyForLog,
          signKeyId: signKeyId || undefined,
        },
        user: userInfo || undefined,
        res: {
          status,
          bytes: len,
          durationMs: Math.round(durMs),
        },
      };

      // 採單行 JSON 方便集中收斂
      console.log(`[AUDIT] ${JSON.stringify(entry)}`);
    }

    res.on('finish', () => logOnce('finish'));
    res.on('close', () => logOnce('close'));

    next();
  };

  function pickHeadersForLog(headers) {
    // 僅輸出與除錯最相關的標頭，並已經過遮罩
    const allow = [
      'host',
      'origin',
      'referer',
      'user-agent',
      'content-type',
      'x-trace-id',
      'x-sign-timestamp',
      'x-sign-nonce',
      'x-signature',
      'x-sign-keyid',
      'authorization', // 已遮罩
    ];
    const out = {};
    for (const k of allow) {
      if (headers[k] !== undefined) out[k] = headers[k];
    }
    return out;
  }

  function safeParseJson(text) {
    if (!text || typeof text !== 'string') return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function truncate(obj, maxLen) {
    try {
      const s = JSON.stringify(obj);
      if (s.length <= maxLen) return obj;
      // 若過長，改為精簡說明
      return { truncated: true, length: s.length, sample: s.slice(0, Math.min(512, maxLen)) + '...' };
    } catch {
      return obj;
    }
  }

  function maskObject(input, keySet, conf) {
    if (input == null) return input;
    if (Array.isArray(input)) {
      return input.map((v) => maskObject(v, keySet, conf));
    }
    if (typeof input === 'object') {
      const out = Array.isArray(input) ? [] : {};
      for (const [k, v] of Object.entries(input)) {
        const lower = String(k).toLowerCase();
        if (keySet.has(lower)) {
          out[k] = conf.maskValue(v, k);
        } else if (typeof v === 'object' && v !== null) {
          out[k] = maskObject(v, keySet, conf);
        } else {
          out[k] = v;
        }
      }
      return out;
    }
    return input;
  }
}

module.exports = auditMiddleware;