const { AIError, readError } = require('./errors');

async function request(options, body, signal) {
  return fetch(`${options.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function call(options, input, signal) {
  const content = [{ type: 'text', text: input.text }];
  for (const img of input.images || []) {
    content.push({ type: 'image_url', image_url: { url: img.dataUrl } });
  }

  const body = {
    model: options.model,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content },
    ],
    max_completion_tokens: options.maxTokens,
  };

  let res = await request(options, body, signal);

  // 部分 OpenAI 相容服務只認得舊參數 max_tokens
  if (res.status === 400) {
    const message = await readError(res);
    if (/max_completion_tokens/i.test(message)) {
      delete body.max_completion_tokens;
      body.max_tokens = options.maxTokens;
      res = await request(options, body, signal);
    } else {
      throw new AIError(`OpenAI 錯誤：${message}`, 400);
    }
  }

  if (!res.ok) {
    throw new AIError(`OpenAI 錯誤（${res.status}）：${await readError(res)}`, res.status);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  return {
    text: choice?.message?.content || '',
    truncated: choice?.finish_reason === 'length',
  };
}

module.exports = { call };
