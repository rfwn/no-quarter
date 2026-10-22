// Local tracing: one trace per user turn with spans for every node, model call and tool call.
// Persisted as JSONL (data/traces/YYYY-MM-DD.jsonl) and kept in a ring buffer for the admin viewer.
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { redactPhones } from '../governance/privacy.js';

const RING = [];
const RING_SIZE = 200;
const live = new Map(); // traceId -> Trace (looked up from graph config, which must stay serialisable)

class Trace {
  constructor({ threadHash, userHash, channel, input }) {
    this.id = randomUUID();
    this.threadHash = threadHash;
    this.userHash = userHash;
    this.channel = channel;
    this.input = input ? redactPhones(input).slice(0, 300) : null;
    this.started = Date.now();
    this.spans = [];
    this.usage = { input_tokens: 0, output_tokens: 0 };
    this.flags = new Set();
    this.counters = { agentSteps: 0, toolCalls: 0 };
  }

  span(kind, name, meta = {}) {
    const span = { kind, name, start: Date.now() - this.started, ms: null, ok: null, meta };
    this.spans.push(span);
    return {
      end: (ok = true, extra = {}) => {
        span.ms = Date.now() - this.started - span.start;
        span.ok = ok;
        Object.assign(span.meta, extra);
      },
    };
  }

  addUsage(u) {
    if (!u) return;
    this.usage.input_tokens += u.input_tokens || 0;
    this.usage.output_tokens += u.output_tokens || 0;
  }

  flag(f) {
    this.flags.add(f);
  }

  toJSON() {
    return {
      trace_id: this.id,
      version: config.version,
      model: config.model.name,
      prompt: config.promptVersion,
      thread: this.threadHash,
      user: this.userHash,
      channel: this.channel,
      input: this.input,
      started: new Date(this.started).toISOString(),
      ms: this.ms,
      outcome: this.outcome,
      flags: [...this.flags],
      counters: this.counters,
      usage: this.usage,
      spans: this.spans,
    };
  }
}

export function startTrace(info) {
  const t = new Trace(info);
  live.set(t.id, t);
  return t;
}

export const getTrace = (id) => live.get(id);

let dirReady;
export async function finishTrace(trace, outcome) {
  trace.ms = Date.now() - trace.started;
  trace.outcome = outcome;
  live.delete(trace.id);
  const json = trace.toJSON();
  RING.push(json);
  if (RING.length > RING_SIZE) RING.shift();
  const dir = join(config.paths.data, 'traces');
  dirReady ||= mkdir(dir, { recursive: true });
  await dirReady;
  await appendFile(join(dir, `${json.started.slice(0, 10)}.jsonl`), JSON.stringify(json) + '\n').catch((e) => console.error('[trace] write failed', e.message));
  if (process.env.DEBUG) {
    console.log(`[trace] ${outcome} ${trace.ms}ms steps=${trace.counters.agentSteps} tools=${trace.counters.toolCalls} tokens=${trace.usage.input_tokens}/${trace.usage.output_tokens} flags=${[...trace.flags].join(',')}`);
    for (const s of trace.spans) console.log(`   ${String(s.start).padStart(6)}ms ${s.kind.padEnd(6)} ${s.name.padEnd(24)} ${String(s.ms).padStart(6)}ms ${s.ok ? 'ok' : 'FAIL'}`);
  }
  return json;
}

export const recentTraces = () => [...RING].reverse();
