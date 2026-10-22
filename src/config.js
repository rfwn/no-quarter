// Single source of truth for model, prompt version, budgets and governance knobs.
// Every trace records `config.version` so behaviour changes are attributable.

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  version: 'agent-v3.0.0',
  // Neshan maps: web key for the browser SDK, service key for search/reverse (server only).
  neshan: { webKey: process.env.NESHAN_WEB_KEY || null, serviceKey: process.env.NESHAN_SERVICE_KEY || null },
  model: {
    // Any OpenAI-compatible chat-completions endpoint. Default: BoxAPI AI (gpt-5.4-mini, ~2s/call).
    // GAPGPT_* still works as a fallback (Qwen 3.6 on GapGPT, 20–100s/turn in our tests).
    baseURL: process.env.LLM_BASE_URL || (process.env.LLM_API_KEY ? 'https://ai.boxapi.ir/ai/v1' : process.env.GAPGPT_BASE_URL || 'https://api.gapgpt.app/v1'),
    apiKey: process.env.LLM_API_KEY || process.env.GAPGPT_API_KEY,
    name: process.env.LLM_MODEL || (process.env.LLM_API_KEY ? 'gpt-5.4-mini' : process.env.GAPGPT_MODEL || 'gapgpt-qwen-3.6'),
    // "none" skips hidden reasoning: much faster, and tool use stays good for this agent.
    reasoningEffort: process.env.LLM_REASONING_EFFORT || process.env.GAPGPT_REASONING_EFFORT || 'none',
    temperature: 0.3,
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 45_000),
    retries: 1,
  },
  promptVersion: 'v4',
  budget: {
    maxAgentSteps: 10, // model calls per user turn
    maxToolCalls: 16,
    turnDeadlineMs: num(process.env.TURN_DEADLINE_MS, 150_000),
    maxHistoryTurns: 8, // user turns kept in the model's context window
  },
  tools: {
    timeoutMs: 15_000,
    retries: 1,
  },
  governance: {
    enabled: process.env.AGENT_ENABLED !== 'false', // kill switch (also: data/KILL_SWITCH file)
    maxMessageChars: 1000,
    rateLimit: { perMinute: 8, perDay: 120 },
    groundingRetries: 1,
    priceTolerance: 0.015, // 1.5% — "۱۴۶ میلیون" for 145,900,000 is fine
    locationDecimals: 3, // ~100m; raw GPS never enters state or logs
  },
  paths: {
    data: process.env.DATA_DIR || 'data',
  },
  adminToken: process.env.ADMIN_TOKEN || '',
};
