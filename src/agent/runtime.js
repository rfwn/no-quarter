// Channel-agnostic entry point. Web, evals and (later) the Instagram webhook all call runTurn().
//
// Emits events while it works:
//   {type:'step', label, tool?}       progress (a tool started)
//   {type:'token', text}             streamed reply text
//   {type:'text_reset'}              discard streamed text (the model moved on to tools, or failed a check)
//   {type:'ui', block}               a generative-UI block, hydrated with real data
//   {type:'interrupt', block}        the graph paused for a human answer (ask_user / request_location)
//   {type:'done', text, blocks, flags}
import { Command } from '@langchain/langgraph';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { graph } from './graph.js';
import { newTurn } from './state.js';
import { config } from '../config.js';
import { startTrace, finishTrace } from '../harness/tracer.js';
import { gate, MESSAGES } from '../governance/policy.js';
import { coarsenCtx, hashId, phoneKey } from '../governance/privacy.js';
import { audit } from '../governance/audit.js';
import { shopPage, getProduct, findOffers, categoryShopsNear } from '../data/catalog.js';
import { shopBoardBlock } from './tools.js';
import { photoText, readPhoto } from './model.js';

// "Where am I?" is answered by the harness from state, not the model: the model kept treating it as
// off-topic or claiming the location was unknown even when it was set.
const WHERE_AM_I = /^(الان\s*)?(من\s*)?(الان\s*)?(کجام|کجا هستم|کجاام|کجای?م)(\s*الان)?\s*[؟?]?$|^موقعیت(م| من)\s*(کجاست|چیه)?\s*[؟?]?$/;

const threadConfig = (threadId) => ({ configurable: { thread_id: String(threadId) } });

export async function pendingInterrupt(threadId) {
  const snap = await graph.getState(threadConfig(threadId));
  return snap.tasks?.flatMap((t) => t.interrupts || [])[0]?.value || null;
}

/**
 * @param {{threadId: string, userId: string, channel?: string, message?: string, resume?: object, ctx?: object}} input
 * @param {(event: object) => void} emit
 */
export async function runTurn({ threadId, userId, channel = 'web', message, resume, ctx, image }, emit = () => {}) {
  const userHash = hashId(userId);
  const threadHash = hashId(threadId);
  let text = typeof message === 'string' ? message.trim() : '';
  // A photo (price tag / product) is read into text first; the image itself is not kept anywhere.
  if (image) {
    emit({ type: 'step', label: 'خوندن عکس' });
    const reading = photoText(await readPhoto(image));
    text = text ? `${text}\n${reading}` : `${reading}\nاین چیه و قیمتش منصفانه‌ست؟`;
    emit({ type: 'photo', text: reading });
  }

  const verdict = await gate({ userHash, message: text, threadHash });
  if (!verdict.ok) {
    const done = { type: 'done', text: verdict.message, blocks: [], flags: [verdict.code] };
    emit(done);
    return done;
  }

  const trace = startTrace({ threadHash, userHash, channel, input: text || (resume ? '[resume]' : '') });
  const cfg = {
    ...threadConfig(threadId),
    configurable: { thread_id: String(threadId), trace_id: trace.id, deadline: Date.now() + config.budget.turnDeadlineMs },
    streamMode: ['custom', 'messages', 'updates'],
    recursionLimit: 40,
  };

  // Decide how to enter the graph: answer a pending question, or start a new turn.
  const pending = await pendingInterrupt(threadId);
  let input;
  if (pending && (resume || text)) {
    input = new Command({ resume: resume ?? { text } });
  } else if (text && WHERE_AM_I.test(text.replace(/\s+/g, ' '))) {
    const snap = await graph.getState(threadConfig(threadId));
    const where = { ...(snap.values?.ctx || {}), ...coarsenCtx(ctx) };
    const reply =
      where.lat != null
        ? `الان موقعیتت روی «${where.place || 'موقعیت GPS تو'}» تنظیمه و فاصله‌ی مغازه‌ها رو از همین‌جا حساب می‌کنم. برای عوض کردنش دکمه‌ی موقعیت بالای صفحه رو بزن.`
        : 'هنوز موقعیتت رو نمی‌دونم. از دکمه‌ی «موقعیت» بالای صفحه، جات رو جست‌وجو کن یا روی نقشه انتخابش کن تا نزدیک‌ترین مغازه‌ها رو پیدا کنم.';
    await graph.updateState(
      threadConfig(threadId),
      { messages: [new HumanMessage(text), new AIMessage(reply)], ctx: coarsenCtx(ctx), turn: newTurn(['where_am_i']), ui: null, transcript: [{ role: 'user', text }, { role: 'assistant', text: reply, blocks: [] }] },
      'verify',
    );
    await finishTrace(trace, 'ok');
    const done = { type: 'done', text: reply, blocks: [], flags: ['where_am_i'] };
    emit(done);
    return done;
  } else if (text) {
    input = {
      messages: [new HumanMessage(text)],
      ctx: coarsenCtx(ctx),
      ui: null,
      turn: newTurn(verdict.flags),
      transcript: [{ role: 'user', text }],
    };
  } else {
    const done = { type: 'done', text: '', blocks: [], flags: ['empty'] };
    emit(done);
    return done;
  }

  let interrupted = null;
  try {
    for await (const [mode, data] of await graph.stream(input, cfg)) {
      if (mode === 'custom') emit(data);
      else if (mode === 'messages') {
        const [chunk, meta] = data;
        if (meta?.langgraph_node === 'agent' && typeof chunk.content === 'string' && chunk.content) emit({ type: 'token', text: chunk.content });
      } else if (mode === 'updates' && data.__interrupt__) {
        interrupted = data.__interrupt__[0]?.value;
      }
    }
  } catch (err) {
    console.error('[runTurn]', err);
    trace.flag('error');
    await audit('turn_failed', { trace: trace.id, detail: err.message });
    await finishTrace(trace, 'error');
    const done = { type: 'done', text: MESSAGES.failure, blocks: [], flags: ['error'] };
    emit(done);
    return done;
  }

  if (interrupted) {
    emit({ type: 'text_reset' });
    emit({ type: 'interrupt', block: interrupted });
    await finishTrace(trace, 'interrupted');
    return { type: 'interrupt', block: interrupted };
  }

  const snap = await graph.getState(threadConfig(threadId));
  const last = [...(snap.values.transcript || [])].reverse().find((e) => e.role === 'assistant');
  const done = { type: 'done', text: last?.text || '', blocks: last?.blocks || [], flags: last?.flags || [] };
  emit(done);
  await finishTrace(trace, 'ok');
  return done;
}

