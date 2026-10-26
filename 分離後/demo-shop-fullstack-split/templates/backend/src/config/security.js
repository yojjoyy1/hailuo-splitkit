/*
 * 資安設定
 * - 遮罩欄位清單（稽核與錯誤輸出時使用）
 * - 錯誤回應細節開關
 * - 速率限制參數
 */

const env = (k, d) => (process.env[k] !== undefined ? process.env[k] : d);
const envBool = (k, d = false) => {
  const v = env(k, undefined);
  if (v === undefined) return d;
  return String(v).toLowerCase() === 'true';
};
const envNum = (k, d) => {
  const v = env(k, undefined);
  if (v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isNaN(n) ? d : n;
};

const nodeEnv = env('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';

// 稽核與日誌遮罩設定
const mask = {
  // 鍵名比對（不分大小寫）
  keys: [
    'password',
    'newPassword',
    'oldPassword',
    'card',
    'cardNo',
    'cvv',
    'Authorization',
    'authorization',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'smsApiKey',
    'PAYMENT_SECRET_KEY',
    'SMS_API_KEY',
    'signKey',
    'signature',
    'X-Signature',
    'X-Sign-KeyId',
  ],
  // 簡易遮罩函式：保留前後少量字元，其他以 *
  maskValue: (value, key) => {
    if (value == null) return value;
    const s = String(value);
    if (!s) return s;
    // Email 與電話做特殊遮罩
    if (/\S+@\S+\.\S+/.test(s)) {
      const [name, domain] = s.split('@');
      return `${name.slice(0, 1)}***@${domain}`;
    }
    if (/^\+?\d{7,}$/.test(s)) {
      return `${s.slice(0, 3)}****${s.slice(-2)}`;
    }
    // 一般字串遮罩
    if (s.length <= 6) return '*'.repeat(Math.max(3, s.length));
    return `${s.slice(0, 3)}***${s.slice(-2)}`;
  },
};

// 統一錯誤處理回應細節
const error = {
  exposeStack: envBool('ERROR_EXPOSE_STACK', !isProd), // 於 production 預設關閉
  includeTraceId: true,
  defaultMessage: 'Internal Server Error',
};

// 速率限制（可於 .env 開關與調整）
const rateLimit = {
  enabled: envBool('RATE_LIMIT_ENABLED', false),
  windowMs: envNum('RATE_LIMIT_WINDOW_MS', 60 * 1000),
  max: envNum('RATE_LIMIT_MAX', 100),
};

module.exports = {
  mask,
  error,
  rateLimit,
};