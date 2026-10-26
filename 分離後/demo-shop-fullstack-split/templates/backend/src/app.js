/*
 * demo-shop-backend app bootstrap
 * - 註冊全域中介層：Helmet、CORS、Body Parser（保留 rawBody 供簽章）、稽核、簽章驗證、速率限制、路由與錯誤處理
 * - 依 config 啟用/關閉對應保護機制
 */

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const config = require('./config');

// 自有中介層（於 templates/backend/src/middlewares/ 下）
const corsMw = require('./middlewares/cors');       // 依白名單放行
const auditMw = require('./middlewares/audit');     // 稽核與敏感資訊遮罩
const signKeyMw = require('./middlewares/signKey'); // 簽章驗證（白名單豁免）
const errorMw = require('./middlewares/error');     // 統一錯誤處理

// 路由總管（於 templates/backend/src/routes/index.js）
const routes = require('./routes');

const app = express();

// 信任 Proxy（若部署於反向代理之後可啟用）
if (config.server.trustProxy) {
  app.set('trust proxy', config.server.trustProxy === true ? 1 : config.server.trustProxy);
}

// 安全標頭
app.use(
  helmet({
    contentSecurityPolicy: false, // 靜態前端與 API 分離場景常需自行設定 CSP，此處以 false 做為安全預設
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 產生 traceId 供稽核與錯誤追蹤
app.use((req, res, next) => {
  req.traceId = req.headers['x-trace-id'] || uuidv4();
  res.setHeader('X-Trace-Id', req.traceId);
  next();
});

// CORS（依白名單）
app.use(corsMw(config.cors));

// 體積限制與保留 rawBody（供 HMAC 簽章計算 bodySha256）
app.use(
  express.json({
    limit: config.http.jsonLimit,
    verify: (req, res, buf) => {
      req.rawBody = buf && buf.length ? buf.toString('utf8') : '';
    },
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: config.http.urlencodedLimit,
    verify: (req, res, buf) => {
      // 若以 x-www-form-urlencoded 傳送，仍保留原始內容供簽章
      const chunk = buf && buf.length ? buf.toString('utf8') : '';
      req.rawBody = (req.rawBody || '') + chunk;
    },
  })
);

// 開發用基本請求日誌（稽核會做更完整的記錄）
if (config.isDev) {
  app.use(morgan('dev'));
}

// 速率限制（可於 .env 切換）
if (config.security.rateLimit.enabled) {
  app.use(
    rateLimit({
      windowMs: config.security.rateLimit.windowMs,
      max: config.security.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later.' },
      },
    })
  );
}

// 健康檢查（不需簽章，用於監控）
app.get('/healthz', (req, res) => {
  res.json({ ok: true, env: config.env, time: Date.now() });
});

// 稽核日誌（可開關）
if (config.audit.enabled) {
  app.use(auditMw({ mask: config.security.mask, logLevel: config.logs.level }));
}

// 簽章驗證（可開關；signKey 中介層內部自行處理白名單）
if (config.signKey.enabled) {
  app.use(signKeyMw(config.signKey));
}

// 掛載 API 路由（採 version prefix）
app.use('/api/v1', routes);

// 404 處理（落網路由）
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
    traceId: config.security.error.includeTraceId ? req.traceId : undefined,
  });
});

// 統一錯誤處理
app.use(errorMw(config.security.error));

module.exports = app;