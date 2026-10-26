/*
 * 統一設定中心（依環境變數載入）
 * - 提供環境、模組開關、站台公開設定、CORS 白名單、JWT/SignKey/Mock/資料儲存等
 * - 所有敏感值一律由環境變數注入；預設值僅供開發示意
 */

const path = require('path');
const security = require('./security');

const env = (key, def) => (process.env[key] !== undefined ? process.env[key] : def);
const envBool = (key, def = false) => {
  const v = env(key, undefined);
  if (v === undefined) return def;
  return String(v).toLowerCase() === 'true';
};
const envNum = (key, def) => {
  const v = env(key, undefined);
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isNaN(n) ? def : n;
};
const envList = (key, def = []) => {
  const v = env(key, undefined);
  if (v === undefined || v === '') return def;
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

// 環境
const nodeEnv = env('NODE_ENV', 'development');
const isDev = nodeEnv === 'development';
const isProd = nodeEnv === 'production';

// 服務與 HTTP
const server = {
  port: envNum('PORT', 3000),
  trustProxy: envBool('TRUST_PROXY', false) ? true : false, // 可設 true 或數字；此處僅示意開關
};
const http = {
  jsonLimit: env('HTTP_JSON_LIMIT', '1mb'),
  urlencodedLimit: env('HTTP_URLENCODED_LIMIT', '1mb'),
};

// 日誌層級
const logs = {
  level: env('LOG_LEVEL', 'info'),
};

// CORS 白名單
const cors = {
  whitelist: envList('CORS_WHITELIST', isDev ? ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'] : []),
};

// JWT 與權限
const jwt = {
  secret: env('JWT_SECRET', ''),
  expiresIn: env('JWT_EXPIRES_IN', '1d'),
};

// Admin 萬用密碼（開發/測試用）
const admin = {
  masterPassword: env('ADMIN_MASTER_PASSWORD', ''),
};

// 簽章 SignKey（前後端 HMAC-SHA256）
const signKey = {
  enabled: envBool('SIGNKEY_ENABLED', true),
  algo: env('SIGNKEY_ALGO', 'HMAC-SHA256'),
  windowMs: envNum('SIGNKEY_WINDOW_MS', 5 * 60 * 1000), // 預設 5 分鐘
  clockSkewMs: envNum('SIGNKEY_CLOCK_SKEW_MS', 10 * 1000),
  nonceTtlMs: envNum('NONCE_TTL_MS', 10 * 60 * 1000),
  sessionTtlMs: envNum('SIGNKEY_SESSION_TTL_MS', 60 * 60 * 1000),
  headers: {
    timestamp: env('SIGNKEY_HEADER_TIMESTAMP', 'X-Sign-Timestamp'),
    nonce: env('SIGNKEY_HEADER_NONCE', 'X-Sign-Nonce'),
    signature: env('SIGNKEY_HEADER_SIGNATURE', 'X-Signature'),
    keyId: env('SIGNKEY_HEADER_KEYID', 'X-Sign-KeyId'),
  },
  whitelistPaths: envList('SIGNKEY_WHITELIST_PATHS', [
    '/api/v1/public/settings',
    '/api/v1/auth/login',
    '/api/v1/auth/register',
  ]),
};

// 稽核開關
const audit = {
  enabled: envBool('AUDIT_ENABLED', true),
};

// Mock 與外部服務開關
const mocks = {
  paymentEnabled: envBool('MOCK_PAYMENT_ENABLED', true),
  smsEnabled: envBool('MOCK_SMS_ENABLED', true),
};

// 站台公開設定（回傳於 /api/v1/public/settings；不含機敏）
const publicSettings = {
  siteName: env('SITE_NAME', '海螺小舖'),
  currency: env('CURRENCY', 'TWD'),
  taxRate: Number(env('TAX_RATE', 0.05)),
  freeShippingThreshold: Number(env('FREE_SHIPPING_THRESHOLD', 1500)),
  shippingFee: Number(env('SHIPPING_FEE', 80)),
  vipDiscount: Number(env('VIP_DISCOUNT', 0.9)),
};

// 資料儲存
const data = {
  store: env('DATA_STORE', 'file'), // file | memory
  dir: path.resolve(process.cwd(), env('DATA_DIR', './data')),
  seedOnStart: envBool('SEED_ON_START', isDev),
  allowDevReset: envBool('ALLOW_DEV_RESET', isDev),
};

// 匯出
const csv = {
  withBOM: envBool('CSV_WITH_BOM', true),
};

// 第三方金鑰（僅後端使用）
const secrets = {
  paymentKey: env('PAYMENT_SECRET_KEY', ''),
  smsApiKey: env('SMS_API_KEY', ''),
};

module.exports = {
  // 環境
  env: nodeEnv,
  isDev,
  isProd,

  // 服務
  server,
  http,
  logs,

  // 安全與 CORS
  cors,
  jwt,
  signKey,
  audit,
  security, // 詳細安全設定（遮罩、錯誤細節、速率限制）

  // Mock/資料/匯出
  mocks,
  data,
  csv,

  // 站台設定與機敏
  publicSettings,
  admin,
  secrets,

  // 工具函式（供其他模組使用）
  _env: { env, envBool, envNum, envList },
};