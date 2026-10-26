/*
 * admin 匯出路由
 * - GET /api/v1/admin/export/orders.csv：匯出訂單 CSV（admin/staff）
 * - 需 JWT + RBAC；簽章驗證由全域中介層處理（白名單不包含此路由）
 */

const express = require('express');
const router = express.Router();

const { requireAuth, requireRoles } = require('../middlewares/auth');
const exportController = require('../controllers/export.controller');

// 匯出訂單 CSV
router.get(
  '/admin/export/orders.csv',
  requireAuth,
  requireRoles('admin', 'staff'),
  exportController.exportOrdersCsv
);

module.exports = router;