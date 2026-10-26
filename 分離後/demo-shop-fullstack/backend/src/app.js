const express = require('express');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const corsMw = require('./middlewares/cors');
const auditMw = require('./middlewares/audit');
const signKeyMw = require('./middlewares/signKey');
const errorMw = require('./middlewares/error');
const routes = require('./routes');

const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use((req, res, next) => {
  req.traceId = req.headers['x-trace-id'] || uuidv4();
  res.setHeader('X-Trace-Id', req.traceId);
  next();
});
app.use(corsMw());
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => { req.rawBody = buf ? buf.toString('utf8') : ''; },
}));

app.get('/healthz', (req, res) => res.json({ ok: true, env: config.env, time: Date.now() }));
if (config.audit.enabled) app.use(auditMw);
if (config.signKey.enabled) app.use(signKeyMw());
app.use('/api/v1', routes);

app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到路由' }, traceId: req.traceId });
});
app.use(errorMw);

module.exports = app;
