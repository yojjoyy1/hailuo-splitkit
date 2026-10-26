/*
 * User Service
 * - 會員列表（隱碼處理）
 * - VIP 切換/設定
 * - 停權/復權
 * - 刪除會員
 * - 內含角色檢查與審計記錄
 *
 * RBAC 規則（可依需求微調）：
 * - list：staff、admin 可用（輸出已隱碼）
 * - setVip/toggleVip：僅 admin
 * - setStatus（ban/unban）：僅 admin
 * - remove（刪除會員）：僅 admin；不可刪除自己
 */

const db = require('../repositories/db');
const config = require('../config');
const logger = require('../utils/logger');

const { mask } = config.security;

// 小工具：建立應用錯誤（配合統一錯誤處理）
function appError(status, code, message, details) {
  const err = new Error(message || code || 'ERROR');
  err.status = status || 400;
  err.code = code || 'BAD_REQUEST';
  if (details) err.details = details;
  return err;
}

// 角色檢查
function assertRole(user, allowedRoles = []) {
  if (!user) throw appError(401, 'UNAUTHORIZED', 'Unauthorized');
  if (!allowedRoles.includes(user.role)) {
    throw appError(403, 'FORBIDDEN', 'Insufficient role permission');
  }
}

// 實用遮罩：email/phone 基礎隱碼（輸出用；審計遮罩由 audit middleware 處理）
function maskEmail(email) {
  if (!email) return email;
  const [name, domain] = String(email).split('@');
  if (!domain) return mask.maskValue(email, 'email');
  return `${name.slice(0, 1)}***@${domain}`;
}
function maskPhone(phone) {
  if (!phone) return phone;
  const s = String(phone).replace(/[^\d+]/g, '');
  if (s.length <= 4) return '****';
  return `${s.slice(0, 3)}****${s.slice(-2)}`;
}
function sanitizeUserForList(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: maskEmail(u.email),
    phone: maskPhone(u.phone),
    role: u.role,
    vip: !!u.vip,
    status: u.status || 'active',
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/*
 * 會員列表（後台）
 * - staff/admin 可用
 * - 統一隱碼輸出
 */
async function listUsers({ requester, query } = {}) {
  assertRole(requester, ['staff', 'admin']);

  const all = await db.all('users'); // 預期 repositories/db.js 提供 all(tableName) 取得陣列
  // 可選：依 query 過濾
  let rows = all;
  if (query && query.keyword) {
    const kw = String(query.keyword).toLowerCase();
    rows = rows.filter(
      (u) =>
        String(u.username).toLowerCase().includes(kw) ||
        String(u.name || '').toLowerCase().includes(kw) ||
        String(u.email || '').toLowerCase().includes(kw) ||
        String(u.phone || '').toLowerCase().includes(kw)
    );
  }
  // 排序（預設依 id 倒序）
  rows = rows.sort((a, b) => (b.id || 0) - (a.id || 0));

  const result = rows.map(sanitizeUserForList);

  // 審計
  logger.info('ADMIN_LIST_USERS', {
    actorId: requester.id,
    actorRole: requester.role,
    count: result.length,
  });

  return result;
}

/*
 * 設定 VIP（true/false）
 * - 僅 admin
 */
async function setVip({ requester, userId, vip }) {
  assertRole(requester, ['admin']);

  const id = Number(userId);
  if (!id || Number.isNaN(id)) throw appError(400, 'VALIDATION_ERROR', 'Invalid user id');

  const user = await db.findById('users', id);
  if (!user) throw appError(404, 'USER_NOT_FOUND', 'User not found');

  const updated = await db.update('users', id, { vip: !!vip, updatedAt: new Date().toISOString() });

  logger.info('ADMIN_SET_USER_VIP', {
    actorId: requester.id,
    targetId: id,
    vip: !!vip,
  });

  return sanitizeUserForList(updated);
}

/*
 * 切換 VIP（toggle）
 * - 僅 admin
 */
async function toggleVip({ requester, userId }) {
  assertRole(requester, ['admin']);

  const id = Number(userId);
  if (!id || Number.isNaN(id)) throw appError(400, 'VALIDATION_ERROR', 'Invalid user id');

  const user = await db.findById('users', id);
  if (!user) throw appError(404, 'USER_NOT_FOUND', 'User not found');

  const updated = await db.update('users', id, { vip: !user.vip, updatedAt: new Date().toISOString() });

  logger.info('ADMIN_TOGGLE_USER_VIP', {
    actorId: requester.id,
    targetId: id,
    vip: !!updated.vip,
  });

  return sanitizeUserForList(updated);
}

/*
 * 設定使用者狀態（active/banned）
 * - 僅 admin
 */
async function setStatus({ requester, userId, status }) {
  assertRole(requester, ['admin']);

  const id = Number(userId);
  if (!id || Number.isNaN(id)) throw appError(400, 'VALIDATION_ERROR', 'Invalid user id');
  const next = String(status || '').toLowerCase();
  if (!['active', 'banned'].includes(next)) throw appError(400, 'VALIDATION_ERROR', 'Invalid status');

  const user = await db.findById('users', id);
  if (!user) throw appError(404, 'USER_NOT_FOUND', 'User not found');

  const updated = await db.update('users', id, { status: next, updatedAt: new Date().toISOString() });

  logger.info('ADMIN_SET_USER_STATUS', {
    actorId: requester.id,
    targetId: id,
    status: next,
  });

  return sanitizeUserForList(updated);
}

/*
 * 停權/復權（toggle）
 * - 僅 admin
 */
async function toggleBan({ requester, userId }) {
  assertRole(requester, ['admin']);

  const id = Number(userId);
  if (!id || Number.isNaN(id)) throw appError(400, 'VALIDATION_ERROR', 'Invalid user id');

  const user = await db.findById('users', id);
  if (!user) throw appError(404, 'USER_NOT_FOUND', 'User not found');

  const next = user.status === 'banned' ? 'active' : 'banned';
  const updated = await db.update('users', id, { status: next, updatedAt: new Date().toISOString() });

  logger.info('ADMIN_TOGGLE_USER_BAN', {
    actorId: requester.id,
    targetId: id,
    status: next,
  });

  return sanitizeUserForList(updated);
}

/*
 * 刪除會員
 * - 僅 admin
 * - 禁止刪除自己
 */
async function remove({ requester, userId }) {
  assertRole(requester, ['admin']);

  const id = Number(userId);
  if (!id || Number.isNaN(id)) throw appError(400, 'VALIDATION_ERROR', 'Invalid user id');
  if (requester.id === id) throw appError(400, 'NOT_ALLOWED', 'Cannot delete yourself');

  const user = await db.findById('users', id);
  if (!user) throw appError(404, 'USER_NOT_FOUND', 'User not found');

  await db.remove('users', id);

  logger.info('ADMIN_DELETE_USER', {
    actorId: requester.id,
    targetId: id,
  });

  return { id };
}

module.exports = {
  listUsers,
  setVip,
  toggleVip,
  setStatus,
  toggleBan,
  remove,
};