// The agent as an explicit LangGraph state machine:
//
//   START → agent ─┬─(tool calls)──→ tools ─┬─(needs the user)─→ human ──→ agent
//                  │                        └──────────────────────────────→ agent
//                  └─(final text)──→ verify ─┬─(ungrounded, retry left)────→ agent
//                                            └──────────────────────────────→ END
//
// agent  : the model with tools bound, under step/time budgets
// tools  : harness-executed tools (validation, timeouts, retries, tracing), generative UI hydration
// human  : interrupt() — pauses the checkpointed graph for a choice, a location, or approval to contact a shop
// verify : governance — grounding check on the reply, retry or redact, UI contract, transcript
import { StateGraph, START, END, interrupt } from '@langchain/langgraph';
import { normalizeText } from '../data/normalize.js';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, RemoveMessage } from '@langchain/core/messages';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { AgentState } from './state.js';
import { systemPrompt } from './prompt.js';
import { chatModel } from './model.js';
import { typeOf, textOf, trimHistory, userTexts } from './history.js';
import { LIST_INTENT, TOOLS, TOOL_MAP, humanBlock } from './tools.js';
import { execute, toModelTools } from '../harness/registry.js';
import { getTrace } from '../harness/tracer.js';
import { checkGrounding, emptyFacts, mergeFacts, redactUngroundedPhones } from '../governance/grounding.js';
import { coarsenCtx } from '../governance/privacy.js';
import { audit } from '../governance/audit.js';
import { MESSAGES } from '../governance/policy.js';
import { resolvePlace } from '../data/catalog.js';

const STEP_LABELS = {
  search_products: (a) => `جستجوی «${a.query}» در کاتالوگ`,
  get_product_details: () => 'بررسی مشخصات و تفاوت مدل‌ها',
  resolve_place: (a) => `پیدا کردن «${a.text}» روی نقشه`,
  find_sellers: () => 'پیدا کردن مغازه‌های نزدیک',
  find_shops_nearby: () => 'گشتن مغازه‌های اطراف',
  show_shop: () => 'باز کردن صفحه‌ی مغازه',
  compare_products: () => 'مقایسه‌ی مدل‌ها',
  plan_list: () => 'چیدن لیست خرید',
  explain_term: () => 'توضیح اصطلاح',
  find_alternatives: () => 'گشتن دنبال جایگزین',
  get_shop_contact: () => 'گرفتن اطلاعات تماس مغازه',
  check_shop_instagram: () => 'بررسی پست‌های اخیر اینستاگرام مغازه',
  check_shop_website: () => 'سر زدن به سایت مغازه',
  get_followups: () => 'بررسی جواب مغازه‌ها',
  show_shops: () => 'چیدن تابلوی مغازه‌ها',
  show_products: () => 'آماده کردن کارت محصولات',
  compare_offers: () => 'مقایسه مغازه‌ها',
  price_verdict: () => 'مقایسه قیمت با بازار',
  plan_visit: () => 'برنامه‌ریزی مسیر خرید',
};

// Harness preconditions on tool use (deterministic; the prompt alone wasn't enough — see evals).
const MAX_SEARCHES = 3;
const ONCE_PER_TURN = new Set(['show_shops', 'compare_offers', 'compare_products', 'plan_list', 'plan_visit', 'price_verdict']);
const RESULT_BLOCKS = new Set(['shop_board', 'compare', 'product_compare', 'shopping_list', 'visit_plan', 'price_verdict']);
const CONTACT_REQUEST = /شماره|تماس|تلفن|زنگ|آدرس دقیق|اینستا|واتساپ|contact|phone/i;
const lastUserText = (messages) => userTexts(messages).at(-1) || '';

const baseModel = chatModel();
const modelWithTools = baseModel.bindTools(toModelTools(TOOLS));

function lastAiWithCalls(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (typeOf(m) === 'ai') return m.tool_calls?.length ? m : null;
  }
  return null;
}

const emit = (cfg, event) => cfg?.writer?.(event);

// ---------- nodes ----------

