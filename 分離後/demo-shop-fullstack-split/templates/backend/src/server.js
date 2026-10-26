/*
 * demo-shop-backend server entry
 * - 載入環境變數
 * - 建立與啟動 HTTP 伺服器
 * - 設定優雅關閉與錯誤處理
 */

require('dotenv').config();
const http = require('http');

// 注意：src/app.js 需輸出一個 Express app 實例
const app = require('./app');

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = normalizePort(process.env.PORT || 3000);

const server = http.createServer(app);

server.listen(PORT, () => {
  banner();
  console.log(`[demo-shop-backend] 🚀 啟動成功`);
  console.log(`- Environment: ${NODE_ENV}`);
  console.log(`- Listening:   http://localhost:${PORT}`);
  console.log(`- SignKey:     enabled=${envBool(process.env.SIGNKEY_ENABLED, true)} windowMs=${process.env.SIGNKEY_WINDOW_MS || 300000}`);
  console.log(`- Audit:       enabled=${envBool(process.env.AUDIT_ENABLED, true)}`);
  if (!process.env.JWT_SECRET) {
    console.warn('[警告] 尚未設定 JWT_SECRET，請編輯 backend/.env（可由 .env.example 複製）');
  }
});

server.on('error', onError);
server.on('listening', () => { /* no-op */ });

// 系統層級錯誤攔截
process.on('unhandledRejection', (reason, p) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // 依情況決定是否直接結束；此處保守做法為結束以避免未知狀態
  shutdown('uncaughtException', 1);
});

// 優雅關閉
['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => shutdown(sig));
});

function shutdown(signal, code = 0) {
  console.log(`\n[demo-shop-backend] 收到 ${signal}，準備關閉伺服器...`);
  server.close(() => {
    console.log('[demo-shop-backend] 連線已關閉，安全退出。');
    process.exit(code);
  });
  // 最長等待 5 秒後強制退出
  setTimeout(() => {
    console.warn('[demo-shop-backend] 關閉逾時，強制退出。');
    process.exit(code || 1);
  }, 5000).unref();
}

function onError(error) {
  if (error.syscall !== 'listen') throw error;
  const bind = typeof PORT === 'string' ? `Pipe ${PORT}` : `Port ${PORT}`;
  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} 權限不足，請使用可用的埠或提升權限`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} 已被佔用，請更換 PORT 或關閉佔用的程序`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function normalizePort(val) {
  const port = parseInt(val, 10);
  if (Number.isNaN(port)) return val; // named pipe
  if (port >= 0) return port;
  return 3000;
}

function envBool(v, def = false) {
  if (v === undefined) return def;
  return String(v).toLowerCase() === 'true';
}

function banner() {
  console.log('========================================');
  console.log(' demo-shop-backend (Express API)');
  console.log(' 前後端分離模板：demo-shop-fullstack-split');
  console.log('========================================');
}