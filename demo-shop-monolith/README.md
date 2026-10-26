# 海螺小舖（前後端未分離 Demo）

這是一個**刻意沒有做前後端分離**的電商網站，用來測試 Hailuo SplitKit。
所有資料、商業邏輯、金鑰都放在前端，直接雙擊 `index.html` 即可執行（不需要伺服器）。

## 頁面

- `index.html`：前台商店（搜尋、分類、排序、購物車、優惠碼、結帳、我的訂單）
- `login.html`：登入 / 註冊
- `admin.html`：後台（營運報表、訂單、商品、會員、優惠券管理）

測試帳號：`amy / amy2025`（VIP）、`bob / bob12345`、`admin / admin123`、`staff / staff2025`

## 應該被拆成後端 API 的部分

| 位置 | 問題 |
|------|------|
| `js/config.js` | 金流 secret key、簡訊 key、資料庫連線字串、後台萬用密碼寫死在前端 |
| `js/data/*.js` | 商品、會員（含明碼密碼）、訂單、優惠券假資料 |
| `js/db.js` | 用 localStorage 當資料庫 |
| `js/auth.js` | 登入驗證、註冊、角色權限、偽 token 都在前端 |
| `js/pricing.js` | 價格、VIP 折扣、優惠券驗證、運費與稅金計算 |
| `js/shop.js` | 商品查詢、庫存檢查與扣除、建立訂單、取消訂單退庫存 |
| `js/payment.js` | 前端直接帶 secret key 呼叫金流 |
| `js/admin.js` | 營收/毛利統計、訂單狀態變更、會員停權、商品 CRUD、CSV 匯出 |

在後台按「重置假資料」可恢復預設資料。
