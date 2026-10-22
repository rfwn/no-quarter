// What the model sees of the conversation: a bounded window that never contains a dangling
// tool call (e.g. after a crash mid-turn), which the OpenAI-style API would reject.
import { config } from '../config.js';

export const typeOf = (m) => m?.getType?.() ?? m?._getType?.() ?? m?.type;
export const textOf = (m) =>
  typeof m?.content === 'string'
    ? m.content
    : (m?.content || [])
        .map((c) => (typeof c === 'string' ? c : c.text || ''))
        .join('');
export const isHarness = (m) => typeOf(m) === 'human' && textOf(m).startsWith('[harness');
export const userTexts = (messages) => messages.filter((m) => typeOf(m) === 'human' && !isHarness(m)).map(textOf);

/** Keep the last N user turns and drop any tool-call/tool-result pair that isn't complete. */
export function trimHistory(messages, maxTurns = config.budget.maxHistoryTurns) {
  const humanIdx = messages.map((m, i) => (typeOf(m) === 'human' && !isHarness(m) ? i : -1)).filter((i) => i >= 0);
  const start = humanIdx.length > maxTurns ? humanIdx[humanIdx.length - maxTurns] : 0;
  const window = messages.slice(start);
  const answered = new Set(window.filter((m) => typeOf(m) === 'tool').map((m) => m.tool_call_id));
  const kept = [];
  const keptCalls = new Set();
  for (const m of window) {
    const t = typeOf(m);
    if (t === 'ai' && m.tool_calls?.length) {
      if (!m.tool_calls.every((c) => answered.has(c.id))) continue;
      m.tool_calls.forEach((c) => keptCalls.add(c.id));
    }
    if (t === 'tool' && !keptCalls.has(m.tool_call_id)) continue;
    kept.push(m);
  }
  return kept;
}
