// Tool registry: every tool declares a zod schema, a kind, and runs under the harness's timeout,
// retry, validation and tracing — the model never calls Torob directly.
import { tool as lcTool } from '@langchain/core/tools';
import { z } from 'zod';
import { config } from '../config.js';

/**
 * kind:
 *  - 'data'  fetches facts (Torob). Retried on failure.
 *  - 'ui'    generative UI: the model picks a component and ids; the harness hydrates real data.
 *  - 'human' human-in-the-loop: pauses the graph (interrupt) until the user answers.
 */
const UNSET_WHEN_ZERO = ['max_price', 'min_price', 'radius_km'];

export function defineTool({ name, kind, description, schema, run, timeoutMs = config.tools.timeoutMs, retries = kind === 'data' ? config.tools.retries : 0 }) {
  return { name, kind, description, schema, run, timeoutMs, retries };
}

export class ToolError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

function withTimeout(promise, ms, name) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ToolError(`${name} timed out after ${ms}ms`, { retryable: true })), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Validate args, run with timeout/retry, and record a span. Returns {ok, result|error}. */
export async function execute(def, rawArgs, ctx, trace) {
  const span = trace?.span('tool', def.name, { args: rawArgs });
  // Models send 0/null for "no budget"/"any distance"; those mean unset, not a zero limit.
  const args = { ...(rawArgs ?? {}) };
  for (const k of UNSET_WHEN_ZERO) if (args[k] === 0 || args[k] === null) delete args[k];
  const parsed = def.schema.safeParse(args);
  if (!parsed.success) {
    const error = `Invalid arguments for ${def.name}: ${z.prettifyError(parsed.error)}`;
    span?.end(false, { error });
    return { ok: false, error };
  }
  let attempt = 0;
  for (;;) {
    try {
      const result = await withTimeout(Promise.resolve(def.run(parsed.data, ctx)), def.timeoutMs, def.name);
      span?.end(true, { attempts: attempt + 1 });
      return { ok: true, result };
    } catch (err) {
      const retryable = err.retryable ?? /fetch|timed out|ECONN|5\d\d/.test(String(err.message));
      if (attempt < def.retries && retryable) {
        attempt++;
        continue;
      }
      span?.end(false, { error: err.message, attempts: attempt + 1 });
      return { ok: false, error: err.message };
    }
  }
}

/** LangChain tool descriptors for bindTools — schema only; execution stays in the harness. */
export function toModelTools(defs) {
  return defs.map((d) => lcTool(async () => '', { name: d.name, description: d.description, schema: d.schema }));
}
