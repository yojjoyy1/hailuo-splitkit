'use strict';

/*
 * CORS 中介層（依白名單載入）
 * - 以環境設定的白名單判斷是否允許跨域
 * - 預設允許帶憑證（credentials: true）
 * - 允許簽章相關自訂標頭（X-Sign-*）與 X-Trace-Id
 */

const cors = require('cors');

function corsMiddleware(corsConfig = {}) {
  const whitelist = Array.isArray(corsConfig.whitelist) ? corsConfig.whitelist : [];
  const allowAll = whitelist.includes('*');

  const options = {
    origin: function (origin, callback) {
      // 無 Origin（如同源請求、curl、健康檢查）直接允許
      if (!origin) return callback(null, true);

      if (allowAll) {
        // 反射 Origin（避免與 credentials 衝突）
        return callback(null, true);
      }

      const ok = whitelist.some((o) => equalsOrigin(o, origin));
      if (ok) return callback(null, true);

      // 不允許的來源
      const err = new Error(`Not allowed by CORS: ${origin}`);
      return callback(err);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Trace-Id',
      'X-Sign-Timestamp',
      'X-Sign-Nonce',
      'X-Signature',
      'X-Sign-KeyId',
    ],
    exposedHeaders: ['X-Trace-Id'],
    credentials: true,
    optionsSuccessStatus: 204,
    preflightContinue: false,
  };

  return cors(options);
}

function equalsOrigin(a, b) {
  // 簡易比對：忽略結尾斜線與大小寫
  if (!a || !b) return false;
  const na = String(a).replace(/\/+$/, '').toLowerCase();
  const nb = String(b).replace(/\/+$/, '').toLowerCase();
  return na === nb;
}

module.exports = corsMiddleware;