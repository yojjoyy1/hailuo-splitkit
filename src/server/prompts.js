const { describeOptions } = require('./options');

const FILE_BLOCK_FORMAT = `輸出格式（嚴格遵守，不要輸出任何其他說明文字）：
<<<FILE path="相對路徑">>>
檔案完整內容（不要再用 \`\`\` 包起來）
<<<END FILE>>>
每個檔案一個區塊，依序輸出。`;

function renderProject(project, maxChars) {
  const tree = (project.tree || []).join('\n');
  let used = 0;
  const parts = [];
  const omitted = [];
  for (const f of project.files || []) {
    const block = `\n----- FILE: ${f.path} -----\n${f.content}\n`;
    if (used + block.length > maxChars) {
      omitted.push(f.path);
      continue;
    }
    used += block.length;
    parts.push(block);
  }
  return {
    tree,
    contents: parts.join(''),
    omittedNote: omitted.length ? `\n（因長度限制，以下檔案內容未提供：${omitted.join(', ')}）\n` : '',
  };
}

function userIntentSection(opts, imageCount) {
  const lines = ['# 使用者指定的切割範圍'];
  if (opts.targetDescription) lines.push(`文字說明：${opts.targetDescription}`);
  if (imageCount) lines.push(`另附 ${imageCount} 張截圖，標示想切成後端 API 的畫面/功能，請仔細判讀。`);
  if (!opts.targetDescription && !imageCount) {
    lines.push('使用者未指定，請你自行分析：凡是資料存取、商業邏輯、第三方服務呼叫、機敏運算、驗證授權、假資料/寫死資料等應屬後端的部分，都要拆成 API。');
  }
  return lines.join('\n');
}

function notesSection(opts) {
  return opts.notes ? `# 使用者備註（額外背景資訊）\n${opts.notes}` : '';
}

/* ------------------------------ API 專案模式 ------------------------------ */

const API_SYSTEM = `你是資深軟體架構師，專長是把前後端耦合的專案拆解成「前端 + 獨立後端 API 服務」。
你會精準辨識專案中屬於後端的邏輯（資料存取、商業規則、第三方 API、金鑰/機敏資料、驗證授權、檔案處理、寫死的假資料等），
設計 RESTful API，並依使用者選擇產出「只有後端」或「已改寫完成的前端 + 後端」。
所有說明文件、註解一律使用繁體中文；程式碼識別字使用英文。`;

function apiRequirements(opts, maxFiles) {
  const fullstack = opts.splitScope === 'fullstack';
  const requiredFiles = fullstack
    ? `3. 必須採「同一 ZIP、前後端分資料夾」的結構（路徑可依語言慣例微調，但用途必須存在）：
   - README.md：整包簡介、如何同時啟動前端與後端、目錄說明。
   - docs/index.html：「啟用說明網頁」，單一 HTML 檔、內嵌 CSS、繁體中文，涵蓋前後端安裝、config/.env 每個參數、測試區/正式區切換、模組與 mock 開關、簽章與前端串接、API 一覽、部署與常見問題。
   - backend/：獨立後端 API 專案（含 ${opts.language} + ${opts.framework} 的套件清單、.env.example、config、routes / controllers / services）。
   - frontend/：已改寫完成、可直接執行的前端。必須：
     - 保留原專案的畫面與操作流程（看起來像同一套網站）。
     - 刪除寫死在前端的資料、金鑰、商業邏輯、localStorage 假資料庫。
     - 透過 frontend/sdk/（或同等 API 封裝）呼叫後端，可設定 baseURL 並切換測試區/正式區${opts.signKey.enabled ? '，並內建簽章產生邏輯' : ''}。
     - 錯誤處理改用 API 回傳格式。
   - 不要再產出 FRONTEND_MIGRATION.md（前端已經改好，不必再給對照表）。`
    : `3. 必須包含以下檔案（路徑可依語言慣例微調，但用途必須存在）：
   - README.md：專案簡介、目錄結構、快速開始。
   - docs/index.html：「啟用說明網頁」，單一 HTML 檔、內嵌 CSS、繁體中文，內容涵蓋：環境需求、安裝、設定 config/.env 每個參數的意義、如何切換測試區/正式區、如何開關各 API 模組與 mock、簽章規則與前端串接方式（若有）、API 一覽表（method / path / 說明 / 參數 / 回應範例）、部署與常見問題。
   - .env.example：列出所有環境變數並附註解。
   - FRONTEND_MIGRATION.md：逐一列出原專案中哪些檔案/程式片段要改成呼叫新 API、改法與對照範例。
   - frontend-sdk/：給原前端使用的 API 呼叫封裝（依原前端技術選用語言，通常是 JS/TS），可設定 baseURL 並切換測試區/正式區${opts.signKey.enabled ? '，並內建簽章產生邏輯' : ''}。
   - 不要產出整份改寫後的前端網頁（使用者這次只要後端）。`;

  return `# 產出專案的硬性要求
1. 後端使用 ${opts.language} + ${opts.framework} 實作，遵循該語言/框架的慣例與最佳實務。
2. 高度參數化：所有可調整的東西都放在 config（例如 config/ 目錄或該框架慣用的設定機制）與 .env 中，不得寫死在程式碼。至少包含：
   - 環境切換：development（開發）、staging（測試區）、production（正式區），以環境變數（如 APP_ENV / NODE_ENV）選擇，各環境有自己的設定檔。
   - 伺服器 host/port、API 路徑前綴與版本（例如 /api/v1）、CORS 來源、日誌等級。
   - 每個 API 模組可獨立開關（feature flag），並可切換「mock 假資料 / 真實資料來源」。
   - 資料庫/外部服務連線資訊、逾時、重試。
   - 簽章驗證與各項資安防護的開關與參數（若有啟用）。
${requiredFiles}
4. 統一的回應格式與錯誤處理、請求日誌、健康檢查端點（如 GET /health）。
5. 檔案總數不超過 ${maxFiles} 個；優先保證可執行與完整，避免空殼檔案。`;
}

