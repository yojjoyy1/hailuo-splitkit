function extractJson(text) {
  let body = String(text || '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fenced && fenced[1].trim().startsWith('{')) body = fenced[1].trim();

  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('AI 回應中找不到 JSON');
  return JSON.parse(body.slice(start, end + 1));
}

function sanitizePath(p) {
  const clean = String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\/+/, '')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    // Windows 不允許的檔名字元、結尾的點或空白、保留裝置名稱
    .map((seg) => seg.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || '_')
    .map((seg) => (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(seg) ? `_${seg}` : seg))
    .join('/');
  return clean;
}

function stripWholeFence(path, content) {
  if (/\.(md|mdx)$/i.test(path)) return content;
  const match = /^```[\w.+-]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(content.trim());
  return match ? match[1] : content;
}

/**
 * 解析 AI 回傳的檔案區塊：
 * <<<FILE path="src/app.js">>>
 * ...內容...
 * <<<END FILE>>>
 * 未結束的區塊（輸出被截斷）不會被回傳。
 */
function parseFileBlocks(text) {
  const files = [];
  const re = /<<<FILE path="([^"]+)">>>\r?\n([\s\S]*?)\r?\n?<<<END FILE>>>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const path = sanitizePath(m[1]);
    if (!path) continue;
    files.push({ path, content: stripWholeFence(path, m[2]) });
  }
  return files;
}

module.exports = { extractJson, parseFileBlocks, sanitizePath };
