// Run: npm run eval            (all scenarios)
//      npm run eval -- near-me  (by id)
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runTurn } from '../src/agent/runtime.js';
import { config } from '../src/config.js';
import { SCENARIOS } from './scenarios.js';

const only = process.argv.slice(2);
const scenarios = only.length ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;

async function runScenario(s) {
  const threadId = `eval-${s.id}-${Date.now()}`;
  const userId = `eval-${s.id}-${Math.random()}`;
  const started = Date.now();
  const tools = [];
  const turnTools = [];
  const interrupts = [];
  const blocks = [];
  let final = { text: '', blocks: [], flags: [] };

  for (const turn of s.turns) {
    const these = [];
    const collect = (e) => {
      if (e.type === 'step' && e.tool) tools.push(e.tool), these.push(e.tool), process.stdout.write(` ${e.tool}`);
      if (e.type === 'ui') blocks.push(e.block), process.stdout.write(` [${e.block.type}]`);
      if (e.type === 'interrupt') process.stdout.write(` ⏸${e.block.type}`);
    };
    let r = await runTurn({ threadId, userId, channel: 'eval', message: turn.message, ctx: turn.ctx }, collect);
    for (let i = 0; r.type === 'interrupt' && i < 4; i++) {
      interrupts.push(r.block.type);
      let answer = s.autoResume?.[r.block.type];
      // 'most_shops': pick the option sold by the most shops (a user who wants to compare would).
      if (answer === 'most_shops') answer = { value: [...r.block.options].sort((a, b) => (b.shops ?? -1) - (a.shops ?? -1))[0]?.value ?? '0' };
      if (!answer) break;
      r = await runTurn({ threadId, userId, channel: 'eval', resume: answer }, collect);
    }
    turnTools.push(these);
    if (r.type === 'done') final = r;
  }

  const ms = Date.now() - started;
  const seen = blocks.map((b) => b.type);
  const checks = [...s.check({ tools, turnTools, interrupts, final, blocks, seen }), [ms <= s.maxMs, `latency ≤ ${s.maxMs / 1000}s`], [!final.flags.includes('error'), 'no runtime error']];
  return {
    id: s.id,
    about: s.about,
    pass: checks.every(([ok]) => ok),
    ms,
    tools,
    interrupts,
    ui: seen,
    flags: final.flags,
    failed: checks.filter(([ok]) => !ok).map(([, name]) => name),
    reply: final.text.slice(0, 240),
  };
}

const results = [];
for (const s of scenarios) {
  process.stdout.write(`▸ ${s.id.padEnd(20)}`);
  let r;
  try {
    r = await runScenario(s);
  } catch (err) {
    r = { id: s.id, about: s.about, pass: false, ms: 0, failed: [`threw: ${err.message}`], tools: [], interrupts: [], ui: [] };
  }
  results.push(r);
  console.log(`\n  → ${r.pass ? 'PASS' : 'FAIL'}  ${(r.ms / 1000).toFixed(1).padStart(5)}s  tools=[${r.tools.join(',')}]${r.interrupts.length ? ` asked=[${r.interrupts}]` : ''} ui=[${r.ui.join(',')}]${r.failed.length ? `\n    ✗ ${r.failed.join('\n    ✗ ')}` : ''}`);
}

const passed = results.filter((r) => r.pass).length;
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
console.log(`\n${passed}/${results.length} passed · median ${(ms[Math.floor(ms.length / 2)] / 1000).toFixed(1)}s · ${config.version} · ${config.model.name} · prompt ${config.promptVersion}`);

const dir = join(config.paths.data, 'evals');
await mkdir(dir, { recursive: true });
const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(file, JSON.stringify({ version: config.version, model: config.model.name, prompt: config.promptVersion, results }, null, 2));
console.log(`report → ${file}`);
process.exit(passed === results.length ? 0 : 1);
