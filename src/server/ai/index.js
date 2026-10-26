const openai = require('./openai');
const anthropic = require('./anthropic');
const { AIError } = require('./errors');

const providers = { openai, anthropic };

// AbortSignal.any 需 Node 20.3+，舊版改用手動合併
function anySignal(signals) {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

/**
 * 統一的 AI 呼叫介面
 * @param {object} ai     { provider, apiKey, model, baseUrl, maxTokens }
 * @param {object} input  { system, text, images: [{ dataUrl }] }
 * @param {object} ctx    { config, signal }
 * @returns {Promise<{ text: string, truncated: boolean }>}
 */
async function callAI(ai, input, { config, signal }) {
  const impl = providers[ai?.provider];
  if (!impl) throw new AIError(`不支援的 AI 供應商：${ai?.provider}`, 400);
  if (!ai.apiKey) throw new AIError('缺少 API Key', 400);

  const providerConfig = config.ai.providers[ai.provider];
  const options = {
    apiKey: ai.apiKey,
    model: ai.model || providerConfig.defaultModel,
    baseUrl: (ai.baseUrl || providerConfig.baseUrl).replace(/\/+$/, ''),
    maxTokens: Number(ai.maxTokens) || config.ai.defaultMaxOutputTokens,
    apiVersion: providerConfig.apiVersion,
  };

  const timeout = AbortSignal.timeout(config.ai.timeoutMs);
  const combined = signal ? anySignal([signal, timeout]) : timeout;

  try {
    return await impl.call(options, input, combined);
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err.name === 'TimeoutError') throw new AIError('AI 回應逾時，請稍後再試或調高 ai.timeoutMs', 504);
    if (err.name === 'AbortError') throw new AIError('請求已取消', 499);
    throw new AIError(`AI 呼叫失敗：${err.message}`, 502);
  }
}

module.exports = { callAI, AIError };
