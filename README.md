# Hailuo SplitKit

本機網頁工具：上傳整份專案資料夾，用 OpenAI / Anthropic 分析程式，拆成前後端分離，或只切出後端 API。Mac 與 Windows 都可雙擊啟動。

> 原始碼可公開在 GitHub，但**不是** MIT / Apache 這類完全開源授權。詳見 [授權](#授權)。

## 你會得到什麼

- **切割 API 專案**：可執行的後端（可選一併改寫前端），含設定、`.env.example`、啟用說明網頁
- **建立 SKILL 架構**：給 Cursor Agent 用的 `SKILL.md` + 參考文件 + 範本，之後可對別的專案再拆一次

支援 Node.js、PHP、Java、C++、Golang（或其他手填語言），可勾選簽章、資安、分層架構等選項。

## 環境需求

- [Node.js 18.17](https://nodejs.org) 或以上
- 一組 OpenAI 或 Anthropic API Key

## 啟動

| 系統 | 做法 |
| --- | --- |
| Windows | 雙擊 `啟動.bat` 或 `start.bat` |
| macOS | 雙擊 `啟動.command` 或 `start.command` |
| 終端（任一系統） | `npm install` 後執行 `npm start` |

macOS 若提示無法打開，先在專案目錄執行：

```bash
chmod +x 啟動.command start.command
```

啟動後瀏覽器開 [http://127.0.0.1:3000](http://127.0.0.1:3000)。關掉啟動視窗即停止服務。

```bash
npm start            # 預設 http://127.0.0.1:3000
npm run launch       # 同上，並自動打開瀏覽器
npm run dev          # 改程式自動重啟
npm run start:prod   # 讀取 config/production.json
```

臨時改埠號（不要用 `NODE_ENV=...` 這種寫法，Windows CMD 不相容）：

```bash
# macOS / Linux
PORT=8080 npm start

# Windows PowerShell
$env:PORT=8080; npm start

# Windows CMD
set PORT=8080&& npm start
```

## API Key（存在 `config.js`）

金鑰寫在專案根目錄 **`config.js`**，**不存**瀏覽器 localStorage。網頁「API Key 管理」儲存後也會寫回這個檔。

第一次可複製範本：

```bash
# macOS / Linux
cp config.example.js config.js

# Windows
copy config.example.js config.js
```

```js
module.exports = {
  activeKeyId: 'openai-main',
  keys: [
    {
      id: 'openai-main',
      provider: 'openai', // openai | anthropic
      name: 'OpenAI',
      apiKey: 'sk-...',
      model: 'gpt-4.1',
      baseUrl: '',
      maxTokens: null,
    },
  ],
};
```

`config.js` 已列入 `.gitignore`，請勿把填好金鑰的檔案推上 GitHub。

## 使用流程（網頁）

1. 選擇主專案資料夾（拖曳或瀏覽）
2. 新增至少一組 API Key，或確認 `config.js` 已有 Key
3. 選分離範圍：只分離後端 / 前後端一起
4. 選填：截圖或文字說明要切哪裡、簽章、語言框架、資安、架構、備註
5. 按「切割 API 專案」或「建立 SKILL 架構」，完成後下載 ZIP

更細的設定說明見啟動後的「啟用說明」頁（`/guide.html`）。

## 專案結構

```
hailuo-splitkit/
├── 啟動.bat / start.bat          Windows 雙擊啟動
├── 啟動.command / start.command  macOS 雙擊啟動
├── server.js                     進入點
├── config.js                     API Key（本機、不進 Git）
├── config.example.js             Key 範本
├── config/                       伺服器預設設定（埠號、模型清單等）
├── public/                       網頁介面
├── src/server/                   本機 API 與 AI 轉送
├── scripts/launch.js             跨平台啟動（安裝依賴、開瀏覽器）
├── demo-shop-monolith/           未分離的示範商店
└── 分離後/                       已分離的示範產出
```

## 上 GitHub 要注意

公開原始碼 ≠ 放棄權利。這個 repo 已放 `LICENSE`，GitHub 才會顯示授權條款。

請確認：

1. 根目錄有 `LICENSE` 與本 `README.md`（已備妥）
2. `config.js` **不要**進版控（已在 `.gitignore`）
3. `node_modules/` 不要上傳
4. `package.json` 維持 `"private": true`，避免被當成可任意發布的 npm 套件
5. 建立 repo 時選 **Public** 或 **Private** 都可以；授權與是否公開是兩件事

推上 GitHub 後，頁面右側應出現 **PolyForm Noncommercial 1.0.0**。若顯示 Unknown，確認 `LICENSE` 檔名與內文未被改壞。

## 授權

本專案採用 **[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)**，完整條文見 [`LICENSE`](LICENSE)。

這**不是** MIT、Apache 2.0、GPL 這類 OSI 開源授權。

| 別人可以 | 別人不能 |
| --- | --- |
| 查看原始碼、個人學習、非商業使用、依條款修改與再散布 | 商業使用、當成產品販售、用本工具幫客戶做商業專案（需另外取得授權） |

商業使用請先取得著作權人同意。

Copyright 2026 yojjoyy1
