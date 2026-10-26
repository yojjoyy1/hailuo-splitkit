/*
 * 前後端 HMAC 簽章驗證中介層（SignKey）
 *
 * 規格：
 * - Signature = HMAC-SHA256(secret, `${timestamp}|${nonce}|${method}|${path}|${bodySha256}`)
 * - Header 名稱可於環境變數調整（預設：X-Sign-Timestamp、X-Sign-Nonce、X-Signature、X-Sign-KeyId）
 * - 驗證項目：
 *   1) 白名單路由直接放行（如 /api/v1/public/settings、/api/v1/auth/login、/api/v1/auth/register）
 *   2) 檢查 Header 是否齊全
 *   3) 檢查 timestamp 是否在允許時間窗內（考慮 clock skew）
 *   4) 以 keyId 取得 session signKey（有效期內）
 *   5) 計算 canonical string 與 HMAC 比對
 *   6) Nonce 防重放（同 keyId 範圍內不得重複）
 *
 * 注意：
 * - 預設放行 OPTIONS 與 /healthz
 * - 若需關閉整體簽章，請於 config 中將 SIGNKEY_ENABLED=false（app.js 會略過註冊此中介層）
 */

const sk = require('../config/signkey');

function createSignKeyMiddleware(signKeyConfigFromApp) {
  // 允許從 app.js 傳入 headers/whitelist 等設定；若未提供則以 config/signkey.js 為準
  const headers = (signKeyConfigFromApp && signKeyConfigFromApp.headers) || sk.headers;
  const whitelistPaths = (signKeyConfigFromApp && signKeyConfigFromApp.whitelistPaths) || sk.whitelistPaths;
  const windowMs = (signKeyConfigFromApp && signKeyConfigFromApp.windowMs) || sk.windowMs;
  const clockSkewMs = (signKeyConfigFromApp && signKeyConfigFromApp.clockSkewMs) || sk.clockSkewMs;

  const H_TS = String(headers.timestamp || 'X-Sign-Timestamp').toLowerCase();
  const H_NONCE = String(headers.nonce || 'X-Sign-Nonce').toLowerCase();
  const H_SIG = String(headers.signature || 'X-Signature').toLowerCase();
  const H_KEYID = String(headers.keyId || 'X-Sign-KeyId').toLowerCase();

  const whitelist = new Set(
    (Array.isArray(whitelistPaths) ? whitelistPaths : String(whitelistPaths || '').split(','))
      .map((p) => String(p || '').trim())
      .filter(Boolean)
  );

  return function signKeyMiddleware(req, res, next) {
    // 放行預檢與健康檢查
    if (req.method === 'OPTIONS' || req.path === '/healthz') return next();

    // 白名單（忽略 query 比對）
    const pathOnly = (req.originalUrl || req.path || '').split('?')[0];
    if (whitelist.has(pathOnly)) return next();

    // Header 取得
    const ts = req.headers[H_TS];
    const nonce = req.headers[H_NONCE];
    const signature = req.headers[H_SIG];
    const keyId = req.headers[H_KEYID];

    if (!ts || !nonce || !signature || !keyId) {
      return res.status(401).json({
        success: false,
        error: { code: 'SIGNATURE_REQUIRED', message: 'Missing signature headers' },
        traceId: req.traceId,
      });
    }

    // 時間窗檢核（允許時鐘偏移）
    const now = Date.now();
    const tsNum = parseInt(String(ts), 10);
    if (Number.isNaN(tsNum)) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TIMESTAMP', message: 'Invalid signature timestamp' },
        traceId: req.traceId,
      });
    }
    const earliest = now - windowMs - clockSkewMs;
    const latest = now + clockSkewMs;
    if (tsNum < earliest || tsNum > latest) {
      return res.status(401).json({
        success: false,
        error: { code: 'SIGNATURE_EXPIRED', message: 'Signature timestamp out of acceptable window' },
        traceId: req.traceId,
      });
    }

    // Session signKey 取得
    const keyRecord = sk.getSessionKey(keyId);
    if (!keyRecord || !keyRecord.secret) {
      return res.status(401).json({
        success: false,
        error: { code: 'KEY_NOT_FOUND', message: 'Invalid or expired sign key' },
        traceId: req.traceId,
      });
    }

    // 重放保護（同 keyId 範圍）
    const nonceKey = `${keyId}:${nonce}`;
    if (sk.nonceStore.has(nonceKey)) {
      return res.status(409).json({
        success: false,
        error: { code: 'REPLAY_DETECTED', message: 'Nonce has been used' },
        traceId: req.traceId,
      });
    }

    // 計算 canonical string 與 HMAC
    const pathWithQuery = sk.pickPath(req);
    const bodyHex = sk.bodySha256(req.rawBody || '');
    const canonical = sk.getCanonicalString({
      timestamp: tsNum,
      nonce,
      method: req.method,
      path: pathWithQuery,
      bodySha256Hex: bodyHex,
    });
    const expected = sk.hmacHex(keyRecord.secret, canonical);

    if (!sk.safeEqual(expected, String(signature))) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Signature mismatch' },
        traceId: req.traceId,
      });
    }

    // 通過驗證後紀錄 nonce（消耗）
    sk.nonceStore.use(nonceKey);

    // 可選：將已驗證資訊掛載供後續使用
    req.signKey = {
      keyId: keyRecord.keyId,
      userId: keyRecord.userId || null,
      verifiedAt: now,
      expiresAt: keyRecord.expiresAt,
    };

    return next();
  };
}

module.exports = createSignKeyMiddleware;