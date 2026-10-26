# 海螺小舖（前後端已分離）

依 `demo-shop-fullstack-split` Skill，從 `demo-shop-monolith` 拆出可獨立啟動的後端 API 與改寫後前端。

## 啟動

後端（本機預設 http://127.0.0.1:3000；埠被占用時改 `.env` 的 `PORT`）：

```bash
cd backend
cp .env.example .env
npm install
npm start
```

前端（另開一個終端，靜態伺服器）。請在 **`demo-shop-fullstack` 根目錄** 執行：

```bash
npx --yes serve frontend -l 3456
```

若終端已經在 `frontend` 資料夾裡，改跑：

```bash
npx --yes serve . -l 3456
```

3456 被占用時，不要用它自動換的埠（例如 56988），先關掉占用的程式，或改 `-l 3457`。

瀏覽器開啟 http://127.0.0.1:3456

前端三個 HTML 裡的 `window.DS_API_BASE` 需與後端 `PORT` 一致（目前是 `http://127.0.0.1:3000`）。

測試帳號：`amy / amy2025`（VIP）、`bob / bob12345`、`admin / admin123`、`staff / staff2025`

詳細說明見 `docs/index.html`。
