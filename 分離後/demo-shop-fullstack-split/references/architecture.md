# 架構與分層規範（frontend + backend 最終輸出）

目標
- 產出可獨立啟動的 backend/（Express API）與 frontend/（純靜態、透過 SDK 呼叫 API），兩者同層。
- 後端嚴格職責分層、可維護、可擴充；前端僅負責 UI 與 API 呼叫。

最終輸出目錄（重點）
- backend/
  - .env.example
  - package.json
  - src/
    - server.js（讀取 env、建立 app、監聽、優雅關閉）
    - app.js（註冊中介層與主路由）
    - config/
      - index.js（集中設定：環境、CORS 白名單、稅率/運費/VIP 折扣、開關）
      - security.js（資安設定：遮罩欄位、錯誤細節、速率限制參數）
      - signkey.js（簽章演算法、時間窗、nonce 策略）
    - middlewares/
      - cors.js（依白名單開放 CORS）
      - audit.js（稽核與敏感遮罩）
      - signKey.js（驗證 HMAC 簽章與防重放）
      - auth.js（JWT 驗證與 RBAC）
      - error.js（統一錯誤處理）
    - utils/
      - crypto.js（HMAC、SHA256、常用安全工具）
      - logger.js（info/error/debug 與審計串接）
      - masker.js（email/phone/card/token 遮罩）
      - nonce-store.js（nonce 記憶體儲存與 TTL，日後可換 Redis）
      - csv.js（CSV 產生，UTF-8 BOM）
    - repositories/
      - db.js（資料存取抽象；記憶體或檔案 JSON）
      - seed/
        - products.json
        - users.json
        - orders.json
        - coupons.json
    - services/
      - auth.service.js（登入/註冊、JWT/簽章核發與撤銷）
      - product.service.js（商品搜尋/CRUD/庫存）
      - pricing.service.js（報價：折扣、運費、稅金）
      - order.service.js（建立/查詢/取消/狀態）
      - coupon.service.js（查詢/驗證/啟停/遞增使用量）
      - payment.service.js（金流 mock）
      - sms.service.js（簡訊 mock/關閉）
      - stats.service.js（營運報表）
      - user.service.js（後台會員管理）
    - controllers/
      - auth.controller.js
      - product.controller.js
      - pricing.controller.js
      - order.controller.js
      - coupon.controller.js
      - export.controller.js（CSV 匯出）
      - stats.controller.js
      - user.controller.js
    - routes/
      - index.js（彙整/掛載子路由與中介層順序）
      - auth.routes.js（/auth/*）
      - product.routes.js（/products 與 /admin/products）
      - pricing.routes.js（/pricing 與 /coupons）
      - order.routes.js（/orders 與 /checkout）
      - coupon.routes.js（/admin/coupons）
      - export.routes.js（/admin/export）
      - stats.routes.js（/admin/stats）
      - user.routes.js（/admin/users）
- frontend/
  - sdk/
    - apiClient.js（通用 client，JWT + 簽章 + 重試 + 錯誤處理）
    - authClient.js（登入/註冊/登出/個資）
    - pricingClient.js（報價與優惠驗證）
    - storage.js（localStorage/session 抽象）
  - pages/
    - shop.js（前台商店頁行為）
    - admin.js（後台頁行為）
    - login.js（登入/註冊頁行為）
  - index.html / admin.html / login.html（已改寫：只載入 SDK 與 pages/*.js）
- docs/
  - index.html（啟用與測試說明）

路徑與版本
- 所有 API 一律掛載於 /api/v1/ 之下，方便版本管理與前綴 CORS/中介層控管。
- 白名單路由（免簽章）：/public/settings、/auth/login、/auth/register；其餘需 JWT + 簽章（可由 config 調整）。

後端分層與責任界線
- routes：只負責宣告路由與掛載中介層（auth、signKey）；不得含商業邏輯。
- controllers：處理輸入驗證、呼叫 service、轉換回應格式與狀態碼；不得存取資料層。
- services：商業邏輯與流程組裝；可同時調用多個 repositories 或其他 services。
- repositories：資料存取抽象，對外提供 CRUD 與 transaction-like 操作；可切換記憶體或檔案 JSON。
- middlewares：跨切面關注（CORS、稽核、簽章、JWT、錯誤處理）。
- config：集中設定、環境差異與模組開關；嚴禁把秘密金鑰寫死在程式碼。
- utils：通用工具（加解密、記錄、遮罩、CSV、nonce 儲存等）。

請求處理順序（src/app.js 建議）
1) 安全性與通用：
   - CORS（middlewares/cors.js）
   - JSON 解析與 urlencoded
   - 稽核日誌（middlewares/audit.js）
2) 路由掛載（routes/index.js）
   - 白名單群組（public/settings、auth）先掛載
   - 簽章驗證（middlewares/signKey.js）於受保護群組前
   - JWT 與 RBAC（middlewares/auth.js）於需要身份之路由群組
3) 控制器執行
4) 統一錯誤處理（middlewares/error.js）

簽章驗證（middlewares/signKey.js）
- 字串：timestamp|nonce|method|path|bodySha256
- 演算法：HMAC-SHA256
- 需檢查：時間窗（window）、時鐘偏移（clockSkew）、nonce 防重放（nonce-store）
- 開關與參數：src/config/signkey.js 與環境變數控制

JWT 與 RBAC（middlewares/auth.js）
- Authorization: Bearer <token>
- 角色：admin、staff、customer
- 權限示意：
  - customer：購買/查訂單/取消
  - staff：檢視營運、訂單管理、部分商品/優惠操作
  - admin：全權（含刪除）

資料層策略（repositories/db.js）
- 預設：檔案 JSON + 記憶體索引（提升查詢速度）；開發期可選純記憶體（重啟即清空）
- 提供 nextId、批次更新、簡易 transaction-like（例如結帳庫存扣減 + 訂單建立一致性）
- 種子資料位於 src/repositories/seed/*.json，啟動時可選擇載入（config 控制）

前端結構與行為
- SDK（frontend/sdk/*）封裝一切通訊細節（baseURL、JWT、簽章、重試、錯誤轉譯）
- 頁面腳本（frontend/pages/*）僅處理 DOM 與 SDK 呼叫，不含商業邏輯或資料計算
- 儲存（storage.js）約束關鍵鍵名與序列化格式，避免散落各處

命名規範
- 檔案命名：以職責為主，使用 kebab-case；類型後綴固定：
  - *.routes.js、*.controller.js、*.service.js
- 目錄命名：複數名詞代表資源（routes/controllers/services/repositories）
- 變數與函式：小駝峰；類別（若有）：大駝峰；常數：全大寫底線

錯誤處理策略
- controllers 僅丟出已分類的業務錯誤；error middleware 統一轉為標準格式（隱藏 stack）
- 開發模式可回傳 traceId 供對照日誌

擴充建議
- 新增模組步驟：
  1) 建立 service + controller + routes 檔
  2) 於 routes/index.js 掛載並決定是否需要 signKey/JWT
  3) repositories 視需要擴充讀寫
  4) 於 config 加入模組開關（可選）
- 資料層升級：
  - 可將 repositories/db.js 替換為真實 DB driver（例如 PostgreSQL、MongoDB），介面維持一致
- nonce-store 外掛：
  - 以 Redis 取代記憶體，提供叢集一致性
- 記錄外掛：
  - 將 logger 輸出串接到 ELK/Datadog；審計事件保留遮罩後欄位
- 安全強化：
  - 加入速率限制（按 IP 或使用者），簽章錯誤計次封鎖、內容安全政策（CSP）

對照模板
- 後端模板：templates/backend/
- 前端模板：templates/frontend/
- 說明頁模板：templates/docs/