function buildApiPlanPrompt({ project, opts, imageCount, maxContextChars, maxFiles }) {
  const p = renderProject(project, maxContextChars);
  const fullstack = opts.splitScope === 'fullstack';
  const task = fullstack
    ? `分析下方專案「${project.name}」，規劃如何同時拆出「獨立後端 API」與「已改寫、改呼叫 API 的前端」，放在同一個專案 ZIP 裡。這一步只需輸出「規劃」，不要輸出程式碼。`
    : `分析下方專案「${project.name}」，規劃如何把後端 API 部分拆成一個獨立的後端專案，達成前後端分離。這一步只需輸出「規劃」，不要輸出程式碼。`;
  const fileOrder = fullstack
    ? 'files 請依「根目錄 README/文件 → 後端設定/核心 → 後端各業務模組 → 前端 SDK → 前端頁面與腳本」的順序排列。frontendChanges 請列出每個原前端檔案將被改寫成哪一個新路徑。'
    : 'files 請依「設定/核心 → 共用中介層 → 各業務模組 → 前端 SDK → 文件」的順序排列。';
  const text = `# 任務
${task}

# 使用者選項
${describeOptions(opts)}

${userIntentSection(opts, imageCount)}

${notesSection(opts)}

${apiRequirements(opts, maxFiles)}

# 專案檔案樹（含未提供內容的檔案）
${p.tree}

# 檔案內容
${p.contents}${p.omittedNote}

# 輸出格式
只輸出一個 JSON 物件（不要 markdown、不要其他文字），結構如下：
{
  "projectName": "${fullstack ? '前後端整包' : '後端專案'}名稱（英文小寫、連字號）",
  "summary": "繁體中文：原專案分析與拆分策略摘要（200 字內）",
  "detectedStack": "原專案技術棧",
  "endpoints": [
    { "method": "GET", "path": "/api/v1/...", "module": "模組名", "description": "說明", "sourceFiles": ["原專案中對應的檔案路徑"] }
  ],
  "architecture": "${fullstack ? '整包（frontend/ + backend/）的目錄樹' : '新後端專案的目錄樹'}（純文字）",
  "files": [
    { "path": "新專案內的相對路徑", "purpose": "此檔案的用途與要包含的重點", "sources": ["需要參考的原專案檔案路徑，可為空陣列"] }
  ],
  "frontendChanges": [
    { "file": "原專案檔案路徑", "change": "${fullstack ? '將改寫成哪個新路徑、如何改成呼叫 API' : '要怎麼改成呼叫 API'}" }
  ],
  "notes": "其他注意事項"
}
${fileOrder}`;

  return { system: API_SYSTEM, text };
}

