// Model clients, configured once from config.js.
import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config.js';
import { extractPrices } from '../governance/grounding.js';

export function chatModel({ streaming = true, temperature = config.model.temperature } = {}) {
  return new ChatOpenAI({
    model: config.model.name,
    apiKey: config.model.apiKey,
    configuration: { baseURL: config.model.baseURL },
    temperature,
    modelKwargs: { reasoning_effort: config.model.reasoningEffort },
    streaming,
    timeout: config.model.timeoutMs,
    maxRetries: config.model.retries,
  });
}

let extractor;

/**
 * Turn a shop's free-text reply into {in_stock, price_toman, note}. The model only classifies;
 * a price is kept only if it literally appears in the reply (grounding).
 */
export async function extractShopReply(productTitle, reply) {
  extractor ||= chatModel({ streaming: false, temperature: 0 });
  const literal = extractPrices(reply);
  let parsed = {};
  try {
    const res = await extractor.invoke([
      {
        role: 'system',
        content:
          'Classify a shop owner\'s reply about product availability. Reply ONLY with JSON: {"in_stock": true|false|null, "price_toman": number|null, "note": string}. in_stock is null if unclear. price_toman only if the reply states a price (convert میلیون/هزار and تومن/تومان to Toman). note: max 15 Persian words, e.g. condition, colour, "فقط تا فردا".',
      },
      { role: 'user', content: `Product: ${productTitle}\nReply: ${reply}` },
    ]);
    parsed = JSON.parse(String(res.content).match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch {
    parsed = {};
  }
  const inStockGuess = /ناموجود|تموم|تمام شد|نداریم|موجود نیست/.test(reply) ? false : /موجوده|موجود است|داریم|هست/.test(reply) ? true : null;
  const price = Number.isFinite(parsed.price_toman) && literal.some((p) => Math.abs(p - parsed.price_toman) / p < 0.02) ? parsed.price_toman : literal[0] ?? null;
  return {
    in_stock: typeof parsed.in_stock === 'boolean' ? parsed.in_stock : inStockGuess,
    price_toman: price,
    note: typeof parsed.note === 'string' ? parsed.note.slice(0, 120) : null,
  };
}
