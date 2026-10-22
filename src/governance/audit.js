// Append-only audit log of policy decisions. One JSON object per line; never contains raw user ids,
// coordinates or phone numbers.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { redactPhones } from './privacy.js';

const file = join(config.paths.data, 'audit.jsonl');
let ready;

export async function audit(event, fields = {}) {
  ready ||= mkdir(config.paths.data, { recursive: true });
  await ready;
  const entry = { ts: new Date().toISOString(), event, version: config.version, ...fields };
  if (entry.detail) entry.detail = redactPhones(String(entry.detail)).slice(0, 500);
  await appendFile(file, JSON.stringify(entry) + '\n').catch((err) => console.error('[audit] write failed', err.message));
}

export async function readAudit(limit = 200) {
  const text = await readFile(file, 'utf8').catch(() => '');
  return text.trim().split('\n').filter(Boolean).slice(-limit).reverse().map((l) => JSON.parse(l));
}