function buildApiGeneratePrompt({ project, opts, plan, targets, sources, shared }) {
  const text = `# 任務
依照已確定的拆分規劃，為專案「${plan.projectName}」產出指定檔案的完整內容。

# 使用者選項
${describeOptions(opts)}

${notesSection(opts)}

${apiRequirements(opts, plan.files.length)}

# 拆分規劃（JSON）
${JSON.stringify(compactPlan(plan), null, 2)}

# 本次只需要產出這些檔案
${targets.map((t) => `- ${t.path}：${t.purpose}`).join('\n')}

# 已產出的共用檔案（請保持一致：引用的模組名、設定鍵名、函式名稱必須相符）
${renderFiles(shared) || '（尚無）'}

# 原專案「${project.name}」相關原始碼
${renderFiles(sources) || '（無）'}

# 產出要求
- 每個檔案都要完整、可直接使用，不可省略（禁止「...其餘略」之類的寫法）。
- 設定值一律從 config/環境變數讀取。
- 程式碼註解精簡、使用繁體中文。
- docs/index.html 必須是完整美觀的單一 HTML 頁面。
${opts.splitScope === 'fullstack' ? '- 若本次包含 frontend/ 檔案：必須是改寫完成的可執行前端（呼叫後端 API），不是原檔複製，也不是「請自行改這裡」的註解草稿。' : '- 若使用者只要後端：不要產出 frontend/ 整包網頁。'}

${FILE_BLOCK_FORMAT}`;

  return { system: API_SYSTEM, text };
}

/* ------------------------------ SKILL 模式 ------------------------------ */

const SKILL_SYSTEM = `你是 AI Agent Skill 設計專家，熟悉 Cursor / Claude 的 Agent Skills 格式（SKILL.md + YAML frontmatter + 漸進式揭露的參考文件）。
你的任務是為特定專案打造一套前後端分離 Skill，範圍依使用者選擇：只拆後端，或同時產出改寫後的前端與後端。
所有內容使用繁體中文；程式碼識別字使用英文。`;

function skillRequirements(opts, maxFiles) {
  const fullstack = opts.splitScope === 'fullstack';
  const scopeLine = fullstack
    ? '這套 Skill 必須指導 Agent「同時產出可執行的後端 API，以及已改寫、改呼叫 API 的前端」，兩者放在同一個目錄（frontend/ + backend/）。不要只寫前端改接說明就結束。'
    : '這套 Skill 只指導 Agent 拆出獨立後端 API，並附前端改接說明與 SDK；不要讓 Agent 去重寫整份前端網頁。';
  const frontendRef = fullstack
    ? `- references/frontend-rewrite.md：原前端每個檔案要改寫成什麼、新路徑、如何改成呼叫 API、哪些邏輯必須刪除。
   - references/architecture.md：整包目錄（frontend/ + backend/）與後端分層規範（${opts.language} + ${opts.framework}）。`
    : `- references/frontend-migration.md：原前端要修改的位置與改法（只列對照，不重寫整份前端）。
   - references/architecture.md：目標後端專案目錄結構與分層規範（${opts.language} + ${opts.framework}）。`;
  const templates = fullstack
    ? '3. templates/：後端設定檔、入口檔、範例模組，以及前端 SDK 與至少一個已改寫的頁面範本。'
    : '3. templates/：關鍵檔案的範本（例如設定檔、入口檔、範例模組、frontend SDK）。';

  return `# Skill 結構硬性要求
${scopeLine}
1. 根目錄必須有 SKILL.md：
   - 開頭 YAML frontmatter，只含 name（英文小寫與連字號，64 字元內）與 description（第三人稱描述「做什麼」與「何時使用」，含觸發關鍵字，1024 字元內）。
   - 主體精簡（500 行內），包含：目標、前置檢查、逐步工作流程（可勾選的 checklist）、驗證步驟，以及指向參考文件的連結。
   - checklist 必須清楚對應這次的分離範圍（${fullstack ? '後端 + 前端都要產出並驗證' : '只產出後端並驗證'}）。
2. 細節放在一層深的參考文件，例如：
   - references/api-inventory.md：此專案要拆出的 API 一覽（method / path / 來源檔案 / 說明）。
   ${frontendRef}
   - references/config-guide.md：參數化規範，development / staging（測試區）/ production（正式區）切換、模組開關、mock 切換。
   ${opts.signKey.enabled ? '- references/sign-key.md：前後端簽章規格與前後端實作範例。' : ''}
   ${opts.security.enabled ? '- references/security.md：資安防護清單與實作方式。' : ''}
   - references/docs-page.md：產出「啟用說明網頁 docs/index.html」的要求。
${templates}
4. README.md：說明如何安裝這個 Skill（放到專案的 .cursor/skills/<name>/ 或 ~/.cursor/skills/<name>/）與如何觸發。
5. 檔案總數不超過 ${maxFiles} 個。`;
}

