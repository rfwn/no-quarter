// Harness rules and the pieces around them: what the reply check sends the model back for, photo and
// follow-up helpers, privacy of the name. No model calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { HumanMessage } from '@langchain/core/messages';
import { coarsenCtx } from '../src/governance/privacy.js';
import { photoText } from '../src/agent/model.js';

const hasDb = existsSync(process.env.DB_PATH || 'data/torob.db');
process.env.LLM_API_KEY ||= 'test-placeholder'; // the graph module builds a client; nothing is called
const graph = hasDb ? await import('../src/agent/graph.js') : null;
const tools = hasDb ? await import('../src/agent/tools.js') : null;
const followups = hasDb ? await import('../src/followups.js') : null;

const state = (user, extra = {}) => ({ messages: [new HumanMessage(user)], ui: [], offers: {}, ctx: {}, ...extra });
const rule = (text, user, turn = {}, extra = {}) => graph.contractViolations(text, turn, state(user, extra));

test('picking a product must end with its shops', { skip: !hasDb }, () => {
  assert.equal(rule('باشه', 'نوکیا ۱۰۵', { pickedProduct: 'p1' }).length, 1);
  assert.equal(rule('باشه', 'نوکیا ۱۰۵', { pickedProduct: 'p1' }, { ui: [{ type: 'shop_board' }] }).length, 0);
});

test('out of stock must end with somewhere else (alternatives, sellers, or a rebuilt plan)', { skip: !hasDb }, () => {
  assert.equal(rule('حیف شد', 'گفت تموم کردیم').length, 1);
  assert.equal(rule('ok', 'گفت تموم کردیم', {}, { ui: [{ type: 'product_list', reason: 'alternatives' }] }).length, 0);
  assert.equal(rule('ok', 'اگه «الف» نداشت، «ب» رو بذار و برنامه رو بچین', {}, { ui: [{ type: 'visit_plan' }], offers: { o: {} } }).length, 0);
});

test('"X or Y?" with two models found must end with a comparison card', { skip: !hasDb }, () => {
  assert.equal(rule('A57 بهتره', 'آیفون ۱۳ بهتره یا گلکسی A57؟', { lastSearch: ['a', 'b'] }).length, 1);
  assert.equal(rule('ok', 'آیفون ۱۳ بهتره یا گلکسی A57؟', { lastSearch: ['a', 'b'] }, { ui: [{ type: 'product_compare' }] }).length, 0);
});

test('a plan request with known offers must end with a visit plan', { skip: !hasDb }, () => {
  assert.equal(rule('چیدم', 'برنامه رفتن به دوتای اول رو بچین', {}, { offers: { o: {} } }).length, 1);
  assert.equal(rule('چیدم', 'برنامه رفتن به دوتای اول رو بچین', {}, { offers: { o: {} }, ui: [{ type: 'visit_plan' }] }).length, 0);
});

test('a list of items must end with the shopping-list planner', { skip: !hasDb }, () => {
  assert.equal(rule('باشه', 'یه گوشی، یه قاب براش و یه شارژر می‌خوام').length, 1);
  assert.equal(rule('باشه', 'یه گوشی ساده برای مامانم').length, 0);
});

test('never claim a shop was contacted; never ask for a known location', { skip: !hasDb }, () => {
  assert.equal(rule('از مغازه پرسیدم، منتظر جواب مغازه باش.', 'بپرس').length, 1);
  assert.equal(rule('پیامش آماده‌ست؛ بفرست.', 'بپرس').length, 0);
  assert.equal(rule('لطفاً محله‌ای که هستید رو بفرمایید', 'گوشی', {}, { ctx: { lat: 35.7, lon: 51.4, place: 'ونک' } }).length, 1);
});

test('a plain-text question instead of acting is sent back; after results it is fine', { skip: !hasDb }, () => {
  assert.equal(rule('کدوم مدل رو می‌خوای؟', 'گوشی').length, 1);
  assert.equal(rule('کدوم مدل رو می‌خوای؟', 'گوشی', {}, { ui: [{ type: 'shop_board' }] }).length, 0);
});

test('direct answers (model unavailable): sellers, shops by kind, products, or nothing', { skip: !hasDb }, () => {
  const here = { lat: 35.6953, lon: 51.4098 };
  const kinds = (q) => tools.directAnswer(q, here).blocks.map((b) => b.type);
  assert.deepEqual(kinds('گوشی سامسونگ A17 4G 128 رم 4 نزدیکم'), ['shop_board']);
  assert.deepEqual(kinds('نزدیک ترین موبایل فروشی'), ['nearby_shops']);
  assert.deepEqual(kinds('آیفون ۱۳'), ['product_list']);
  assert.deepEqual(kinds('یه شعر بگو'), []);
  assert.match(tools.directAnswer('آیفون ۱۳', here).text, /در دسترس نیست/);
});

test('list intent: two or more «یه …» items', { skip: !hasDb }, () => {
  assert.ok(tools.LIST_INTENT.test('یه هدفون و یه پاوربانک می‌خوام'));
  assert.ok(!tools.LIST_INTENT.test('آیفون ۱۳ بهتره یا گلکسی A57؟'));
});

test('ask a shop: channels best first; WhatsApp only for mobile numbers (Persian digits too)', { skip: !hasDb }, () => {
  const ch = followups.shopChannels({ instagram: 'shop_ig', website: 'https://x.ir', phone: '۰۹۱۲۱۲۳۴۵۶۷' });
  assert.deepEqual(ch.map((c) => c.kind), ['instagram', 'website', 'whatsapp', 'phone']);
  assert.equal(ch[0].dm_url, 'https://ig.me/m/shop_ig');
  assert.equal(ch[2].url, 'https://wa.me/989121234567');
  assert.ok(!followups.shopChannels({ phone: '۰۲۱۶۶۷۷۸۸۹۹' }).some((c) => c.kind === 'whatsapp'));
});

test('photo reading → text the agent can use', () => {
  assert.equal(photoText({ kind: 'price_tag', brand: 'اپل', product: 'گوشی اپل آیفون ۱۳', model: null, price_toman: 95_000_000, note: null }), '[عکس برچسب قیمت: گوشی اپل آیفون ۱۳، قیمت روی برچسب ۹۵٬۰۰۰٬۰۰۰ تومان]');
  assert.match(photoText({ product: null, price_toman: null }), /خونده نشد/);
});

test('the user name reaching the prompt is letters only and short', () => {
  assert.equal(coarsenCtx({ name: 'عرفان‌جان' }).name, 'عرفان‌جان');
  assert.equal(coarsenCtx({ name: '<b>{x}</b>' }).name, 'bxb');
  assert.ok(coarsenCtx({ name: 'a'.repeat(50) }).name.length <= 24);
  assert.equal(coarsenCtx({ name: '۱۲۳' }).name, undefined);
});
