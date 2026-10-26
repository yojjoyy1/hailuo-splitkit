class AIError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function readError(res) {
  const raw = await res.text();
  try {
    const data = JSON.parse(raw);
    return data.error?.message || data.message || raw;
  } catch {
    return raw.slice(0, 500);
  }
}

module.exports = { AIError, readError };