async function agentNode(state, cfg) {
  const trace = getTrace(cfg.configurable?.trace_id);
  const turn = state.turn;
  const deadline = cfg.configurable?.deadline ?? Infinity;
  const exhausted = turn.steps >= config.budget.maxAgentSteps || turn.toolCalls >= config.budget.maxToolCalls || Date.now() > deadline;

  const messages = [new SystemMessage(systemPrompt(state)), ...trimHistory(state.messages)];
  if (exhausted) {
    trace?.flag('budget_exhausted');
    messages.push(new HumanMessage('[harness] Budget reached. Answer now with what you already have; do not call tools.'));
  }
  if (turn.steps === 0) emit(cfg, { type: 'step', label: 'فهمیدن درخواست' });

  const span = trace?.span('llm', exhausted ? 'agent.final' : 'agent', { step: turn.steps });
  try {
    const ai = await (exhausted ? baseModel : modelWithTools).invoke(messages, cfg);
    trace?.addUsage(ai.usage_metadata);
    if (trace) trace.counters.agentSteps++;
    span?.end(true, { tool_calls: (ai.tool_calls || []).map((c) => c.name), usage: ai.usage_metadata });
    // A budget-exhausted answer must not carry tool calls.
    const msg = exhausted && ai.tool_calls?.length ? new AIMessage({ content: textOf(ai) || MESSAGES.budget }) : ai;
    return { messages: [msg], turn: { steps: turn.steps + 1 } };
  } catch (err) {
    span?.end(false, { error: err.message });
    throw err;
  }
}

async function toolsNode(state, cfg) {
  const trace = getTrace(cfg.configurable?.trace_id);
  const ai = state.messages[state.messages.length - 1];
  const working = { ...state, offers: { ...state.offers }, products: { ...state.products }, ctx: { ...state.ctx } };
  const out = { messages: [], offers: {}, products: {}, ctx: {}, facts: emptyFacts(), ui: [], turn: {} };
  let toolCalls = state.turn.toolCalls;
  const fetched = [...(state.turn.fetchedOfferIds || [])];
  const toolCtx = { state: working, userTexts: userTexts(state.messages), threadId: cfg.configurable?.thread_id };

  for (const call of ai.tool_calls || []) {
    const def = TOOL_MAP[call.name];
    if (call.name === 'ask_user' && [...state.ui, ...out.ui].some((b) => RESULT_BLOCKS.has(b.type))) {
      // Results are already on screen: a follow-up question would just park the turn.
      out.messages.push(new ToolMessage({ tool_call_id: call.id, name: call.name, content: JSON.stringify({ error: 'Results are already shown. Do not ask; end with one short suggestion line.' }) }));
      continue;
    }
    if (def?.kind === 'human') continue; // answered in the human node
    let content;
    if (!def) {
      content = { error: `Unknown tool ${call.name}` };
    } else if (toolCalls >= config.budget.maxToolCalls) {
      content = { error: 'Tool budget for this turn is used up. Answer with what you have.' };
    } else if (ONCE_PER_TURN.has(call.name) && [...(state.turn.uiDone || []), ...(out.turn.uiDone || [])].includes(call.name)) {
      content = { error: `${call.name} already rendered this turn. Write your reply now.` };
    } else if (call.name === 'search_products' && (state.turn.searches || 0) + (out.turn.searches || 0) >= MAX_SEARCHES) {
      content = { error: `Search limit (${MAX_SEARCHES}) reached this turn. Use the results you have: show_products, ask_user with options, or find_sellers.` };
    } else if (call.name === 'get_shop_contact' && !CONTACT_REQUEST.test(lastUserText(state.messages))) {
      content = { error: "The user didn't ask for contact details. The board already has call buttons; don't fetch or list phone numbers." };
    } else {
      if (call.name === 'search_products') out.turn.searches = (state.turn.searches || 0) + (out.turn.searches || 0) + 1;
      if (call.name === 'search_products') out.turn.lastSearch = null;
      toolCalls++;
      if (trace) trace.counters.toolCalls++;
      emit(cfg, { type: 'step', label: STEP_LABELS[call.name]?.(call.args || {}) || 'در حال بررسی', tool: call.name });
      const res = await execute(def, call.args, toolCtx, trace);
      if (res.ok) {
        // Only a call that worked counts as "done this turn"; a failed one (wrong ids) may be retried.
        if (ONCE_PER_TURN.has(call.name)) out.turn.uiDone = [...(state.turn.uiDone || []), ...(out.turn.uiDone || []), call.name];
        const { model, update = {}, blocks = [] } = res.result;
        content = model;
        for (const key of ['offers', 'products', 'ctx']) {
          if (update[key]) Object.assign(working[key], update[key]), Object.assign(out[key], update[key]);
        }
        if (update.facts) out.facts = mergeFacts(out.facts, update.facts);
        if (update.fetchedOfferIds) fetched.push(...update.fetchedOfferIds);
        if (call.name === 'search_products') out.turn.lastSearch = Object.keys(update.products || {});
        for (const block of blocks) {
          const b = { ...block, id: block.id || call.id };
          out.ui.push(b);
          emit(cfg, { type: 'ui', block: b });
        }
      } else {
        content = { error: res.error };
        if (/timed out|BoxAPI/.test(res.error)) audit('tool_failure', { tool: call.name, detail: res.error, trace: trace?.id });
      }
    }
    out.messages.push(new ToolMessage({ tool_call_id: call.id, name: call.name, content: JSON.stringify(content) }));
  }
  out.turn = { ...out.turn, toolCalls, fetchedOfferIds: fetched };
  return out;
}

