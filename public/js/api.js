async function handle(res) {
  if (res.ok) return res;
  let message = `HTTP ${res.status}`;
  try {
    const data = await res.json();
    message = data.error || message;
  } catch { /* 非 JSON 錯誤 */ }
  const err = new Error(message);
  err.status = res.status;
  throw err;
}

export async function getConfig() {
  const res = await handle(await fetch('/api/config'));
  return res.json();
}

export async function getKeys() {
  const res = await handle(await fetch('/api/keys'));
  return res.json();
}

export async function putKeys(body) {
  const res = await handle(
    await fetch('/api/keys', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return res.json();
}

export async function postJson(url, body, signal) {
  const res = await handle(
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  );
  return res.json();
}

export async function postForBlob(url, body) {
  const res = await handle(
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return res.blob();
}
