# 資安防護清單與實作方式

總目標
- 在前後端分離後，避免敏感資訊外洩與常見攻擊；所有開關與參數可於 config 與 .env 設定。

環境變數與機敏設定（集中管理）
- .env 範例（參考 templates/backend/.env.example）
  - NODE_ENV=development|staging|production
  - PORT=3000
  - JWT_SECRET=請更換為高強度隨機字串
  - JWT_EXPIRES_IN=2h（可選）
  - ADMIN_MASTER_PASSWORD=管理維運用萬用密碼（測試用途，生產勿使用）
  - PAYMENT_SECRET_KEY=金流密鑰（mock 用）
  - SMS_API_KEY=簡訊密鑰（mock 用）
  - SIGNKEY_ENABLED=true|false
  - SIGNKEY_WINDOW_MS=300000
  - SIGNKEY_CLOCK_SKEW_MS=15000
  - NONCE_TTL_MS=300000
  - AUDIT_ENABLED=true|false
  - ERROR_DETAIL=false（生產環境 false）
  - CORS_WHITELIST=http://localhost:5173,http://localhost:8080
  - MOCK_PAYMENT_ENABLED=true|false
  - MOCK_SMS_ENABLED=true|false
  - STORAGE_DRIVER=file|memory（資料層驅動）
- 設定載入
  - templates/backend/src/config/index.js：匯總環境變數與預設值
  - templates/backend/src/config/security.js：遮罩欄位與錯誤細節、速率限制參數
  - templates/backend/src/config/signkey.js：簽章演算法、時間窗、白名單、nonce 策略

稽核日誌（Audit Logs）
- 實作位置
  - 中介層：templates/backend/src/middlewares/audit.js
  - 工具：templates/backend/src/utils/logger.js、templates/backend/src/utils/masker.js
- 記錄內容
  - 時間、traceId、client IP、method、path、status、duration ms
  - userId/role（若已驗證）、keyId（若有）
  - 摘要型 request/response（限制長度與欄位）
- 遮罩策略（可於 security.js 設定）
  - Authorization、X-Signature、X-Sign-KeyId、X-Sign-Timestamp、X-Sign-Nonce
  - password、card、cvc、token、apiKey、secret、email（部分遮罩）、phone（部分遮罩）
  - 匯出/回應中的 PII 字段以星號或局部保留（utils/masker.js）
- 最佳實務
  - 僅於 AUDIT_ENABLED=true 啟用詳細稽核；生產環境避免記錄完整 payload
  - 以滾動檔案或集中式日誌系統蒐集（此模板示範 console-based）

統一錯誤處理
- 實作位置：templates/backend/src/middlewares/error.js
- 原則
  - 不外洩堆疊與內部訊息；生產環境固定回覆簡潔 message 與 code
  - 開發模式可附帶 traceId、hint（ERROR_DETAIL=true）
  - 常見格式：
    - { error: { code: 'xxxx', message: '簡述', traceId?: '...' } }
- 映射（例）
  - 驗證失敗：400_xxx
  - 未認證：401_xxx
  - 未授權：403_xxx
  - 找不到：404_not_found
  - 伺服器錯誤：500_internal_error
- 建議於服務層拋出結構化錯誤（含 code、httpStatus），交由錯誤中介層統一輸出

身份驗證與 RBAC
- JWT
  - 登入/註冊簽發 accessToken（HS256），預設有效 2 小時（可於 JWT_EXPIRES_IN 調整）
  - middlewares/auth.js 驗證 Authorization: Bearer <token>
- 角色與權限
  - 角色：admin、staff、customer
  - 規則（摘錄）：
    - customer：/products 查詢、/pricing/quote、/checkout、/orders、/orders/:id/cancel
    - staff：/admin/orders 檢視與更新部分狀態、/admin/products 局部更新、/admin/coupons 切換
    - admin：新增/刪除商品、刪除會員、/admin/export、環境限定的 /admin/reset
  - 控制點：middlewares/auth.js（requireRole）、各 routes/controller 再做細部檢查
- Session signKey（配合簽章）
  - 登入/註冊核發短效 signKey（keyId + secret），伺服器側可撤銷與過期控管
  - 登出撤銷該 keyId

輸入驗證與資料保護
- 原則
  - 僅接受預期欄位；對未知欄位忽略或拒絕
  - 基本型別與長度檢查（數值正整、字串長度、Email 格式等）
  - 嚴禁於前端保留任何密鑰或商業邏輯（已遷移至後端）
- 實作
  - 在各 controller（templates/backend/src/controllers/*.js）對 req.body/params/query 做最小驗證與整理
  - 對關鍵流程（/checkout、/pricing/quote、/admin/products）特別檢查範圍與邏輯一致性
- 建議
  - 如需更完整驗證可引入 joi/zod（此模板為減檔未預設）

CORS 與瀏覽器安全
- 中介層：templates/backend/src/middlewares/cors.js
- 控制：使用 CORS_WHITELIST（逗號分隔）限制允許來源；預設僅允許本機常用開發埠
- 安全標頭：於 app.js 啟用 helmet（package 已包含），關閉多餘 X-Powered-By

速率限制（可選）
- 目的：緩解暴力嘗試與濫用
- 參數位置：templates/backend/src/config/security.js（rateLimit.*）
- 建議方案
  - 開發期可暫不啟用；若需快速導入，可使用 express-rate-limit（未預設以控制檔案數）
  - 或以反向代理（如 Nginx）層進行限制

資料層安全
- 儲存驅動：file/memory（config.STORAGE_DRIVER）
- 種子檔：templates/backend/src/repositories/seed/*.json（不含明碼密碼；若為 demo 明碼需明確標註）
- 交易一致性：order.service.js 以簡化 transaction-like 流程確保庫存遞減與優惠券核銷一致

匯出與回應資料最小化
- 匯出 CSV：export.controller.js 僅輸出必要欄位，敏感欄位遮罩；utils/csv.js 預設 UTF-8 BOM
- 後台清單：user.service.js 對 email/phone 做遮罩後返回

開發／測試專用路由
- /api/v1/admin/reset 僅在 NODE_ENV=development 時可用（devtools 模組）
- 生產環境嚴禁開啟該端點

日誌與可觀測性
- logger.js 提供 info/error/debug；錯誤統一交由 error middleware 輸出
- 稽核與應用日誌可關聯 traceId 以便追蹤單筆請求

常見風險對應
- 重放攻擊：簽章時間窗 + nonce-store
- 憑證竊取：JWT 短效 + 登出撤銷 signKey；鼓勵 HTTPS；避免在前端長期儲存 secret
- CORS 配置錯誤：生產環境收斂白名單
- 資訊外洩：錯誤訊息標準化、日誌遮罩、env 不入版控
- 權限繞過：中介層與路由層雙重檢查角色與資源所有權

驗收清單
- 生產環境 ERROR_DETAIL=false、AUDIT_ENABLED=true
- 白名單外路由均需 JWT + 簽章
- 稽核日誌可見遮罩後的 Authorization、X-Signature 等欄位
- /admin/reset 僅於 development 可呼叫
- 匯出與列表資料的敏感欄位已遮罩