async function humanNode(state, cfg) {
  const ai = lastAiWithCalls(state.messages);
  const answered = new Set(state.messages.filter((m) => typeOf(m) === 'tool').map((m) => m.tool_call_id));
  const calls = (ai?.tool_calls || []).filter((c) => TOOL_MAP[c.name]?.kind === 'human' && !answered.has(c.id));
  const [call, ...extra] = calls;
  const block = humanBlock(call, state);

  // Pauses here. The runtime streams `block` to the client; the answer resumes the graph.
  // Everything below runs once, after the user answered.
  const answer = interrupt(block);

  const update = { messages: [], transcript: [] };
  const extraBlocks = [];
  let pickedProduct = null;
  let answerText;
  let forModel;

  if (call.name === 'request_location') {
    let ctx = coarsenCtx(answer || {});
    if (ctx.lat == null && answer?.area) {
      const place = resolvePlace(answer.area);
      if (place) ctx = { lat: place.lat, lon: place.lon, place: place.name };
    }
    update.ctx = { ...ctx, locationAsked: true };
    answerText = answer?.area ? `محدوده: ${answer.area}` : ctx.lat != null ? (ctx.place ? `جا: ${ctx.place}` : 'موقعیتم را فرستادم') : 'بدون موقعیت';
    forModel = ctx.lat != null ? `Origin set${ctx.place ? ` to ${ctx.place}` : ' from GPS'}.` : 'User declined; sort by price instead of distance.';
  } else {
    const picked = block.options.find((o) => o.value === answer?.value);
    answerText = picked ? picked.label : String(answer?.text || '').slice(0, 300);
    forModel = picked ? { chosen: picked.label, product_id: picked.product_id, next: picked.product_id ? 'Show its sellers now: find_sellers (request_location first if the location is unknown).' : undefined } : { free_text_answer: answerText };
    if (picked?.product_id) pickedProduct = picked.product_id;
  }

  update.messages.push(new ToolMessage({ tool_call_id: call.id, name: call.name, content: typeof forModel === 'string' ? forModel : JSON.stringify(forModel) }));
  for (const c of extra) {
    update.messages.push(new ToolMessage({ tool_call_id: c.id, name: c.name, content: 'Skipped: ask one thing at a time.' }));
  }
  // Freeze what the user saw before answering into the transcript.
  update.transcript.push({ role: 'assistant', text: '', blocks: [...state.ui, { ...block, answer: answerText }, ...extraBlocks] }, { role: 'user', text: answerText, answer: true });
  update.ui = null;
  update.turn = {
    askedUser: true,
    // Picking a product means "where can I buy it": verify holds the turn open until sellers are shown.
    ...(pickedProduct ? { pickedProduct } : {}),
    // A typed reply can be a new request ("compare these"), so per-turn limits start over.
    ...(answer?.text ? { uiDone: [], searches: 0 } : {}),
  };
  return update;
}

// Behavioural contract on the final reply (beyond number grounding).
const CLAIMS_OUTREACH = /(پیام|سوال|سؤال)[^.؟\n]{0,40}(ارسال شد|فرستاده شد|فرستادم|ارسال کردم)|از (فروشگاه|مغازه)[^.؟\n]{0,30}پرسیدم|منتظر (پاسخ|جواب) (فروشگاه|مغازه)/;

// "Plan my trip" — answered with a visit plan, not a description of one.
const PLAN_INTENT = /برنامه(‌ی|ی)?\s*(رفتن|خرید|مسیر)|مسیر(م)?\s*(رو|را)?\s*بچین|برنامه.{0,20}بچین/;

