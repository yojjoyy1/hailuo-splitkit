const { AIError, readError } = require('./errors');

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { media_type: match[1], data: match[2] };
}

async function call(options, input, signal) {
  const content = [];
  for (const img of input.images || []) {
    const parsed = parseDataUrl(img.dataUrl);
    if (parsed) content.push({ type: 'image', source: { type: 'base64', ...parsed } });
  }
  content.push({ type: 'text', text: input.text });

  const res = await fetch(`${options.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': options.apiVersion || '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens,
      system: input.system,
      messages: [{ role: 'user', content }],
    }),
    signal,
  });

  if (!res.ok) {
    throw new AIError(`Anthropic 錯誤（${res.status}）：${await readError(res)}`, res.status);
  }

  const data = await res.json();
  return {
    text: (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''),
    truncated: data.stop_reason === 'max_tokens',
  };
}

module.exports = { call };