/** Renderable history for a thread (restores the UI after reload; Instagram doesn't need it). */
export async function getThread(threadId) {
  const snap = await graph.getState(threadConfig(threadId));
  return { transcript: snap.values?.transcript || [], pending: snap.tasks?.flatMap((t) => t.interrupts || [])[0]?.value || null };
}

/** Shop profile for the UI's call/details buttons: no model round-trip; the phone becomes a grounded fact. */
export async function getShopForThread(threadId, shopId, { query = '', category = null, offset = 0, ctx = null } = {}) {
  const cfg = threadConfig(threadId);
  const snap = await graph.getState(cfg);
  const c = coarsenCtx(ctx || snap.values?.ctx || {});
  const profile = shopPage(shopId, { origin: c.lat != null ? { lat: c.lat, lon: c.lon } : null, query: String(query).slice(0, 60), category, offset: Math.max(0, Number(offset) || 0) });
  if (!profile) return null;
  // Persist so later answers can cite this phone — only when the graph isn't paused mid-turn.
  if (profile.phone && snap.values?.messages?.length && !snap.next?.length) {
    await graph.updateState(cfg, { facts: { prices: [], phones: [phoneKey(profile.phone)] } }, 'verify');
  }
  return profile;
}

/**
 * Re-run a shop board with new filters straight from the UI (radius, budget, open now, payment…).
 * The board's offers are registered in the thread so the agent can reason about them next turn.
 */
export async function refilterBoard(threadId, productId, filters = {}, ctx = {}) {
  const cfg = threadConfig(threadId);
  const snap = await graph.getState(cfg);
  const c = { ...(snap.values?.ctx || {}), ...coarsenCtx(ctx) };
  const origin = c.lat != null ? { lat: c.lat, lon: c.lon } : null;
  const product = snap.values?.products?.[productId] || getProduct(productId);
  if (!product) return null;
  const result = findOffers(productId, { origin, ...filters, limit: 15 });
  const maybe = categoryShopsNear(product.category, { origin, radiusKm: filters.radiusKm || 2, exclude: result.offers.map((o) => o.shop_id), limit: 5 });
  if (snap.values?.messages?.length && !snap.next?.length) {
    await graph.updateState(cfg, { offers: Object.fromEntries(result.offers.map((o) => [o.offer_id, o])), facts: { prices: result.offers.map((o) => o.price).filter(Boolean), phones: [] } }, 'verify');
  }
  return shopBoardBlock({ product, result, filters, maybe });
}
