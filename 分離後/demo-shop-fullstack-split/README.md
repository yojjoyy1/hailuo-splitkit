# demo-shop-fullstack-split

這是 Cursor/Claude 的 Agent Skill。用來把 demo-shop-monolith 一次分離為「可執行的後端 API（Node.js + Express.js）」與「已改寫、直接呼叫 API 的前端」，並打包在同一 ZIP（backend/ + frontend/ + docs/）。

安裝方式
- 方式一（專案層）
  - 在你的專案根目錄建立 .cursor/skills/demo-shop-fullstack-split/
  - 將本資料夾所有檔案（SKILL.md、references/*、templates/*）放入其中
- 方式二（使用者全域）
  - 建立 ~/.cursor/skills/demo-shop-fullstack-split/
  - 將本資料夾所有檔案放入其中

如何觸發（建議用語）
- 在 Cursor/Claude 的對話視窗中、並已開啟 demo-shop-monolith 專案後，輸入其中一段：
  - 「使用 demo-shop-fullstack-split，將此專案前後端一起分離，後端用 Node.js + Express，啟用 HMAC-SHA256 簽章與防重放，產出 backend/ 與 frontend/。」
  - 「split fullstack express api signkey，請依 SKILL.md 的 checklist 執行並輸出模板。」
  - 「幫我把前端改為呼叫 API，並建立可執行的後端（JWT/RBAC、稽核、統一錯誤處理、環境變數、mock/seed），打包成同一 ZIP。」

執行預期結果
- 於當前專案根目錄新增：
  - backend/（可執行 Express API，含 routes/controllers/services/repositories/middlewares/config/utils 與 seed）
  - frontend/（SDK 與改寫後頁面：index.html、login.html、admin.html + 對應 JS）
  - docs/（docs/index.html 啟用說明）
- 產出後可直接：
  - 後端：cd backend && cp .env.example .env && npm install && npm run dev
  - 前端：在專案根目錄執行 npx serve frontend（或任一靜態伺服器）
  - 預設後端位於 http://localhost:3000

功能摘要
- 簽章驗證：HMAC-SHA256，字串為 timestamp|nonce|method|path|bodySha256；防重放（nonce store + 時間窗）。
- 安全機制：稽核日誌（敏感欄位遮罩）、統一錯誤處理（隱藏 stack）、環境變數管理（JWT_SECRET、PAYMENT_SECRET_KEY、SMS_API_KEY、SIGNKEY_* 等）。
- RBAC 與模組：會員/商品/訂單/優惠券/結帳/報表/匯出/開發重置。
- 設定開關：可切換 signKey、audit、mock/sms/payment、錯誤細節、CORS 白名單、seed 或記憶體 mock。

資料與參考
- 主流程與檢查清單：SKILL.md
- API 清單與權限：references/api-inventory.md
- 架構與分層：references/architecture.md
- 簽章規格：references/sign-key.md
- 安全與設定指南：references/security.md、references/config-guide.md
- 前端改寫說明：references/frontend-rewrite.md
- Docs 頁要求：references/docs-page.md

常見問題
- 問：產品清單或報價呼叫被拒絕，回 401/403？
  - 答：除 /public/settings、/auth/login、/auth/register 為白名單外，其餘路由預設需 JWT + 簽章。請先登入以取得 JWT 與 session signKey，或在 config 中調整白名單/開發模式開關。
- 問：前端本機開檔案（file://）遇 CORS？
  - 答：請使用靜態伺服器（例：npx serve frontend）或將對應來源加入 CORS 白名單。
- 問：如何重置假資料？
  - 答：以管理者帳號在 development 環境呼叫 /api/v1/admin/reset。
- 問：金流或簡訊會發送到真實服務嗎？
  - 答：皆為後端 mock；請勿在正式環境輸入真實金鑰。可在 config 關閉或切換行為。