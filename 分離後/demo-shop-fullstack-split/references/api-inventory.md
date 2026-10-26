# API 一覽（demo-shop-fullstack-split）

說明
- 版本前綴：/api/v1
- 簽章：除白名單（/public/settings、/auth/login、/auth/register）外，其他路由預設需 JWT + HMAC-SHA256 簽章；可於 config 調整。
- 權限：customer（一般會員）、staff（員工）、admin（管理員）。
- 來源檔案：指原始 monolith 的邏輯來源，方便對照與搬移。

欄位
- Method：HTTP 方法
- Path：路徑
- Module：所屬模組
- 說明：功能描述
- 來源檔案：原專案參考檔案
- 權限：呼叫所需角色（如未標註特定角色，代表持有有效 JWT 皆可）
- 需要 signKey：是否需要前後端簽章（預設除了白名單，皆為 Yes）

API 列表

1) 公開設定
- Method: GET
- Path: /api/v1/public/settings
- Module: public
- 說明: 提供前端顯示所需公開設定（siteName、currency、taxRate、shipping、vipDiscount 等，不含任何秘密金鑰）
- 來源檔案: js/config.js
- 權限: Public
- 需要 signKey: No

2) 註冊與登入
- Method: POST
- Path: /api/v1/auth/register
- Module: auth
- 說明: 註冊新會員，建立使用者、發送歡迎簡訊、簽發 JWT 與 session signKey
- 來源檔案: js/auth.js
- 權限: Public
- 需要 signKey: No

- Method: POST
- Path: /api/v1/auth/login
- Module: auth
- 說明: 帳密登入；支援 ADMIN_MASTER_PASSWORD；回傳 JWT 與 session signKey（短效）
- 來源檔案: js/auth.js
- 權限: Public
- 需要 signKey: No

- Method: GET
- Path: /api/v1/auth/profile
- Module: auth
- 說明: 取得目前登入者資訊（需 JWT）
- 來源檔案: js/auth.js
- 權限: Authenticated（customer/staff/admin）
- 需要 signKey: Yes

- Method: POST
- Path: /api/v1/auth/logout
- Module: auth
- 說明: 登出（伺服器側撤銷 session signKey）
- 來源檔案: js/auth.js
- 權限: Authenticated（customer/staff/admin）
- 需要 signKey: Yes

3) 商品
- Method: GET
- Path: /api/v1/products
- Module: products
- 說明: 商品查詢（keyword/category/sort），後端執行搜尋/篩選/排序
- 來源檔案: js/shop.js
- 權限: Authenticated（customer/staff/admin）
- 需要 signKey: Yes

- Method: GET
- Path: /api/v1/products/:id
- Module: products
- 說明: 單一商品
- 來源檔案: js/shop.js
- 權限: Authenticated（customer/staff/admin）
- 需要 signKey: Yes

- Method: POST
- Path: /api/v1/admin/products
- Module: products
- 說明: 新增商品（admin）
- 來源檔案: js/admin.js
- 權限: admin
- 需要 signKey: Yes

- Method: PATCH
- Path: /api/v1/admin/products/:id
- Module: products
- 說明: 更新商品欄位（售價、庫存等）（admin/staff 視權限）
- 來源檔案: js/admin.js
- 權限: admin/staff（依欄位限制）
- 需要 signKey: Yes

- Method: DELETE
- Path: /api/v1/admin/products/:id
- Module: products
- 說明: 刪除商品（admin）
- 來源檔案: js/admin.js
- 權限: admin
- 需要 signKey: Yes

4) 優惠與報價
- Method: GET
- Path: /api/v1/coupons/validate
- Module: pricing
- 說明: 驗證優惠碼（code、subtotal、user.vip）
- 來源檔案: js/pricing.js
- 權限: Authenticated（customer/staff/admin）
- 需要 signKey: Yes

