# 前後端簽章規格（HMAC-SHA256）

目的
- 防止請求被竄改與重放，確保前端呼叫後端 API 的完整性與時效性。
- 實作位置（後端）：templates/backend/src/middlewares/signKey.js、templates/backend/src/config/signkey.js、templates/backend/src/utils/crypto.js、templates/backend/src/utils/nonce-store.js
- 實作位置（前端）：templates/frontend/sdk/apiClient.js、templates/frontend/sdk/authClient.js

總覽
- 演算法：HMAC-SHA256
- 簽名字串格式：timestamp|nonce|method|path|bodySha256
  - timestamp：毫秒級 Unix 時間（Number.toString()）
  - nonce：高熵隨機字串（建議 16~24 bytes base64url/hex）
  - method：HTTP 方法大寫（GET/POST/…）
  - path：URL 路徑（含查詢字串），不含網域與 fragment，例如 /api/v1/products?keyword=phone&page=1
  - bodySha256：HTTP Request Body 的 SHA-256 十六進位小寫（若無 body，對空字串計算）
- HTTP Headers
  - X-Sign-Timestamp：timestamp
  - X-Sign-Nonce：nonce
  - X-Signature：簽章值（hex 或 base64；本模板預設 hex）
  - X-Sign-KeyId：簽章使用的 session signKey 的 keyId
- 有效時間窗：預設 5 分鐘（可於 SIGNKEY_WINDOW_MS 調整）
- 防重放：nonce 伺服器儲存，TTL 預設等同時間窗或單獨設定 NONCE_TTL_MS
- 路由白名單（預設不檢查簽章）：/api/v1/public/settings、/api/v1/auth/login、/api/v1/auth/register（可於 config 調整）
- 開關：SIGNKEY_ENABLED=true/false（於 .env 或 templates/backend/src/config/signkey.js 匯入）

Header 詳細
- X-Sign-Timestamp：以伺服器時間為準驗證時間窗；允許時鐘偏移（config.clockSkewMs）
- X-Sign-Nonce：單次使用；伺服器以 nonce-store（記憶體，可替換 Redis）記錄 TTL
- X-Signature：HMAC(payload, sessionSecret)；payload 見下方「簽名字串」
- X-Sign-KeyId：對應伺服器保存的 session signKey（僅存雜湊或加密後秘鑰）；密鑰本身僅首次簽發回傳給前端

簽名字串與 bodySha256
- bodySha256 計算方式：
  - 假設 bodyRaw 為傳送前序列化後的字串（如 JSON.stringify(payload)）
  - digest = sha256(bodyRaw)；以十六進位小寫表示
  - GET/DELETE 等無 body 的請求，以空字串計算
- canonical string：
  - `${timestamp}|${nonce}|${method.toUpperCase()}|${path}|${bodySha256}`
  - path 必須包含查詢字串（若有）；大小寫與編碼需與實際請求一致（避免前後端不一致）

有效時間窗與防重放
- 時間窗：伺服器接受 abs(now - timestamp) <= SIGNKEY_WINDOW_MS + clockSkewMs
- Nonce：每個 (keyId, nonce) 僅能使用一次；使用後立即標記；TTL 預設 NONCE_TTL_MS
- 驗證失敗返回：
  - 401：缺少簽章或金鑰無效
  - 403：簽章不符、逾時或重放（nonce 已用）

Session signKey 生命週期
- 核發（於登入/註冊成功）
  - 路由：POST /api/v1/auth/login、/api/v1/auth/register
  - 回傳結構（示例）：
    - { accessToken, user, signKey: { keyId, secret, expiresAt } }
  - 伺服器保存 signKeySecret 的雜湊（或使用 KMS 加密），並與使用者 session 綁定
  - 秘鑰 secret 僅在核發時回傳一次，前端需安全保存於 memory（或 sessionStorage）
- 使用
  - 所有不在白名單的路由，均需同時附上 Authorization: Bearer <JWT> 與簽章 headers
- 撤銷與過期
  - 登出：POST /api/v1/auth/logout 伺服器撤銷該 keyId
  - 自動過期：依 signKey.expiresAt（短效，預設 2 小時，可於 config 調整）
- 輪替
  - 可於後端提供 rotate 端點（非必須）；或於下次登入重新核發

後端實作（重點）
- 中介層：templates/backend/src/middlewares/signKey.js
  - 白名單判斷：/public/settings、/auth/login、/auth/register（可在 config.signKey.whitelistRoutes 擴充）
  - 擷取 headers 與原始 path、method、bodyRaw（需在 JSON parser 後保留原序列字串或重建一致字串）
  - 重新計算 bodySha256 與 canonical string，使用 sessionSecret 驗證 HMAC（utils/crypto.js）
  - 時間窗、nonce 檢查（utils/nonce-store.js）
  - 驗證通過後放行；失敗回 401/403，並透過 middlewares/error.js 統一輸出
- 組態：templates/backend/src/config/signkey.js
  - enabled、algo、windowMs、clockSkewMs、nonceTtlMs、whitelistRoutes、headerNames
