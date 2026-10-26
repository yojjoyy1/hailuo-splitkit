/*
 * admin 會員管理路由
 * - GET    /api/v1/admin/users            後台會員列表（隱碼處理）（admin/staff）
 * - PATCH  /api/v1/admin/users/:id        變更 VIP 與停權（admin）
 * - DELETE /api/v1/admin/users/:id        刪除會員（admin）
 *
 * 注意：
 * - 需先通過 JWT 與簽章驗證（簽章於全域中介層處理；此路由非白名單）
 * - requireRoles 進行 RBAC 檢查
 */

const express = require('express');
const router = express.Router();

const { requireAuth, requireRoles } = require('../middlewares/auth');
const userController = require('../controllers/user.controller');

// 會員列表（admin/staff）
router.get(
  '/admin/users',
  requireAuth,
  requireRoles('admin', 'staff'),
  userController.listUsers
);

// 更新會員（僅 admin）：支援變更 vip 與 status（active/banned）
router.patch(
  '/admin/users/:id',
  requireAuth,
  requireRoles('admin'),
  userController.updateUser
);

// 刪除會員（僅 admin）
router.delete(
  '/admin/users/:id',
  requireAuth,
  requireRoles('admin'),
  userController.deleteUser
);

module.exports = router;