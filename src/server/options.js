const DEFAULT_ARCHITECTURE =
  '分類乾淨整齊即可：依職責分層（routes / controllers / services / repositories / middlewares / config / utils），' +
  '每個業務模組獨立資料夾，命名一致，好閱讀、好維護、好擴充。';

/**
 * 將前端表單的選項整理成明確的規格，補上所有預設值。
 */
function normalizeOptions(raw, config) {
  const o = raw || {};

  const languageId = o.language?.id || 'nodejs';
  const langDef = config.languages.find((l) => l.id === languageId) || config.languages[0];
  const languageLabel =
    languageId === 'other' ? (o.language?.custom || '').trim() || 'Node.js' : langDef.label;

  let framework;
  const fwValue = o.framework?.value;
  if (fwValue === '__custom__') {
    framework = (o.framework?.custom || '').trim() || '無框架';
  } else if (fwValue && langDef.frameworks.includes(fwValue)) {
    framework = fwValue;
  } else {
    framework = langDef.defaultFramework;
  }

  const sign = o.signKey || {};
  const signKey = { enabled: !!sign.enabled, mode: sign.mode === 'custom' ? 'custom' : 'auto' };
  if (signKey.enabled && signKey.mode === 'custom') {
    Object.assign(signKey, {
      algorithm: sign.algorithm || 'HMAC-SHA256',
      headerName: sign.headerName || 'X-Sign',
      timestampHeader: sign.timestampHeader || 'X-Timestamp',
      nonceHeader: sign.nonceHeader || 'X-Nonce',
      expireSeconds: Number(sign.expireSeconds) || 300,
      secret: sign.secret || '',
      rule: (sign.rule || '').trim(),
    });
  }

  const sec = o.security || {};
  const securityItems = (sec.items || [])
    .map((id) => config.securityItems.find((s) => s.id === id)?.label)
    .filter(Boolean);
  const security = {
    enabled: !!sec.enabled,
    items: securityItems,
    custom: (sec.custom || '').trim(),
  };

  return {
    languageId,
    language: languageLabel,
    framework,
    signKey,
    security,
    splitScope: o.splitScope === 'fullstack' ? 'fullstack' : 'backend',
    targetDescription: (o.targetDescription || '').trim(),
    architecture: (o.architecture || '').trim() || DEFAULT_ARCHITECTURE,
    notes: (o.notes || '').trim(),
  };
}

function describeOptions(opts) {
  const lines = [];
  if (opts.splitScope === 'fullstack') {
    lines.push('- 分離範圍：前後端一起分離。必須同時產出「可執行的後端 API」與「已改寫完成、可直接呼叫 API 的前端」，兩者放在同一個 ZIP，解壓後就能前後端分開跑。');
  } else {
    lines.push('- 分離範圍：只分離後端。只產出獨立後端 API 專案與給原前端用的 SDK／改接說明，不要產出整份改寫後的前端網頁。');
  }
  lines.push(`- 後端語言：${opts.language}`);
  lines.push(
    `- 目標框架：${opts.framework}${opts.framework === '無框架' ? '（使用該語言原生標準函式庫，不依賴 Web 框架）' : ''}`
  );

  if (!opts.signKey.enabled) {
    lines.push('- 前後端簽章驗證（signKey）：不需要');
  } else if (opts.signKey.mode === 'auto') {
    lines.push(
      '- 前後端簽章驗證（signKey）：需要，由你採用業界常見預設設計（例如 HMAC-SHA256，簽章內容含 timestamp + nonce + method + path + body，' +
        '設定有效時間窗並防重放），並在 config 中可開關與調整。'
    );
  } else {
    const s = opts.signKey;
    lines.push('- 前後端簽章驗證（signKey）：需要，使用者自訂規格如下（必須完全遵守）：');
    lines.push(`  - 演算法：${s.algorithm}`);
    lines.push(`  - 簽章 Header：${s.headerName}`);
    lines.push(`  - 時間戳 Header：${s.timestampHeader}`);
    lines.push(`  - Nonce Header：${s.nonceHeader}`);
    lines.push(`  - 有效秒數：${s.expireSeconds}`);
    lines.push(
      `  - Secret：${s.secret ? '使用者已提供，請放進 .env 的範例值中，程式碼內不得寫死' : '未提供，請用環境變數佔位'}`
    );
    if (s.rule) lines.push(`  - 簽章組成規則：${s.rule}`);
  }

  if (!opts.security.enabled) {
    lines.push('- 資安防護：未特別要求（仍需基本的錯誤處理與不外洩敏感資訊）');
  } else {
    lines.push('- 資安防護：需要，項目如下，且每一項都要能在 config 中開關/調整：');
    const items = opts.security.items.length ? opts.security.items : ['由你依專案評估選擇必要的防護'];
    items.forEach((i) => lines.push(`  - ${i}`));
    if (opts.security.custom) lines.push(`  - 其他要求：${opts.security.custom}`);
  }

  lines.push(`- 專案架構要求：${opts.architecture}`);
  return lines.join('\n');
}

module.exports = { normalizeOptions, describeOptions, DEFAULT_ARCHITECTURE };
