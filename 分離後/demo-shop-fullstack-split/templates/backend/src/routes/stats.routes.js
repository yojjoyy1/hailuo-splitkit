/*
 * admin 統計路由
 * - GET /api/v1/admin/stats：營運統計（營收、毛利、訂單數、平均客單、低庫存、熱銷商品、會員數）
 * - 僅限後台角色（admin/staff）
 */

const express = require('express');
const router = express.Router();

const { requireAuth, requireRoles } = require('../middlewares/auth');
const statsController = require('../controllers/stats.controller');

// 營運統計
router.get(
  '/admin/stats',
  requireAuth,
  requireRoles('admin', 'staff'),
  statsController.getStats
);

module.exports = router;