/*
 * user.controller.js
 * - 會員管理控制器（admin）
 *
 * 路徑：
 *   - GET    /api/v1/admin/users               -> 列表（隱碼處理於服務層）
 *   - PATCH  /api/v1/admin/users/:id           -> 更新 VIP / 停權狀態
 *   - DELETE /api/v1/admin/users/:id           -> 刪除會員
 *
 * 注意：
 * - 權限：需 admin（列表可放寬至 staff 視需求；建議由路由 + RBAC 中介層強制）
 * - 輸出：避免外洩敏感資訊（password/hash/token 等），由服務層回傳已過濾欄位
 */

const userService = require('../services/user.service');

function parseBool(v) {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 1 || v === '1') return true;
  if (v === 0 || v === '0') return false;
  return undefined;
}

// GET /api/v1/admin/users
async function listUsers(req, res, next) {
  try {
    // 參數（可選）：role/status/vip 過濾；是否遮罩（mask，預設 true）
    const role = req.query.role;
    const status = req.query.status;
    const vip = req.query.vip !== undefined ? parseBool(req.query.vip) : undefined;
    const mask = req.query.mask !== undefined ? parseBool(req.query.mask) : true;

    const data =
      (await (userService.list
        ? userService.list({ role, status, vip, mask })
        : userService.listUsers
        ? userService.listUsers({ role, status, vip, mask })
        : userService.getAll({ role, status, vip, mask })));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/users/:id
async function updateUser(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: '無效的使用者 ID' } });
    }

    // 僅允許變更 VIP 與停權狀態
    const patch = {};
    if (req.body.vip !== undefined) {
      const v = parseBool(req.body.vip);
      if (v === undefined) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_VIP', message: 'vip 需為布林值' } });
      }
      patch.vip = v;
    }
    if (req.body.status !== undefined) {
      const s = String(req.body.status).toLowerCase();
      if (!['active', 'banned'].includes(s)) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'status 僅支援 active 或 banned' } });
      }
      patch.status = s;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, error: { code: 'EMPTY_PATCH', message: '未提供可更新的欄位（vip/status）' } });
    }

    const actor = req.user || null; // 由 auth 中介層注入
    const updated =
      (await (userService.adminUpdate
        ? userService.adminUpdate(id, patch, actor)
        : userService.updateByAdmin
        ? userService.updateByAdmin(id, patch, actor)
        : userService.update(id, patch, actor)));

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/admin/users/:id
async function deleteUser(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: '無效的使用者 ID' } });
    }

    const actor = req.user || null;
    const result =
      (await (userService.adminDelete
        ? userService.adminDelete(id, actor)
        : userService.deleteByAdmin
        ? userService.deleteByAdmin(id, actor)
        : userService.remove(id, actor)));

    // 回傳刪除結果
    res.json({ success: true, data: { id, deleted: !!result } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  updateUser,
  deleteUser,
};