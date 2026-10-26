const config = require('./src/server/config');
const { createApp } = require('./src/server/app');

const app = createApp(config);
const { host, port } = config.server;

const server = app.listen(port, host, () => {
  console.log(`Hailuo SplitKit 已啟動：http://${host}:${port}  (env: ${config.env})`);
});

// AI 產生檔案可能需要數分鐘，關閉 Node 預設的請求逾時
server.requestTimeout = 0;
server.timeout = 0;