// "X or Y?" between models — answered with a side-by-side card, not just text.
const VERSUS = /\sیا\s/;
const VERSUS_INTENT = /بهتر|کدوم|کدام|فرق|مقایسه|خوبه|بخرم/;

// The user relays a shop's "we don't have it" — the turn should end with somewhere else to buy it.
const OUT_OF_STOCK = /(تموم|تمام)\s*(کرد|شد|شده)|موجود\s*(ندار|نیست)|ناموجود|نداریم|نداشت/;

const ASKS_LOCATION = /کجای تهران|کجا هستید|موقعیت(\s*مکانی)?\s*(تون|تان|خود)|موقعیت[^.\n]{0,30}(ثبت نشده|نامشخص|ندارم|نمی‌دانم)|(محله|منطقه)[^.\n]{0,40}(بگید|بنویسید|بفرستید|بفرمایید|بگویید)/;

// Words too generic to show a product was named ("گوشی", "طرح ساده", "حافظه ۱۲۸").
const GENERIC = new Set(['گوشی', 'قاب', 'طرح', 'ساده', 'حافظه', 'مدل', 'رم', 'گیگابایت', 'مگابایت', 'گیگ', 'با', 'و', 'برای', 'دو', 'سیم', 'استوک', 'نسخه', 'رنگ']);

function mentionedIn(said, product) {
  const words = normalizeText(product.title)
    .split(' ')
    .filter((w) => w.length > 2 && !GENERIC.has(w) && !/^\d+$/.test(w));
  return words.slice(0, 4).some((w) => said.includes(w));
}

function contractViolations(text, turn, state) {
  const v = [];
  const tail = text.split('\n').filter(Boolean).slice(-2).join(' ');
  const showedSomething = state.ui.length > 0;
  // A closing suggestion after results is fine; asking *instead of acting* is not.
  if (/[؟?]\s*$/.test(tail) && !turn.askedUser && !showedSomething) {
    v.push('You ended with a question in plain text instead of acting. Ask it with ask_user (2-5 concrete options) or request_location, or show results.');
  }
  const shownShops = state.ui.some((b) => b.type === 'shop_board' || b.type === 'compare' || b.type === 'visit_plan');
  if (turn.pickedProduct && !shownShops) {
    v.push(`The user picked a product (product_id ${turn.pickedProduct}). Don't ask whether to look for shops — call find_sellers for it now${state.ctx?.lat == null && !state.ctx?.locationAsked ? ' (call request_location first: the location is unknown)' : ''}.`);
  }
  const lastUser = lastUserText(state.messages);
  if (LIST_INTENT.test(lastUser) && !state.ui.some((b) => b.type === 'shopping_list' || b.type === 'visit_plan')) {
    v.push('They listed several different items for one trip. Call plan_list with each item as a short query (request_location first if the location is unknown).');
  }
  if (PLAN_INTENT.test(lastUser) && !state.ui.some((b) => b.type === 'visit_plan') && Object.keys(state.offers || {}).length) {
    v.push('They asked for a visit plan. Call plan_visit with the 1-3 offer_ids they meant (the best ones from the comparison or board) — do not just describe it.');
  }
  const foundModels = (turn.lastSearch || []).length;
  if (VERSUS.test(lastUser) && VERSUS_INTENT.test(lastUser) && foundModels >= 2 && !state.ui.some((b) => b.type === 'product_compare' || b.type === 'compare')) {
    v.push('They asked which of two models to pick. Search each model if needed, then call compare_products with both product_ids (and focus for what matters to them).');
  }
  if (OUT_OF_STOCK.test(lastUser) && !state.ui.some((b) => b.type === 'shop_board' || b.reason === 'alternatives')) {
    v.push('The shop is out of stock. Find somewhere else: find_alternatives for this product, and/or find_sellers to show other shops that list it.');
  }
  if (state.ctx?.lat != null && ASKS_LOCATION.test(text)) {
    v.push(`The user's location is already set (${state.ctx.place || 'GPS'}). Don't ask for it or say it is unknown; use it.`);
  }
  // ترب‌چین never contacts shops itself (the user does, via ask_shop's card), so any such claim is false.
  if (CLAIMS_OUTREACH.test(text)) {
    v.push('You claimed a shop was contacted. ترب‌چین never sends messages: say the message is ready for them to send (ask_shop card) and that they can paste the reply there.');
  }
  return v;
}

