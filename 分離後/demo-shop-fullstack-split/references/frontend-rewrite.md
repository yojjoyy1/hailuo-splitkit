# 前端改寫指引（改為呼叫後端 API）

目的
- 移除前端內的商業邏輯、資料與金鑰，改以「SDK + 後端 API」方式運作。
- 完成三個頁面改寫：index.html（前台商店）、login.html（登入/註冊）、admin.html（後台）。
- 產出後的檔案位於 frontend/ 目錄；與 backend/ 同層，解壓即可前後端分開啟動。

通用原則
- 來源拆除：js/config.js、js/data/*.js、js/db.js、js/auth.js、js/pricing.js、js/payment.js 全部刪除。
- 所有資料操作與計算一律改走 API；前端不再持有任何秘密金鑰。
- JWT 與前後端簽章（signKey）由後端註冊/登入時核發並由前端保存，除白名單外每次請求均附上。

依賴與載入順序（每頁皆一致）
1) sdk/apiClient.js（共用 HTTP client、baseURL、簽章與錯誤處理）
2) sdk/storage.js（localStorage/sessionStorage 輔助）
3) 視需要載入 sdk/authClient.js、sdk/pricingClient.js
4) 對應頁面腳本 pages/*.js（只負責 DOM 綁定與呼叫 SDK）

簽章與權杖（前後端協作）
- 白名單路由（免簽章）：/api/v1/public/settings、/api/v1/auth/login、/api/v1/auth/register
- 其他路由：需同時附上 Authorization: Bearer <JWT> 與下列簽章標頭：
  - X-Sign-Timestamp：UNIX 毫秒時間戳
  - X-Sign-Nonce：隨機 nonce（建議 uuid）
  - X-Sign-KeyId：session signKey 的 id
  - X-Signature：HMAC-SHA256(hex) 簽名字串，字串格式：timestamp|nonce|method|path|bodySha256
- signKey 於登入/註冊成功時由伺服器短效核發；前端妥善保存，過期自動重新登入或提示。
- 相關規格詳見 references/sign-key.md

前端儲存鍵值（由 sdk/storage.js 管理）
- auth.token：JWT（字串）
- auth.signKeyId：簽章用 keyId（字串）
- auth.signKeySecret：簽章用 secret（字串，短效；可存在 sessionStorage 或記憶體，templates 以 localStorage 示例）
- auth.user：使用者基本資料（JSON）
- cart.items：購物車品項陣列（[{ productId, qty }]）
- ui.baseURL：可選，覆寫預設 API baseURL（例如 http://localhost:3000）

API baseURL
- 預設 http://localhost:3000
- 可於前端 localStorage 設定 ui.baseURL 以切換環境；apiClient 會自動採用。

————————————————————————————————

一、index.html（前台商店）改寫

需要做的事
- 刪除以下 script 標籤：
  - js/config.js、js/data/products.js、js/data/users.js、js/data/orders.js、js/data/coupons.js、js/db.js、js/auth.js、js/pricing.js、js/payment.js、js/shop.js
- 改為新增這些 script（順序不可顛倒）：
  - frontend/sdk/apiClient.js
  - frontend/sdk/storage.js
  - frontend/sdk/authClient.js
  - frontend/sdk/pricingClient.js
  - frontend/pages/shop.js

初始化流程（pages/shop.js）
- 啟動時呼叫 GET /api/v1/public/settings
  - 以 settings.siteName 填入 #site-name
  - 記錄 currency、taxRate、shipping、vipDiscount… 僅做顯示（實際計算改走後端）
- 顯示使用者狀態
  - 若 storage 有 auth.user 則顯示姓名與 VIP 標記、登出/我的訂單按鈕；否則顯示登入連結
  - 登出按鈕呼叫 POST /api/v1/auth/logout，並清除 auth 資料

商品清單與查詢（移除本地搜尋/排序邏輯）
- 觸發條件：搜尋框、分類 chips、排序下拉
- 呼叫 GET /api/v1/products
  - 查詢參數：keyword、category、sort（default/priceAsc/priceDesc/rating）
  - 伺服器統一處理搜尋/篩選/排序，前端僅渲染結果
- 單一商品詳情：GET /api/v1/products/:id（如需）

購物車（仍使用 localStorage，但計算改走後端）
- 增/減數量與刪除保存在 cart.items
- 顯示金額時改呼叫 POST /api/v1/pricing/quote
  - 請求：{ items:[{productId,qty}], coupon: 'WELCOME10' | null }
  - 回應：{ subtotal, discount, shipping, tax, total, appliedCoupon, vipApplied }
- 輸入優惠碼後，前端可直接送交 /pricing/quote（也可先用 GET /api/v1/coupons/validate 檢查）

結帳（移除前端金流邏輯與 secret）
- 送出結帳表單呼叫 POST /api/v1/checkout（需登入、需簽章）
  - 請求：
    - items:[{productId,qty}]
    - shipping:{ name, phone, address }
    - payment:{ cardNumber, expiry, cvc }（由後端 mock 代扣，前端不保存）
    - coupon: 代碼或 null
  - 回應：{ orderId, status:'paid'|'pending'|..., paidAt, total }
- 結尾 0000 的卡號將模擬失敗（由後端決定）

我的訂單（移除前端組合邏輯）
- 開啟「我的訂單」視窗後呼叫 GET /api/v1/orders（需登入與簽章）
- 取消訂單：POST /api/v1/orders/:id/cancel（狀態限制由後端判定）

錯誤處理
- apiClient 會統一攔截 401/403/422/500 等，顯示簡訊息，不外洩 stack
- 驗證錯誤（422）會回傳可讀訊息；其餘以 toast/小紅字呈現

————————————————————————————————

二、login.html（登入／註冊）改寫

需要做的事
- 刪除以下 script：
  - js/config.js、js/data/*.js、js/db.js、js/auth.js、js/login.js
- 新增 script（順序）：
  - frontend/sdk/apiClient.js
  - frontend/sdk/storage.js
  - frontend/sdk/authClient.js
  - frontend/pages/login.js

初始化流程（pages/login.js）
- 載入 /api/v1/public/settings，設定頁面抬頭與站名
- 登入表單提交
  - 呼叫 POST /api/v1/auth/login，帶 { username, password }
  - 成功：保存 accessToken、signKeyId、signKeySecret、user；依角色導頁
    - admin/staff → admin.html
    - 其他 → index.html
- 註冊表單提交
  - 呼叫 POST /api/v1/auth/register，帶 { username, password, name, email, phone }
  - 成功同登入流程（後端簽發 JWT 與 session signKey）
- 錯誤顯示
  - 401/422 顯示於對應表單下方錯誤區塊

————————————————————————————————

三、admin.html（後台）改寫

需要做的事
- 刪除以下 script：
  - js/config.js、js/data/*.js、js/db.js、js/auth.js、js/admin.js
- 新增 script（順序）：
  - frontend/sdk/apiClient.js
  - frontend/sdk/storage.js
  - frontend/sdk/authClient.js
  - frontend/pages/admin.js

初始化與授權檢查（pages/admin.js）
- 若無 JWT 或角色非 admin/staff，導回 login.html
- 載入 /api/v1/public/settings 以顯示站名或資訊

營運總覽
- 呼叫 GET /api/v1/admin/stats（需角色：admin 或 staff）
  - 回傳：營收、毛利、訂單數、平均客單、低庫存、熱銷商品等欄位
  - 前端僅渲染，不再做任何統計計算

訂單管理
- 列表：GET /api/v1/admin/orders?status=paid|shipped|...
- 更新狀態：PATCH /api/v1/admin/orders/:id/status，body: { status }
  - 將由後端驗證狀態轉移合法性；狀態為 shipped 會觸發簡訊（mock）
- 匯出 CSV：直接開啟 /api/v1/admin/export/orders.csv（GET）
  - 若 403，請確認角色或是否遺失簽章/JWT

商品管理
- 列表：沿用前台 GET /api/v1/products 或後台可提供同清單
- 新增：POST /api/v1/admin/products（admin）
- 更新：PATCH /api/v1/admin/products/:id（staff 也可，依欄位與權限）
- 刪除：DELETE /api/v1/admin/products/:id（僅 admin）

會員管理
- 列表（含隱碼）：GET /api/v1/admin/users
- 更新（VIP/停權）：PATCH /api/v1/admin/users/:id，body: { vip, disabled }
- 刪除：DELETE /api/v1/admin/users/:id（僅 admin）

優惠券
- 列表：GET /api/v1/admin/coupons
- 啟用/停用：PATCH /api/v1/admin/coupons/:code/toggle

重置假資料（僅 development）
- 按鈕觸發 POST /api/v1/admin/reset
- 若回 403 或 405，代表當前非 development 或已關閉該功能；前端可隱藏按鈕

————————————————————————————————

四、刪除與搬遷清單（對映）

- js/config.js → 後端 /api/v1/public/settings 與 backend/.env 管理
- js/data/*.js → 後端 backend/src/repositories/seed/*.json
- js/db.js → 後端 repositories/db.js 統一存取
- js/auth.js（舊）→ 後端 auth.service.js + auth.routes.js；前端改用 sdk/authClient.js
- js/pricing.js → 後端 pricing.service.js；前端改用 /pricing/quote
- js/payment.js → 後端 payment.service.js（mock）
- js/shop.js → 前端 pages/shop.js（純 UI + 呼叫 API）

————————————————————————————————

五、常見錯誤與對應

- 401/403：缺少或過期的 JWT / 簽章。請重新登入，或確認已載入 authClient 並確實保存 signKey。
- 422：表單驗證錯誤。依回應 message 或 errors 顯示於欄位附近。
- 429（可選）：速率限制。請稍後重試或在 backend 設定放寬（開發用）。
- CORS 錯誤：請以靜態伺服器開啟前端（例：npx serve frontend），並在 backend 設定對應白名單。
- 時間窗/重放錯誤：本機時間飄移過大或 nonce 重複。調整 SIGNKEY_CLOCK_SKEW_MS 或確保裝置時間正確。

參考
- 後端 API 清單：references/api-inventory.md
- 簽章規格：references/sign-key.md
- 架構說明：references/architecture.md
- 設定與環境切換：references/config-guide.md