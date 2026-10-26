'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync, exec } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const CONFIG = path.join(ROOT, 'config.js');
const EXAMPLE = path.join(ROOT, 'config.example.js');

function fail(message) {
  console.error(`\n[錯誤] ${message}\n`);
  process.exit(1);
}

function checkNode() {
  const parts = process.versions.node.split('.').map(Number);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  if (major < 18 || (major === 18 && minor < 17)) {
    fail(`需要 Node.js 18.17 以上，目前是 ${process.versions.node}\n請到 https://nodejs.org 安裝。`);
  }
}

function ensureConfig() {
  if (fs.existsSync(CONFIG)) return;
  if (fs.existsSync(EXAMPLE)) fs.copyFileSync(EXAMPLE, CONFIG);
}

function ensureDeps() {
  const marker = path.join(ROOT, 'node_modules', 'express');
  if (fs.existsSync(marker)) return;
  console.log('第一次啟動，正在安裝依賴（npm install）…');
  const npm = isWin ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['install'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  });
  if (result.status !== 0) fail('npm install 失敗，請確認網路與 Node.js 安裝是否完整。');
}

function readPort() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'default.json'), 'utf8'));
    const envPort = process.env.PORT ? Number(process.env.PORT) : 0;
    return envPort || Number(raw?.server?.port) || 3000;
  } catch {
    return 3000;
  }
}

function waitForHttp(url, timeoutMs = 40000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error('伺服器啟動逾時'));
        else setTimeout(ping, 250);
      });
    };
    ping();
  });
}

function openBrowser(url) {
  let cmd;
  if (isWin) cmd = `start "" "${url}"`;
  else if (process.platform === 'darwin') cmd = `open "${url}"`;
  else cmd = `xdg-open "${url}"`;
  exec(cmd, { windowsHide: true }, () => {});
}

async function main() {
  process.chdir(ROOT);
  checkNode();
  ensureConfig();
  ensureDeps();

  const port = readPort();
  const url = `http://127.0.0.1:${port}`;
  console.log(`正在啟動 Hailuo SplitKit…`);
  console.log(`專案目錄：${ROOT}`);

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    windowsHide: false,
  });

  child.on('exit', (code) => process.exit(code == null ? 0 : code));
  child.on('error', (err) => fail(`無法啟動 server.js：${err.message}`));

  try {
    await waitForHttp(`${url}/api/config`);
    console.log(`瀏覽器開啟：${url}`);
    openBrowser(url);
  } catch (err) {
    fail(err.message);
  }
}

main();