async function verifyNode(state, cfg) {
  const trace = getTrace(cfg.configurable?.trace_id);
  const turn = state.turn;
  const ai = state.messages[state.messages.length - 1];
  const text = textOf(ai).trim();
  const g = checkGrounding(text, state.facts, userTexts(state.messages));
  const contract = contractViolations(text, turn, state);

  if ((!g.ok || contract.length) && turn.groundingRetries < config.governance.groundingRetries) {
    trace?.flag(g.ok ? 'contract_retry' : 'grounding_retry');
    await audit(g.ok ? 'contract_violation' : 'grounding_violation', { trace: trace?.id, violations: [...g.violations.map((v) => v.kind), ...contract.map((c) => c.slice(0, 40))] });
    emit(cfg, { type: 'text_reset' });
    const problems = [
      ...(g.ok ? [] : [`Your reply states ${g.violations.map((v) => `${v.kind} ${v.value}`).join(', ')} which no tool returned. Use only numbers from tool results (call get_shop_contact for phones).`]),
      ...contract,
    ];
    const check = new HumanMessage({ id: crypto.randomUUID(), content: `[harness check] ${problems.join(' ')} Then rewrite the reply. Do not mention this check.` });
    return { messages: [check], turn: { groundingRetries: turn.groundingRetries + 1, scratch: [...turn.scratch, ai.id, check.id] } };
  }

  const flags = [...(turn.flags || [])];
  let finalText = text;
  if (!g.ok) {
    finalText = redactUngroundedPhones(text, g.violations);
    flags.push('unverified_numbers');
    trace?.flag('grounding_redacted');
    await audit('grounding_redacted', { trace: trace?.id, violations: g.violations.map((v) => v.kind) });
  }
  if (CLAIMS_OUTREACH.test(finalText)) {
    flags.push('unverified_action');
    trace?.flag('unverified_action');
    await audit('unverified_action', { trace: trace?.id });
  }

  // A curated board (show_shops) replaces the default one rendered by find_sellers.
  const replaced = new Set(state.ui.flatMap((b) => b.replaces || []));
  const blocks = state.ui.filter((b) => !replaced.has(b.id));
  // UI contract: products the agent found AND talked about are shown as cards, not only as text.
  // Only ones the reply actually names — a search the agent rejected ("these are just cases") stays hidden.
  if (!blocks.length && turn.lastSearch?.length) {
    const said = normalizeText(finalText);
    const products = turn.lastSearch
      .map((id) => state.products[id])
      .filter((p) => p && p.shops > 0 && mentionedIn(said, p))
      .slice(0, 6);
    if (products.length) {
      const block = { type: 'product_list', id: `auto-products-${turn.id}`, title: null, products };
      blocks.push(block);
      emit(cfg, { type: 'ui', block });
      trace?.flag('ui_contract_autofill');
    }
  }
  if (!finalText && !blocks.length) finalText = MESSAGES.failure;

  const messages = (turn.scratch || []).map((id) => new RemoveMessage({ id }));
  if (finalText !== text) messages.push(new AIMessage({ id: ai.id, content: finalText }));
  return {
    messages,
    turn: { scratch: [], flags },
    transcript: [{ role: 'assistant', text: finalText, blocks, flags }],
  };
}

// ---------- routing ----------

function afterAgent(state) {
  const ai = state.messages[state.messages.length - 1];
  return ai.tool_calls?.length ? 'tools' : 'verify';
}

function afterTools(state) {
  const ai = lastAiWithCalls(state.messages);
  const answered = new Set(state.messages.filter((m) => typeOf(m) === 'tool').map((m) => m.tool_call_id));
  return ai?.tool_calls?.some((c) => TOOL_MAP[c.name]?.kind === 'human' && !answered.has(c.id)) ? 'human' : 'agent';
}

const afterVerify = (state) => (state.turn.scratch?.length ? 'agent' : END);

// ---------- compile ----------

mkdirSync(config.paths.data, { recursive: true });
export const checkpointer = SqliteSaver.fromConnString(join(config.paths.data, 'checkpoints.sqlite'));

export const graph = new StateGraph(AgentState)
  .addNode('agent', agentNode)
  .addNode('tools', toolsNode)
  .addNode('human', humanNode)
  .addNode('verify', verifyNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', afterAgent, ['tools', 'verify'])
  .addConditionalEdges('tools', afterTools, ['human', 'agent'])
  .addEdge('human', 'agent')
  .addConditionalEdges('verify', afterVerify, ['agent', END])
  .compile({ checkpointer });
