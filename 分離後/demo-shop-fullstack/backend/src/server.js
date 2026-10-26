require('dotenv').config();
const config = require('./config');
const app = require('./app');

const server = app.listen(config.server.port, config.server.host, () => {
  console.log(`海螺小舖 API 已啟動：http://${config.server.host}:${config.server.port}`);
  console.log(`環境=${config.env} 簽章=${config.signKey.enabled} 稽核=${config.audit.enabled}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
