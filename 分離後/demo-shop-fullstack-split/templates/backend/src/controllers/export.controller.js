/*
 * export.controller.js
 * - 匯出訂單 CSV（admin/staff）
 * - 路徑：GET /api/v1/admin/export/orders.csv
 *
 * 欄位：
 *   訂單編號, 會員, 電話, Email, 金額, 狀態, 付款參考, 建立時間
 *
 * 注意：
 * - 權限控管交由路由與 RBAC 中介層處理（middlewares/auth.js）
 * - CSV 產出是否附加 BOM 由 config.csv.withBOM 控制
 * - 稽核與遮罩由全域稽核中介層處理（middlewares/audit.js）
 */

const config = require('../config');
const { toCSV } = require('../utils/csv');
const orderService = require('../services/order.service');
const userService = require('../services/user.service');

const STATUS_TEXT = {
  pending: '待付款',
  paid: '已付款',
  shipped: '已出貨',
  completed: '已完成',
  cancelled: '已取消',
};

function pick(v, d = '') {
  return v === undefined || v === null ? d : v;
}

// GET /api/v1/admin/export/orders.csv
async function exportOrdersCsv(req, res, next) {
  try {
    const { status } = req.query;

    // 取得訂單（admin/staff 權限）；服務層應實作過濾與必要欄位
    // 預期回傳結構至少包含：id, userId, total, status, paymentRef, createdAt
    const orders = await (orderService.adminList
      ? orderService.adminList({ status })
      : orderService.listAllOrders
      ? orderService.listAllOrders({ status })
      : orderService.listAll({ status })); // 多名稱容錯

    // 取得使用者映射（避免 N+1）
    // 嘗試從 orders 直接取得 user 資訊；若沒有則批次查詢
    let usersById = {};
    const hasUserJoined = orders.length > 0 && orders[0] && (orders[0].user || orders[0].userName);
    if (!hasUserJoined) {
      const userIds = Array.from(new Set(orders.map((o) => o.userId).filter(Boolean)));
      if (userIds.length) {
        if (userService.getByIds) {
          const users = await userService.getByIds(userIds);
          usersById = Object.fromEntries(users.map((u) => [String(u.id), u]));
        } else if (userService.list) {
          const users = await userService.list();
          usersById = Object.fromEntries(users.filter((u) => userIds.includes(u.id)).map((u) => [String(u.id), u]));
        }
      }
    }

    const header = ['訂單編號', '會員', '電話', 'Email', '金額', '狀態', '付款參考', '建立時間'];
    const rows = [header];

    for (const o of orders) {
      const u =
        (hasUserJoined && (o.user || {})) ||
        usersById[String(o.userId)] || {
          name: pick(o.userName, '-'),
          phone: pick(o.userPhone, ''),
          email: pick(o.userEmail, ''),
        };

      rows.push([
        pick(o.id, ''),
        pick(u.name, '-'),
        pick(u.phone, ''),
        pick(u.email, ''),
        pick(o.total, 0),
        STATUS_TEXT[pick(o.status, 'pending')] || pick(o.status, 'pending'),
        pick(o.paymentRef, ''),
        pick(o.createdAt, ''),
      ]);
    }

    const csv = toCSV(rows, { withBOM: !!config.csv.withBOM });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  exportOrdersCsv,
};