- Method: POST
- Path: /api/v1/pricing/quote
- Module: pricing
- 說明: 計算購物車明細、小計、折扣、運費、稅金、總計（搬移 pricing 商業邏輯）
- 來源檔案: js/pricing.js、js/shop.js
- 權限: Authenticated（customer/staff/admin）
- 需要 signKey: Yes

5) 結帳與訂單
- Method: POST
- Path: /api/v1/checkout
- Module: checkout
- 說明: 結帳：庫存檢查與扣除、優惠券核銷遞增、建立訂單、金流代扣（server-side mock）、簡訊通知
- 來源檔案: js/shop.js、js/payment.js
- 權限: customer
- 需要 signKey: Yes

- Method: GET
- Path: /api/v1/orders
- Module: orders
- 說明: 我的訂單列表（依使用者）
- 來源檔案: js/shop.js
- 權限: customer
- 需要 signKey: Yes

- Method: POST
- Path: /api/v1/orders/:id/cancel
- Module: orders
- 說明: 取消訂單並退回庫存（限制狀態，同原邏輯）
- 來源檔案: js/shop.js
- 權限: customer（且須為該訂單擁有者）
- 需要 signKey: Yes

- Method: GET
- Path: /api/v1/admin/orders
- Module: orders
- 說明: 後台訂單查詢（狀態過濾、排序），支援匯出使用
- 來源檔案: js/admin.js
- 權限: admin/staff
- 需要 signKey: Yes

- Method: PATCH
- Path: /api/v1/admin/orders/:id/status
- Module: orders
- 說明: 更新訂單狀態（shipped 觸發簡訊）
- 來源檔案: js/admin.js
- 權限: admin/staff
- 需要 signKey: Yes

6) 匯出
- Method: GET
- Path: /api/v1/admin/export/orders.csv
- Module: export
- 說明: 匯出訂單 CSV（admin/staff）
- 來源檔案: js/admin.js
- 權限: admin/staff
- 需要 signKey: Yes

7) 會員管理
- Method: GET
- Path: /api/v1/admin/users
- Module: users
- 說明: 後台會員列表（隱碼處理）
- 來源檔案: js/admin.js
- 權限: admin/staff
- 需要 signKey: Yes

- Method: PATCH
- Path: /api/v1/admin/users/:id
- Module: users
- 說明: 變更 VIP 與停權（admin）
- 來源檔案: js/admin.js
- 權限: admin
- 需要 signKey: Yes

- Method: DELETE
- Path: /api/v1/admin/users/:id
- Module: users
- 說明: 刪除會員（admin）
- 來源檔案: js/admin.js
- 權限: admin
- 需要 signKey: Yes

8) 優惠券管理
- Method: GET
- Path: /api/v1/admin/coupons
- Module: coupons
- 說明: 優惠券列表（admin/staff）
- 來源檔案: js/admin.js
- 權限: admin/staff
- 需要 signKey: Yes

- Method: PATCH
- Path: /api/v1/admin/coupons/:code/toggle
- Module: coupons
- 說明: 啟用/停用優惠券（admin/staff）
- 來源檔案: js/admin.js
- 權限: admin/staff
- 需要 signKey: Yes

9) 統計
- Method: GET
- Path: /api/v1/admin/stats
- Module: stats
- 說明: 營運統計：營收、毛利、訂單數、平均客單、低庫存、熱銷商品、會員數
- 來源檔案: js/admin.js
- 權限: admin/staff
- 需要 signKey: Yes

10) 開發工具
- Method: POST
- Path: /api/v1/admin/reset
- Module: devtools
- 說明: 重置假資料至 seed（僅 development 可用）
- 來源檔案: js/admin.js、js/db.js、js/data/*
- 權限: admin（且僅在 NODE_ENV=development 開放）
- 需要 signKey: Yes

備註
- 白名單路由（無需 signKey）：/public/settings、/auth/login、/auth/register。
- 若需開放匿名瀏覽商品，可在後端 config 中調整 signKey 白名單或將 /products* 移入豁免清單（開發時亦可關閉 signKey 檢查）。 