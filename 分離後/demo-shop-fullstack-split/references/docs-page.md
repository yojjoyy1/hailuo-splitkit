# docs/index.html 產出要求（啟用說明頁）

目標
- 在專案輸出 docs/index.html，提供一頁式指南，讓使用者在 5 分鐘內完成啟動、測試 API、啟動前端並完成基本操作。

檔案位置與載入
- 生成於專案根目錄的 docs/index.html（來源模板：templates/docs/index.html）
- 以純靜態 HTML + 少量內嵌樣式/腳本呈現，不依賴建置流程

頁面結構（建議章節）
1) 專案總覽
- 說明本 ZIP 內容：backend/、frontend/、docs/
- 說明後端框架（Node.js + Express.js）、前端為靜態頁（HTML + 原生 JS SDK）
- 連結到此 Skill 的其他文件
  - references/api-inventory.md（API 一覽與權限）
  - references/sign-key.md（簽章規格）
  - references/security.md（資安防護）
  - references/config-guide.md（環境參數）
  - references/frontend-rewrite.md（前端改寫重點）

2) 快速開始（後端）
- 先決條件：Node.js 18+、npm
- 指令
  - cd backend
  - cp .env.example .env
  - 編輯 .env，至少設定 JWT_SECRET、ADMIN_MASTER_PASSWORD、PAYMENT_SECRET_KEY、SMS_API_KEY
  - npm install
  - npm run dev
- 預設埠：http://localhost:3000
- 成功畫面：終端機日誌顯示環境、CORS 白名單、簽章開關

3) 環境變數範例（可複製貼上）
- NODE_ENV=development
- PORT=3000
- JWT_SECRET=please_change_me_32+_random
- JWT_EXPIRES_IN=2h
- ADMIN_MASTER_PASSWORD=admin888
- PAYMENT_SECRET_KEY=sk_demo_xxx
- SMS_API_KEY=sms_demo_xxx
- SIGNKEY_ENABLED=true
- SIGNKEY_WINDOW_MS=300000
- SIGNKEY_CLOCK_SKEW_MS=15000
- NONCE_TTL_MS=300000
- AUDIT_ENABLED=true
- ERROR_DETAIL=true
- CORS_WHITELIST=http://localhost:4173,http://localhost:8080

4) 測試 API（以 curl）
- 取得公開設定（免簽章）
  - curl http://localhost:3000/api/v1/public/settings
- 登入（範例帳密請參考 seed：templates/backend/src/repositories/seed/users.json）
  - curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"amy","password":"amy2025"}'
  - 回應應含 accessToken 與 signKey.keyId/secret
- 以 JWT + 簽章呼叫受保護路由（舉例：GET /api/v1/products）
  - 計算 bodySha256 與簽章（Node one-liner）：
    - node -e "const c=require('crypto');const t=Date.now().toString();const n='ab12cd34ef56';const m='GET';const p='/api/v1/products?keyword=phone';const b='';const bs=c.createHash('sha256').update(b).digest('hex');const s=c.createHmac('sha256','<signKey.secret>').update(`${t}|${n}|${m}|${p}|${bs}`).digest('hex');console.log(t,n,s)"
  - 發送請求：
    - curl "http://localhost:3000/api/v1/products?keyword=phone" \
      -H "Authorization: Bearer <accessToken>" \
      -H "X-Sign-Timestamp: <t>" \
      -H "X-Sign-Nonce: <n>" \
      -H "X-Signature: <s>" \
      -H "X-Sign-KeyId: <signKey.keyId>"

5) 啟動前端並驗證流程
- 在專案根目錄執行：npx serve frontend（或任一靜態伺服器）
- 開啟瀏覽器：
  - 前台：http://localhost:3000 不要用（那是後端），請以靜態伺服器輸出的網址（例如 http://localhost:5000）
  - 首頁（frontend/index.html）：顯示商品清單、可加入購物車，價格計算改呼叫 /api/v1/pricing/quote
  - 登入頁（frontend/login.html）：呼叫 /api/v1/auth/login 與 /api/v1/auth/register，儲存 JWT 與 signKey
  - 後台（frontend/admin.html）：需 admin/staff 角色，呼叫 /api/v1/admin/* 系列 API

6) 常見問題與排錯
- 401 或 403 錯誤
  - 請確認：
    - 非白名單路由已附上 Authorization 與簽章 headers
    - 簽章 timestamp 在有效時間窗內（預設 5 分鐘）
    - nonce 未重複使用（前端每次請求皆產生新 nonce）
    - 簽章 payload 的 path 與實際請求完全一致（包含 query string）
- CORS 錯誤
  - 確認 docs 首頁提供的 CORS_WHITELIST 是否包含前端靜態伺服器的來源
  - 於 templates/backend/src/middlewares/cors.js 可看到白名單載入方式
- 簽章秘鑰遺失
  - signKey.secret 僅在登入/註冊核發時回傳一次；請重新登入取得新 key
- 開發時想關掉簽章
  - 設定 SIGNKEY_ENABLED=false，僅建議於 development
- 測試用資料重置
  - 僅在 development：POST /api/v1/admin/reset（需 admin 權限）
- 金流與簡訊是否會打到真實服務
  - 均為 server-side mock，勿於生產環境上傳真實金鑰

7) 目錄導覽（產出後應存在）
- backend/
  - package.json、.env.example
  - src/app.js、src/server.js
  - config/、middlewares/、utils/、repositories/、services/、controllers/、routes/
  - repositories/seed/products.json、users.json、orders.json、coupons.json
- frontend/
  - index.html、login.html、admin.html
  - sdk/apiClient.js、sdk/authClient.js、sdk/pricingClient.js、sdk/storage.js
  - pages/shop.js、pages/login.js、pages/admin.js
- docs/
  - index.html

8) 成功驗收清單（可勾選）
- [ ] 後端啟動成功，/api/v1/public/settings 可回 200
- [ ] 完成登入並取得 accessToken 與 signKey
- [ ] 使用前端頁面完成加購、報價、結帳、查詢訂單
- [ ] 後台可查詢訂單與統計、可匯出 CSV
- [ ] 稽核日誌可見遮罩後欄位；錯誤不外洩 stack

頁面內容格式建議
- 使用簡潔標題與段落，避免過度排版
- 提供可直接複製的 .env 範例與 curl 指令
- 於頁尾標示版本與時間（可使用 new Date().toISOString() 動態呈現）

連結與來源
- 本頁模板：templates/docs/index.html
- 相關規格文件：
  - ../references/sign-key.md
  - ../references/security.md
  - ../references/config-guide.md
  - ../references/api-inventory.md
  - ../references/frontend-rewrite.md