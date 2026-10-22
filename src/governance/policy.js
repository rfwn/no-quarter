// Pre-graph policy gate: kill switch, input limits, per-user rate limits, injection screening.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { audit } from './audit.js';

export function agentEnabled() {
  return config.governance.enabled && !existsSync(join(config.paths.data, 'KILL_SWITCH'));
}

// Sliding-window limits per (hashed) user, in memory. Swap for Redis when running multiple instances.
const windows = new Map();

export function checkRateLimit(userHash, now = Date.now()) {
  const { perMinute, perDay } = config.governance.rateLimit;
  const hits = (windows.get(userHash) || []).filter((t) => now - t < 86_400_000);
  const lastMinute = hits.filter((t) => now - t < 60_000).length;
  if (lastMinute >= perMinute) return { ok: false, retryAfterSec: 60, reason: 'per_minute' };
  if (hits.length >= perDay) return { ok: false, retryAfterSec: 3600, reason: 'per_day' };
  hits.push(now);
  windows.set(userHash, hits);
  return { ok: true };
}

// Heuristics only — they flag for audit and harden the prompt; the model is never the only line of defence.
const INJECTION_PATTERNS = [
  /ignore (all |your |the )?(previous |above )?(instructions|prompt)/i,
  /system prompt|developer message|you are now|jailbreak/i,
  /دستورات (قبلی|بالا)(ت)? را? (نادیده|فراموش)/,
  /پرامپت (سیستم|اصلی)/,
];

export function screenInput(text) {
  const flags = [];
  if (INJECTION_PATTERNS.some((re) => re.test(text))) flags.push('injection_suspected');
  return flags;
}

export const MESSAGES = {
  disabled: 'دستیار موقتاً در دسترس نیست. کمی بعد دوباره امتحان کنید.',
  tooLong: `پیام خیلی طولانی است. لطفاً کوتاه‌تر (حداکثر ${config.governance.maxMessageChars} حرف) بنویسید.`,
  rateLimited: 'تعداد درخواست‌ها زیاد شده. یک دقیقه صبر کنید و دوباره بپرسید.',
  budget: 'پیدا کردن جواب بیش از حد طول کشید. لطفاً سؤال را دقیق‌تر بپرسید (مثلاً مدل و شهر).',
  failure: 'الان نتوانستم جواب بدهم. چند لحظه بعد دوباره امتحان کنید.',
};

export async function gate({ userHash, message, threadHash }) {
  if (!agentEnabled()) {
    await audit('kill_switch_block', { user: userHash });
    return { ok: false, code: 'disabled', message: MESSAGES.disabled };
  }
  if (message && message.length > config.governance.maxMessageChars) {
    return { ok: false, code: 'too_long', message: MESSAGES.tooLong };
  }
  const rl = checkRateLimit(userHash);
  if (!rl.ok) {
    await audit('rate_limited', { user: userHash, reason: rl.reason });
    return { ok: false, code: 'rate_limited', message: MESSAGES.rateLimited, retryAfterSec: rl.retryAfterSec };
  }
  const flags = message ? screenInput(message) : [];
  if (flags.length) await audit('input_flagged', { user: userHash, thread: threadHash, flags });
  return { ok: true, flags };
}
