const path = require('path');
const express = require('express');
const createApiRouter = require('./routes/api');

function createApp(config) {
  const app = express();

  app.use(express.json({ limit: config.server.bodyLimit }));
  app.use(express.static(path.resolve(__dirname, '../../public')));
  app.use('/api', createApiRouter(config));

  app.use((err, req, res, next) => {
    const status = err.status || 500;
    console.error(`[${req.method} ${req.path}]`, err.message);
    res.status(status).json({ error: err.message || '伺服器錯誤', detail: err.detail });
  });

  return app;
}

module.exports = { createApp };
