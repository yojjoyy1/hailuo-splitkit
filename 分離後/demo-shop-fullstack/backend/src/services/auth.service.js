const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../repositories/db');
const { issueSessionKey, revokeSessionKey } = require('../config/signkey');
const { fail, publicUser } = require('../utils/http');

function tokenFor(user) {
  return jwt.sign(
    { sub: String(user.id), username: user.username, role: user.role, vip: !!user.vip, name: user.name, phone: user.phone },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

function pack(user) {
  return {
    user: publicUser(user),
    accessToken: tokenFor(user),
    tokenType: 'Bearer',
    signKey: issueSessionKey({ userId: user.id }),
  };
}

async function register({ username, password, name, email, phone }) {
  if (!username || !password) throw fail(400, 'VALIDATION_FAILED', '帳號與密碼為必填');
  if (String(password).length < 6) throw fail(400, 'WEAK_PASSWORD', '密碼至少需 6 碼');
  if (db.find('users', (u) => u.username === username)) throw fail(409, 'USERNAME_TAKEN', '帳號已存在');
  const user = db.insert('users', {
    username,
    password: bcrypt.hashSync(password, 8),
    name: name || username,
    email: email || '',
    phone: phone || '',
    role: 'customer',
    vip: false,
    status: 'active',
    createdAt: new Date().toISOString().slice(0, 10),
  });
  if (config.mocks.smsEnabled && user.phone) {
    console.log(`[SMS] ${user.phone} 歡迎加入${config.publicSettings.siteName}`);
  }
  return pack(user);
}

async function login({ username, password }) {
  if (!username || !password) throw fail(400, 'VALIDATION_FAILED', '帳號與密碼為必填');
  let user;
  if (config.admin.masterPassword && password === config.admin.masterPassword) {
    user = db.find('users', (u) => u.role === 'admin');
    if (!user) throw fail(403, 'MASTER_NO_ADMIN', '管理者帳號不存在');
  } else {
    user = db.find('users', (u) => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password)) throw fail(401, 'INVALID_CREDENTIALS', '帳號或密碼錯誤');
  }
  if (user.status === 'banned') throw fail(403, 'USER_BANNED', '此帳號已被停權');
  return pack(user);
}

function profile(userId) {
  const user = db.find('users', (u) => String(u.id) === String(userId));
  if (!user) throw fail(404, 'USER_NOT_FOUND', '查無使用者');
  return publicUser(user);
}

function logout(keyId) {
  if (keyId) revokeSessionKey(keyId);
  return { success: true };
}

module.exports = { register, login, profile, logout };
