const express = require('express');
const config = require('../config');
const { requireAuth, optionalAuth, requireRoles } = require('../middlewares/auth');
const { ok } = require('../utils/http');
const auth = require('../services/auth.service');
const products = require('../services/product.service');
const pricing = require('../services/pricing.service');
const orders = require('../services/order.service');
const admin = require('../services/admin.service');
const db = require('../repositories/db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const uid = (req) => req.user?.sub || req.user?.id;

router.get('/public/settings', (req, res) => ok(res, config.publicSettings));

router.post('/auth/register', wrap(async (req, res) => ok(res, await auth.register(req.body || {}))));
router.post('/auth/login', wrap(async (req, res) => ok(res, await auth.login(req.body || {}))));
router.get('/auth/profile', requireAuth, wrap(async (req, res) => ok(res, auth.profile(uid(req)))));
router.post('/auth/logout', requireAuth, (req, res) => ok(res, auth.logout(req.signKey?.keyId)));

router.get('/products', optionalAuth, (req, res) => ok(res, products.list(req.query)));
router.get('/products/:id', optionalAuth, (req, res) => ok(res, products.getById(req.params.id)));
router.post('/admin/products', requireAuth, requireRoles('admin'), (req, res) => ok(res, products.create(req.body || {})));
router.patch('/admin/products/:id', requireAuth, requireRoles('admin', 'staff'), (req, res) => ok(res, products.update(req.params.id, req.body || {})));
router.delete('/admin/products/:id', requireAuth, requireRoles('admin'), (req, res) => ok(res, products.remove(req.params.id)));

router.post('/pricing/quote', optionalAuth, (req, res) => {
  const user = req.user ? db.find('users', (u) => String(u.id) === String(uid(req))) : null;
  ok(res, pricing.quote(req.body?.items || [], user, req.body?.couponCode));
});
router.get('/coupons/validate', requireAuth, (req, res) => {
  const user = db.find('users', (u) => String(u.id) === String(uid(req)));
  const result = pricing.validateCoupon(req.query.code, Number(req.query.subtotal || 0), user);
  ok(res, result);
});

router.post('/checkout', requireAuth, (req, res) => {
  ok(res, orders.checkout({ userId: uid(req), ...req.body }));
});
router.get('/orders', requireAuth, (req, res) => ok(res, orders.myOrders(uid(req))));
router.post('/orders/:id/cancel', requireAuth, (req, res) => ok(res, orders.cancel(req.params.id, uid(req), req.user.role)));
router.get('/admin/orders', requireAuth, requireRoles('admin', 'staff'), (req, res) => ok(res, orders.adminList(req.query.status)));
router.patch('/admin/orders/:id/status', requireAuth, requireRoles('admin', 'staff'), (req, res) => ok(res, orders.updateStatus(req.params.id, req.body?.status)));
router.get('/admin/export/orders.csv', requireAuth, requireRoles('admin', 'staff'), (req, res) => {
  const csv = orders.exportCsv();
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="orders.csv"');
  res.send(csv);
});

router.get('/admin/users', requireAuth, requireRoles('admin', 'staff'), (req, res) => ok(res, admin.listUsers()));
router.patch('/admin/users/:id', requireAuth, requireRoles('admin'), (req, res) => ok(res, admin.updateUser(req.params.id, req.body || {})));
router.delete('/admin/users/:id', requireAuth, requireRoles('admin'), (req, res) => ok(res, admin.deleteUser(req.params.id)));
router.get('/admin/coupons', requireAuth, requireRoles('admin', 'staff'), (req, res) => ok(res, admin.listCoupons()));
router.patch('/admin/coupons/:code/toggle', requireAuth, requireRoles('admin', 'staff'), (req, res) => ok(res, admin.toggleCoupon(req.params.code)));
router.get('/admin/stats', requireAuth, requireRoles('admin', 'staff'), (req, res) => ok(res, admin.stats()));
router.post('/admin/reset', requireAuth, requireRoles('admin'), (req, res) => ok(res, admin.reset(config.isDev && config.data.allowDevReset)));

module.exports = router;