- 建議：伺服器儲存 sessionSecret 的雜湊（例如 sha256(secret)），驗證時以 PBKDF 或 HMAC 以防內部洩漏（本模板示範以雜湊儲存）

前端實作（重點）
- 通用 client：templates/frontend/sdk/apiClient.js
  - 保存 baseURL、JWT、signKey（keyId、secret、expiresAt）
  - 每次請求：
    - 取 path（包含 queryString）
    - 以 JSON.stringify(body || {}) 作為序列基準（GET 則空字串）
    - 計算 bodySha256（SHA-256 hex）
    - 生成 timestamp、nonce，組合 canonical string 並用 signKey.secret 做 HMAC-SHA256（hex）
    - 設定 headers：X-Sign-Timestamp、X-Sign-Nonce、X-Signature、X-Sign-KeyId、Authorization
  - 錯誤處理：若回 401 且為簽章錯誤，嘗試提示重新登入（避免無限重試）

最小可行範例（簽章計算，前端）
- 以下邏輯已內建於 templates/frontend/sdk/apiClient.js，節錄示意：

```js
// 以 SubtleCrypto 或 fallback 計算 SHA-256/HMAC-SHA256（已在 apiClient.js 實作）
const timestamp = Date.now().toString();
const nonce = crypto.getRandomValues(new Uint8Array(12)).reduce((s,b)=>s+('0'+b.toString(16)).slice(-2),'');
const method = 'GET';
const path = '/api/v1/products?keyword=phone';
const bodyRaw = ''; // GET
const bodySha = await sha256Hex(bodyRaw);
const payload = `${timestamp}|${nonce}|${method}|${path}|${bodySha}`;
const signature = await hmacSha256Hex(signKey.secret, payload);

fetch(`${baseURL}${path}`, {
  method,
  headers: {
    'X-Sign-Timestamp': timestamp,
    'X-Sign-Nonce': nonce,
    'X-Signature': signature,
    'X-Sign-KeyId': signKey.keyId,
    'Authorization': `Bearer ${jwt}`
  }
});
```

cURL 範例（示意）
- 假設：
  - baseURL=http://localhost:3000
  - method=POST
  - path=/api/v1/pricing/quote
  - bodyRaw='{"items":[{"id":1,"qty":2}]}'
  - timestamp=1730000000000
  - nonce=ab12cd34ef56
  - signKey.secret=s3cr3t
- 計算 bodySha256 與簽章（Node.js one-liner）：
  - node -e "const c=require('crypto');const body='{\"items\":[{\"id\":1,\"qty\":2}]}';const sha=c.createHash('sha256').update(body).digest('hex');const p=`1730000000000|ab12cd34ef56|POST|/api/v1/pricing/quote|${sha}`;const sig=c.createHmac('sha256','s3cr3t').update(p).digest('hex');console.log(sha,p,sig)"
- 發送請求（把上一步輸出的 sig 代入）：
  - curl -X POST 'http://localhost:3000/api/v1/pricing/quote' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer <JWT>' \
    -H 'X-Sign-Timestamp: 1730000000000' \
    -H 'X-Sign-Nonce: ab12cd34ef56' \
    -H 'X-Signature: <sig>' \
    -H 'X-Sign-KeyId: <keyId>' \
    -d '{"items":[{"id":1,"qty":2}]}'

與 JWT 的關係
- 簽章驗證與 JWT 驗證相輔相成：
  - JWT：驗證身份與角色
  - 簽章：驗證請求未被竄改且具時效性
- 預設規則：除白名單外，所有路由需同時具備有效 JWT 與有效簽章

路由白名單（預設）
- GET /api/v1/public/settings
- POST /api/v1/auth/login
- POST /api/v1/auth/register
- 可於 templates/backend/src/config/signkey.js 的 whitelistRoutes 調整或新增

開發模式建議
- 本地除錯可暫時關閉簽章：.env 設定 SIGNKEY_ENABLED=false
- 或縮短時間窗與 nonce TTL 以便驗證重放防護
- 注意：關閉僅限開發環境，勿於生產環境停用

錯誤碼與訊息（統一錯誤處理輸出）
- 401_signkey_missing：缺少簽章或金鑰
- 401_signkey_key_revoked：金鑰已撤銷或不存在
- 403_signkey_expired：超過有效時間窗
- 403_signkey_nonce_replayed：重放請求（nonce 已使用）
- 403_signkey_mismatch：簽章不一致
- 訊息內容由 templates/backend/src/middlewares/error.js 控制，避免外洩內部細節

相關檔案
- 後端
  - templates/backend/src/config/signkey.js
  - templates/backend/src/middlewares/signKey.js
  - templates/backend/src/utils/crypto.js
  - templates/backend/src/utils/nonce-store.js
- 前端
  - templates/frontend/sdk/apiClient.js
  - templates/frontend/sdk/authClient.js

驗收清單
- 可於登入後取得 signKey（keyId + secret），且後端僅儲存雜湊
- 白名單路由不需簽章；其他路由缺簽章即 401
- 時間超窗或重放回應 403，nonce-store 有紀錄
- 前端更換 baseURL、重新整理頁面後，簽章仍能正確生成並通過驗證