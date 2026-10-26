/*
 * Auth 路由（/api/v1/auth/*）
 * - POST /auth/register    註冊（白名單，免簽章）
 * - POST /auth/login       登入（白名單，免簽章）
 * - GET  /auth/profile     取得目前登入者資訊（需 JWT + 簽章）
 * - POST /auth/logout      登出（撤銷 session signKey；需 JWT + 簽章）
 */

const express = require('express');
const router = express.Router();

const authCtrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth');

// 白名單路由（在 signKey 中介層 white list；此處不需 requireAuth）
router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);

// 受保護路由（需 JWT + 簽章）
router.get('/profile', requireAuth, authCtrl.profile);
router.post('/logout', requireAuth, authCtrl.logout);

module.exports = router;