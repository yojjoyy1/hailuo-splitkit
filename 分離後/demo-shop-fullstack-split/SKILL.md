---
name: demo-shop-fullstack-split
description: 為 demo-shop-monolith 一次完成「前後端一起分離」的技能。執行後產出可執行的 Node.js + Express.js 後端 API（含 JWT、RBAC、HMAC-SHA256 簽章、防重放、稽核日誌、統一錯誤處理、環境變數與 mock/seed），並改寫前端（HTML + 原生 JS）改為呼叫 API。輸出在同一 ZIP 的 backend/ 與 frontend/ 目錄，解壓即可前後端分開啟動。適用於關鍵字：split, express, api, signkey, fullstack, separation。
---

目標
- 將 demo-shop-monolith 一次性拆分為：
  - backend/：Node.js + Express.js 可執行 API（依職責分層、HMAC-SHA256 前後端簽章、防重放、稽核、統一錯誤處理、環境變數配置、seed/mock）。
  - frontend/：移除前端商業邏輯與金鑰，改為以 SDK 透過 API 存取（含登入/購物/後台管理頁範本與 docs/ 說明頁）。
- 產出後可分別啟動前後端；預設 Base URL：http://localhost:3000。

前置檢查
- 已打開原始專案 demo-shop-monolith（需包含 index.html、login.html、admin.html 與 js/*）。
- 本機已安裝 Node.js 18+ 與 npm。
- 可在專案根目錄寫入與建立 backend/、frontend/、docs/ 等輸出資料夾。
- 需求確認：
  - 必要 API 與權限已在 references/api-inventory.md 定義。
  - 簽章規範與安全要求見 references/sign-key.md、references/security.md。
  - 架構分層規範見 references/architecture.md。

輸出物（成功條件）
- backend/ 與 frontend/ 同層輸出；可直接各自啟動。
- 後端：npm i 後可 npm run dev 啟動；所有列於 API 一覽皆可呼叫。
- 前端：去除本地資料與前端商業邏輯，只透過 API 運作；可以靜態伺服器開啟。
- docs/index.html：含啟用與測試說明。

實作流程（checklist）
一、建立骨架
- [ ] 在專案根目錄建立 backend/、frontend/、docs/。
- [ ] 從 templates/backend 複製到 backend/；從 templates/frontend 複製到 frontend/；從 templates/docs 複製到 docs/。
  - 模板位置：templates/backend、templates/frontend、templates/docs

二、後端實作（Node.js + Express.js）
- [ ] 建置專案：backend/ 複製 package.json 與 .env.example；執行 npm install。
- [ ] 啟動程式：確保 src/server.js 載入 src/app.js 並監聽 PORT（預設 3000）。
- [ ] 設定與環境變數：
  - [ ] 完成 src/config/index.js、security.js、signkey.js 參數（可切換 dev/staging/prod；開關 signKey、audit、mock）。
  - [ ] 依 references/config-guide.md 設定 CORS 白名單與安全開關。
- [ ] 中介層：
  - [ ] 啟用 CORS（middlewares/cors.js）、JSON 解析、稽核（middlewares/audit.js）、簽章驗證（middlewares/signKey.js）、JWT 與 RBAC（middlewares/auth.js）、錯誤處理（middlewares/error.js）。
  - [ ] 在 routes/index.js 依順序掛載白名單與受保護路由。
- [ ] 資料層與種子：
  - [ ] repositories/db.js 讀寫記憶體/檔案 JSON；支援 nextId 與簡易 transaction-like。
  - [ ] seed 載入 products.json、users.json、orders.json、coupons.json。
- [ ] 服務層與控制器：
  - [ ] auth.service/controller：註冊、登入（支援 ADMIN_MASTER_PASSWORD）、JWT 簽發、session signKey 核發/撤銷、profile。
  - [ ] product、pricing、order、coupon、export、stats、user 各 service/controller 對應 references/api-inventory.md。
- [ ] 路由：
  - [ ] 各模組路由檔完成對應路徑與權限保護；依 references/api-inventory.md。
- [ ] 安全性：
  - [ ] 稽核日誌遮罩敏感欄位（password、card、Authorization、signKey、apiKey）。
  - [ ] 統一錯誤處理隱藏 stack；開發模式可回傳 traceId。
  - [ ] 簽章：HMAC-SHA256，以 timestamp|nonce|method|path|bodySha256，防重放與時間窗，白名單路由為 /public/settings、/auth/login、/auth/register（可調整）。
  - [ ] 機敏設定改為環境變數載入。
  - [ ] 可選速率限制與 mock 支援（依 config）。

三、前端改寫（HTML + 原生 JS）
- [ ] 刪除舊引用（js/data/*.js、js/db.js、js/auth.js、js/pricing.js、js/payment.js、js/shop.js、js/login.js、js/admin.js）。
- [ ] 新增 SDK：frontend/sdk/apiClient.js、authClient.js、pricingClient.js、storage.js。
- [ ] 改寫頁面：
  - [ ] index.html 載入 SDK 與 pages/shop.js；以 /public/settings 初始化站名與顯示設定；以 /products、/pricing/quote、/checkout、/orders 取代前端邏輯。
  - [ ] login.html 載入 SDK 與 pages/login.js；以 /auth/register、/auth/login 操作；保存 JWT 與 session signKey。
  - [ ] admin.html 載入 SDK 與 pages/admin.js；呼叫 /admin/* API 進行管理與匯出。
- [ ] 基礎路徑與組態：apiClient baseURL 指向後端（預設 http://localhost:3000）；在開發環境可於前端 storage 儲存 baseURL 以便切換。
- [ ] 簽章：前端以 session signKey 對所有非白名單路由附加簽章（含 timestamp、nonce、signature、keyId）。

四、文件與打包
- [ ] 產出 docs/index.html（啟動指南、env 範例、curl 範例、前端整合與除錯）。
- [ ] 驗證所有連結與腳本載入正確。
- [ ] 打包輸出（backend/ + frontend/ + docs/ 同層於同一 ZIP）。

驗證步驟
1) 啟動後端
- [ ] cd backend && cp .env.example .env，填入 JWT_SECRET、ADMIN_MASTER_PASSWORD、PAYMENT_SECRET_KEY、SMS_API_KEY 等（可用假值）。
- [ ] npm run dev 啟動，確認顯示環境與 CORS 白名單載入成功。

2) API 健康度
- [ ] curl http://localhost:3000/api/v1/public/settings 預期 200（無簽章）。
- [ ] 登入取得 JWT + signKey：
  - curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"amy","password":"amy2025"}'
  - 回應含 accessToken 與 signKeyId/secret（或僅在首次簽發顯示 secret）
- [ ] 使用簽章與 JWT 呼叫受保護路由（例如 GET /api/v1/products）。若缺簽章或過期/重放，應回 401/403。

3) 啟動前端
- [ ] 在專案根目錄執行 npx serve frontend（或以任一靜態伺服器）。
- [ ] 以瀏覽器開啟前台與後台；登入後完成購物流程、訂單查詢、取消、後台操作與匯出 CSV。
- [ ] 打開後端日誌，確認稽核與遮罩；故意觸發錯誤，確認統一錯誤處理不外洩 stack。

4) 環境切換
- [ ] 切至 NODE_ENV=staging / production，驗證 CORS 白名單、錯誤細節、mock/sms/payment 開關符合預期。
- [ ] 驗證 admin reset 僅在 development 可用。

參考文件
- API 一覽：references/api-inventory.md
- 前端改寫指引：references/frontend-rewrite.md
- 架構與分層規範：references/architecture.md
- 設定與環境切換：references/config-guide.md
- 前後端簽章規格：references/sign-key.md
- 資安防護清單：references/security.md
- 啟用說明頁要求：references/docs-page.md

範本（可直接複製到專案）
- 後端模板：templates/backend/
- 前端模板：templates/frontend/
- 說明頁模板：templates/docs/

觸發建議用語（貼給 Agent）
- 「請用 demo-shop-fullstack-split 將此專案 split 成 Express API + 前端改接 API，啟用 signkey、防重放、稽核與統一錯誤處理，並輸出 backend/ 與 frontend/ 到同一 ZIP。」
- 「split fullstack express api signkey，產出可執行後端與已改寫前端。」 