/*
 * CSV 轉換工具（支援 UTF-8 BOM）
 *
 * 功能
 * - 將 Array<Object> 或 Array<Array> 轉為 CSV 字串
 * - 具備欄位順序控制、值轉字串與必要轉義（逗號、換行、雙引號）
 * - 可選擇是否加入 UTF-8 BOM（預設讀取 config.csv.withBOM）
 * - 內建回應輔助 sendCsv(res, filename, rows, options)
 *
 * 使用範例（控制器內）：
 *   const { toCSV, sendCsv } = require('../utils/csv');
 *   const rows = [{ id: 1, name: 'Amy' }, { id: 2, name: 'Bob' }];
 *   const csv = toCSV(rows, { columns: ['id', 'name'], withBOM: true });
 *   // 或直接：
 *   return sendCsv(res, 'users.csv', rows, { columns: ['id','name'] });
 */

const config = require('../config');

function toCSV(rows, opts = {}) {
  const options = {
    delimiter: opts.delimiter || ',',
    newline: opts.newline || '\n',
    withBOM: typeof opts.withBOM === 'boolean' ? opts.withBOM : !!(config && config.csv && config.csv.withBOM),
    columns: Array.isArray(opts.columns) ? opts.columns.slice() : null, // 陣列或 null
    header: opts.header !== false, // 預設輸出表頭
    bomChar: '\ufeff',
  };

  if (!Array.isArray(rows)) rows = [];
  if (rows.length === 0) {
    // 若無資料且無 columns，回傳空字串或僅回傳 BOM（若指定）
    const headerLine = options.columns ? joinCsvLine(options.columns, options.delimiter) + options.newline : '';
    const data = (options.header ? headerLine : '');
    return options.withBOM ? options.bomChar + data : data;
  }

  // 決定 columns 與資料列正規化
  let columns = options.columns;
  const first = rows[0];

  if (!columns) {
    if (Array.isArray(first)) {
      // rows: Array<Array>，不輸出表頭（除非自訂 columns）
      columns = null;
      options.header = false;
    } else if (isPlainObject(first)) {
      columns = Object.keys(
        rows.reduce((acc, obj) => Object.assign(acc, obj || {}), {})
      );
    } else {
      // 其他型別：一律轉字串單欄輸出
      columns = ['value'];
      rows = rows.map((v) => ({ value: v }));
    }
  }

  let out = '';
  if (options.withBOM) out += options.bomChar;

  if (options.header && columns && columns.length) {
    out += joinCsvLine(columns, options.delimiter) + options.newline;
  }

  if (Array.isArray(first)) {
    // 直接輸出每列
    for (const arr of rows) {
      out += joinCsvLine(arr.map(toCell), options.delimiter) + options.newline;
    }
  } else {
    for (const obj of rows) {
      const line = (columns || []).map((c) => toCell(obj ? obj[c] : ''));
      out += joinCsvLine(line, options.delimiter) + options.newline;
    }
  }

  return out;
}

function toCell(v) {
  if (v == null) return '';
  if (v instanceof Date) return toISO(v);
  if (typeof v === 'object') v = JSON.stringify(v);
  return String(v);
}

function joinCsvLine(items, delimiter) {
  return items.map((s) => csvEscape(String(s), delimiter)).join(delimiter);
}

function csvEscape(s, delimiter) {
  // 需要引號的條件：包含逗號/分隔符、換行或雙引號
  const needQuote = s.includes(delimiter) || s.includes('\n') || s.includes('\r') || s.includes('"');
  if (!needQuote) return s;
  // 內部雙引號以 "" 轉義
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

function toISO(d) {
  try {
    return new Date(d).toISOString();
  } catch {
    return String(d);
  }
}

// 直接輸出為下載回應
function sendCsv(res, filename, rows, opts = {}) {
  const csv = toCSV(rows, opts);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(filename || 'export.csv')}"`);
  res.send(csv);
}

function sanitizeFilename(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlainObject(o) {
  return Object.prototype.toString.call(o) === '[object Object]';
}

module.exports = {
  toCSV,
  sendCsv,
};