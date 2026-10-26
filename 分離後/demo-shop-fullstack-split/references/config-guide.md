# 設定與環境切換指南（Config + Env）

目的
- 以環境變數與集中設定管理所有機敏值與開關。
- 清楚劃分 development / staging / production 三種環境差異。
- 可調整/關閉模組：signKey、audit、錯誤細節、mock payment/SMS、CORS 白名單、mock/seed。

設定層級與來源
- .env（機敏來源）：於 backend/ 根目錄，cp .env.example .env 後依需求填值
- src/config/*.js（集中邏輯）：將環境變數轉為程式內使用的設定物件
- 程式使用方式：import config from src/config/index.js

主要環境變數（對照 templates/backend/.env.example）
- NODE_ENV：development | staging | production（預設 development）
- PORT：預設 3000
- JWT_SECRET：JWT 簽章秘密
- JWT_EXPIRES_IN：JWT 存活時間（例如 2h）
- ADMIN_MASTER_PASSWORD：後台萬用密碼（開發/測試用；正式建議關閉或設極強隨機字串）
- PAYMENT_SECRET_KEY：金流 mock 用金鑰（實務上不應上傳真實金鑰）
- SMS_API_KEY：簡訊 mock 用金鑰
- DATA_STORE：file | memory（資料儲存模式；預設 file）
- DATA_DIR：檔案資料目錄（預設 src/repositories/seed）
- SEED_ON_START：true | false（啟動是否載入種子）
- AUDIT_ENABLED：true | false（稽核日誌）
- AUDIT_MASK_FIELDS：以逗號分隔需遮罩欄位（例：password,card,Authorization,apiKey,signKey）
- ERROR_DETAILS：true | false（回應是否包含詳細錯誤；正式環境務必 false）
- RATE_LIMIT_ENABLED：true | false（可選；若啟用則需在 security.js 設定參數）
- CORS_ALLOWED_ORIGINS：以逗號分隔（例：http://localhost:3000,http://localhost:8080）
- SIGNKEY_ENABLED：true | false（是否啟用簽章驗證）
- SIGNKEY_ALGO：HMAC-SHA256（目前固定此值）
- SIGNKEY_WINDOW_MS：有效時間窗（例如 300000 表示 5 分鐘）
- SIGNKEY_CLOCK_SKEW_MS：允許時鐘偏移（例如 15000 表示 15 秒）
- NONCE_TTL_MS：nonce 存活時間（通常等於或略大於 SIGNKEY_WINDOW_MS）
- SIGNKEY_WHITELIST：免簽章路由逗號分隔（預設 /api/v1/public/settings,/api/v1/auth/login,/api/v1/auth/register）
- MOCK_PAYMENT：true | false（是否啟用金流 mock）
- MOCK_SMS：true | false（是否啟用簡訊 mock）
- DEVTOOLS_RESET_ENABLED：true | false（是否允許 /admin/reset）

集中設定檔（src/config）
- index.js：彙整所有設定，輸出 config 物件
  - env：NODE_ENV、port
  - cors：allowedOrigins（由 CORS_ALLOWED_ORIGINS 解析）
  - security：見 security.js
  - signKey：見 signkey.js
  - business：siteName/currency/taxRate/shipping/vipDiscount/freeShippingThreshold 等（公開顯示用字段）
  - dataStore：file 或 memory、資料目錄、是否載入 seed
  - mocks：payment/sms
  - devtools：reset 開關
- security.js：遮罩欄位、錯誤細節、速率限制參數
  - maskFields：可由 AUDIT_MASK_FIELDS 覆蓋
  - errorDetails：由 ERROR_DETAILS 控制
  - rateLimit：若啟用，提供 windowMs、max、standardHeaders 等參數
- signkey.js：簽章演算法、時間窗、時鐘偏移、nonce 儲存策略
  - enabled：SIGNKEY_ENABLED
  - algo：HMAC-SHA256
  - windowMs：SIGNKEY_WINDOW_MS
  - clockSkewMs：SIGNKEY_CLOCK_SKEW_MS
  - nonceTtlMs：NONCE_TTL_MS
  - whitelist：SIGNKEY_WHITELIST

三種環境建議預設
- development
  - AUDIT_ENABLED=true（便於追蹤）
  - ERROR_DETAILS=true（開發除錯用）
  - SIGNKEY_ENABLED=true（可選；若前端尚未接好可暫時 false）
  - MOCK_PAYMENT=true、MOCK_SMS=true
  - CORS_ALLOWED_ORIGINS=*
  - DEVTOOLS_RESET_ENABLED=true
  - DATA_STORE=file、SEED_ON_START=true（每次啟動載入種子方便重現）
- staging
  - AUDIT_ENABLED=true
  - ERROR_DETAILS=false
  - SIGNKEY_ENABLED=true
  - MOCK_PAYMENT=true、MOCK_SMS=true（依集成情境可關閉）
  - CORS_ALLOWED_ORIGINS=設定為前端測試站域名
  - DEVTOOLS_RESET_ENABLED=false（避免誤觸）
  - DATA_STORE=file 或接資料庫（若已替換 repositories）
- production
  - AUDIT_ENABLED=true
  - ERROR_DETAILS=false（嚴禁外洩 stack）
  - SIGNKEY_ENABLED=true（強制）
  - MOCK_PAYMENT=false、MOCK_SMS=false（若仍為 mock 也應明確保留 true 但不可通往外部）
  - CORS_ALLOWED_ORIGINS=嚴格白名單（正式前端網域）
  - DEVTOOLS_RESET_ENABLED=false
  - DATA_STORE=依實際 DB；SEED_ON_START=false

模組開關與調整方式
- 簽章驗證（signKey）
  - 開關：SIGNKEY_ENABLED
  - 時間窗與偏移：SIGNKEY_WINDOW_MS、SIGNKEY_CLOCK_SKEW_MS
  - 免簽白名單：SIGNKEY_WHITELIST
  - Nonce TTL：NONCE_TTL_MS
- 稽核日誌（audit）
  - 開關：AUDIT_ENABLED
  - 遮罩欄位：AUDIT_MASK_FIELDS（逗號分隔）
- 統一錯誤處理細節
  - ERROR_DETAILS 控制是否在回應內容附上 traceId/詳細訊息（stack 永遠不外洩）
- Mock（payment / SMS）
  - MOCK_PAYMENT、MOCK_SMS 控制是否實際呼叫（templates 內預設為 mock，不會連外）
- CORS 白名單
  - CORS_ALLOWED_ORIGINS 設定允許來源（逗號分隔；development 可設定為 *）
- 速率限制（可選）
  - RATE_LIMIT_ENABLED=true 時，於 security.js 設定 windowMs 與 max，並於 app.js 掛載對應 middleware

Mock 與 Seed 切換
- 啟動載入種子：SEED_ON_START=true 將以 src/repositories/seed/*.json 覆蓋當前資料
- 資料儲存模式：
  - file：以檔案 JSON 為持久層（預設）
  - memory：純記憶體（適合測試；重啟即清空）
- 開發重置 API：
  - DEVTOOLS_RESET_ENABLED=true 且 NODE_ENV=development 時，POST /api/v1/admin/reset 可重置資料

前端相關設定
- baseURL
  - 預設 http://localhost:3000
  - 可在瀏覽器 localStorage 設定 ui.baseURL 以指定其他環境（frontend/sdk/apiClient.js 會自動讀取）
- 簽章與 JWT
  - 由 sdk/authClient.js 在登入/註冊後保存 accessToken、signKeyId、signKeySecret
  - 請確保使用 HTTPS 以保護傳輸安全（正式環境必須）

實作與驗證流程摘要
- backend
  - cp .env.example .env，填入 JWT_SECRET、ADMIN_MASTER_PASSWORD、PAYMENT_SECRET_KEY、SMS_API_KEY 等（可為假值）
  - 調整 CORS_ALLOWED_ORIGINS 以允許前端來源
  - npm run dev 啟動；觀察啟動日誌印出的環境與開關
- frontend
  - 以 npx serve frontend 啟動靜態伺服器；確保呼叫到正確 baseURL
  - 先呼叫 /api/v1/public/settings（免簽章）驗證連線，後續按需登入以取得 JWT 與簽章

安全建議（production）
- 嚴格設定 CORS 白名單與 HTTPS
- 縮短 SIGNKEY_WINDOW_MS，並確保 NONCE_TTL_MS 對應
- 定期輪替 JWT_SECRET 與管理員密碼
- 確保伺服器時鐘正確（簽章時間窗依賴）
- 開啟稽核並導入集中式日誌系統（遮罩敏感欄位）

參考
- 架構與分層：references/architecture.md
- 簽章規格：references/sign-key.md
- 安全清單：references/security.md
- 後端模板：templates/backend/