function buildSkillPlanPrompt({ project, opts, imageCount, maxContextChars, maxFiles }) {
  const p = renderProject(project, maxContextChars);
  const fullstack = opts.splitScope === 'fullstack';
  const task = fullstack
    ? `分析下方專案「${project.name}」，規劃一套 Agent Skill，讓 AI Agent 能同時拆出獨立後端 API，並改寫前端去呼叫該 API。這一步只輸出規劃。`
    : `分析下方專案「${project.name}」，規劃一套 Agent Skill，讓 AI Agent 能依照使用者選項把此專案的後端 API 拆成獨立專案。這一步只輸出規劃。`;
  const text = `# 任務
${task}

# 使用者選項（Skill 要指導 Agent 依此實作）
${describeOptions(opts)}

${userIntentSection(opts, imageCount)}

${notesSection(opts)}

${skillRequirements(opts, maxFiles)}

# 專案檔案樹
${p.tree}

# 檔案內容
${p.contents}${p.omittedNote}

# 輸出格式
只輸出一個 JSON 物件：
{
  "projectName": "skill 名稱（英文小寫、連字號，例如 ${fullstack ? 'xxx-fullstack-split' : 'xxx-backend-split'}）",
  "summary": "繁體中文：這套 Skill 會做什麼",
  "detectedStack": "原專案技術棧",
  "endpoints": [
    { "method": "GET", "path": "/api/v1/...", "module": "模組名", "description": "說明", "sourceFiles": ["原專案檔案路徑"] }
  ],
  "architecture": "Skill 本身的目錄樹（純文字）",
  "files": [
    { "path": "Skill 內的相對路徑", "purpose": "用途與重點", "sources": ["需參考的原專案檔案路徑"] }
  ],
  "frontendChanges": [],
  "notes": "其他注意事項"
}`;

  return { system: SKILL_SYSTEM, text };
}

function buildSkillGeneratePrompt({ project, opts, plan, targets, sources, shared }) {
  const text = `# 任務
依照已確定的規劃，產出 Agent Skill「${plan.projectName}」中指定檔案的完整內容。

# 使用者選項（Skill 要指導 Agent 依此實作）
${describeOptions(opts)}

${notesSection(opts)}

${skillRequirements(opts, plan.files.length)}

# Skill 規劃（JSON）
${JSON.stringify(compactPlan(plan), null, 2)}

# 本次只需要產出這些檔案
${targets.map((t) => `- ${t.path}：${t.purpose}`).join('\n')}

# 已產出的檔案（保持一致）
${renderFiles(shared) || '（尚無）'}

# 原專案「${project.name}」相關原始碼
${renderFiles(sources) || '（無）'}

# 產出要求
- 內容具體、可操作，引用此專案真實的檔案路徑與 API。
- SKILL.md 的連結使用相對路徑指向 references/ 與 templates/。

${FILE_BLOCK_FORMAT}`;

  return { system: SKILL_SYSTEM, text };
}

/* ------------------------------ 共用 ------------------------------ */

function compactPlan(plan) {
  return {
    projectName: plan.projectName,
    summary: plan.summary,
    endpoints: plan.endpoints,
    architecture: plan.architecture,
    files: plan.files.map((f) => ({ path: f.path, purpose: f.purpose })),
    frontendChanges: plan.frontendChanges,
    notes: plan.notes,
  };
}

function renderFiles(files) {
  return (files || []).map((f) => `\n----- FILE: ${f.path} -----\n${f.content}\n`).join('');
}

const builders = {
  api: { plan: buildApiPlanPrompt, generate: buildApiGeneratePrompt },
  skill: { plan: buildSkillPlanPrompt, generate: buildSkillGeneratePrompt },
};

module.exports = { builders };
