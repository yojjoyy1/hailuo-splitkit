const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const env = (key, def) => (process.env[key] !== undefined ? process.env[key] : def);
const envBool = (key, def = false) => {
  const v = env(key, undefined);
  if (v === undefined) return def;
  return String(v).toLowerCase() === 'true';
};
const envNum = (key, def) => {
  const n = Number(env(key, def));
  return Number.isNaN(n) ? def : n;
};
const envList = (key, def = []) => {
  const v = env(key, undefined);
  if (v === undefined || v === '') return def;
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
};

const nodeEnv = env('NODE_ENV', 'development');

module.exports = {
  env: nodeEnv,
  isDev: nodeEnv === 'development',
  server: { port: envNum('PORT', 3000), host: env('HOST', '127.0.0.1') },
  jwt: { secret: env('JWT_SECRET', 'dev-jwt-secret-change-me'), expiresIn: env('JWT_EXPIRES_IN', '1d') },
  admin: { masterPassword: env('ADMIN_MASTER_PASSWORD', 'admin888') },
  signKey: {
    enabled: envBool('SIGNKEY_ENABLED', true),
    windowMs: envNum('SIGNKEY_WINDOW_MS', 300000),
    clockSkewMs: envNum('SIGNKEY_CLOCK_SKEW_MS', 10000),
    nonceTtlMs: envNum('NONCE_TTL_MS', 600000),
    sessionTtlMs: envNum('SIGNKEY_SESSION_TTL_MS', 3600000),
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
      '/api/v1/products',
      '/api/v1/pricing/quote',
    ]),
  },
  cors: {
    whitelist: envList('CORS_WHITELIST', [
      'http://localhost:3000', 'http://127.0.0.1:3000',
      'http://localhost:3456', 'http://127.0.0.1:3456',
      'http://localhost:5173', 'http://127.0.0.1:5173',
      'http://localhost:5500', 'http://127.0.0.1:5500',
      'http://localhost:8080', 'http://127.0.0.1:8080',
    ]),
  },
  audit: { enabled: envBool('AUDIT_ENABLED', true) },
  mocks: {
    paymentEnabled: envBool('MOCK_PAYMENT_ENABLED', true),
    smsEnabled: envBool('MOCK_SMS_ENABLED', true),
  },
  publicSettings: {
    siteName: env('SITE_NAME', '海螺小舖'),
    currency: env('CURRENCY', 'TWD'),
    taxRate: Number(env('TAX_RATE', 0.05)),
    freeShippingThreshold: Number(env('FREE_SHIPPING_THRESHOLD', 1500)),
    shippingFee: Number(env('SHIPPING_FEE', 80)),
    vipDiscount: Number(env('VIP_DISCOUNT', 0.9)),
  },
  data: { allowDevReset: envBool('ALLOW_DEV_RESET', nodeEnv === 'development') },
  secrets: {
    paymentKey: env('PAYMENT_SECRET_KEY', 'change-me-payment'),
    smsApiKey: env('SMS_API_KEY', 'change-me-sms'),
  },
  error: { exposeStack: envBool('ERROR_EXPOSE_STACK', nodeEnv === 'development') },
};
