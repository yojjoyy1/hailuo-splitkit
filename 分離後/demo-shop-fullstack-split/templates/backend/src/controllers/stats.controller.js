/*
 * stats.controller.js
 * - 營運報表控制器
 * - 路徑：GET /api/v1/admin/stats
 *
 * 查詢參數（可選）：
 *   - range: 統計區間（預設 'all'，可用 '7d' | '30d' | '90d' | 'all'）
 *   - topN: 熱銷商品前 N 名（預設 5）
 *   - lowStockThreshold: 低庫存門檻（預設 10）
 *
 * 回傳：
 * {
 *   revenue,        // 營收
 *   profit,         // 毛利
 *   orderCount,     // 有效訂單數
 *   avgOrder,       // 平均客單價
 *   lowStock: [ { id, sku, name, stock } ],
 *   topProducts: [ { id, sku, name, qty } ],
 *   userCount       // 會員數
 * }
 */

const statsService = require('../services/stats.service');

function toInt(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// GET /api/v1/admin/stats
async function getOverview(req, res, next) {
  try {
    const range = String(req.query.range || 'all').toLowerCase();
    const topN = toInt(req.query.topN, 5);
    const lowStockThreshold = toInt(req.query.lowStockThreshold, 10);

    // 委派給服務層計算
    const data =
      (await (statsService.getOverview
        ? statsService.getOverview({ range, topN, lowStockThreshold })
        : statsService.overview
        ? statsService.overview({ range, topN, lowStockThreshold })
        : statsService.calculateOverview({ range, topN, lowStockThreshold })));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOverview,
};