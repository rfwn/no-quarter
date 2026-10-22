// Buying know-how and product types: pure functions, no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bargainRange, bargainTips, phoneSignals, timeAdvice, warrantyKind } from '../src/data/buying.js';
import { compareCards, familyOf, familyLabels, productCard } from '../src/data/families.js';

test('warranty: «تست و تحویل» and «بدون گارانتی» are not warranties; company vs named', () => {
  assert.equal(warrantyKind({ provider: 'تست و تحویل در حضور مشتری' }).kind, 'test_only');
  assert.equal(warrantyKind({ provider: 'بدون گارانتی' }).kind, 'none');
  assert.equal(warrantyKind({ provider: 'شرکتی', months: 18 }).kind, 'company');
  assert.match(warrantyKind({ provider: 'شرکتی', months: 18 }).label, /۱۸ ماه/);
  assert.equal(warrantyKind({ provider: 'پارس ارتباط افزار', months: 18 }).kind, 'named');
  assert.equal(warrantyKind(null).kind, 'unknown');
});

test('phone listing claims: read the seller words, «رجیستر نشده» wins over «رجیستر»', () => {
  const labels = (t) => phoneSignals(t).map((s) => s.label);
  assert.deepEqual(labels('دو سیم پک اصلی نات اکتیو'), ['نات‌اکتیو', 'پک اصلی']);
  assert.ok(labels('iPhone 13 CH رجیستر شده').includes('پارت نامبر'));
  assert.deepEqual(labels('بدون رجیستر'), ['رجیستر نشده']);
  assert.deepEqual(labels('گوشی سالم'), []);
});

test('bargaining range: needs 3+ prices, ordered aim ≤ fair ≤ walk away, rounded', () => {
  assert.equal(bargainRange([10e6, 11e6]), null);
  const b = bargainRange([92e6, 98e6, 110e6, 115e6, 135e6, 101e6]);
  assert.ok(b.aim <= b.fair_max && b.fair_max <= b.walk_away);
  assert.ok(b.aim >= b.lowest, 'never below the lowest listed price');
  assert.equal(b.aim % 100_000, 0);
});

test('bargain tips name the cheaper shop and mention no-warranty leverage', () => {
  const tips = bargainTips({ cheaper: { shop_name: 'الف', price: 98e6, distance_km: 0.1 }, family: 'phone', warranty: { kind: 'test_only' } });
  assert.match(tips[0], /«الف»/);
  assert.ok(tips.length <= 3);
});

test('time advice: most closed → when to come; most closing soon → hurry; dedupes shops', () => {
  const open = (min) => ({ status: 'open', closes: '20:00', closes_in_min: min });
  const closed = { status: 'opens_later', opens: '10:00' };
  const most = timeAdvice([{ shop_name: 'a', open: closed }, { shop_name: 'b', open: closed }, { shop_name: 'c', open: open(300) }]);
  assert.match(most.advice, /بسته/);
  const hurry = timeAdvice([{ shop_name: 'a', open: open(20) }, { shop_name: 'a', open: open(20) }, { shop_name: 'b', open: open(30) }]);
  assert.match(hurry.advice, /عجله/);
  assert.equal(hurry.closing_soon.length, 2, 'one entry per shop');
  assert.equal(timeAdvice([{ shop_name: 'a', open: open(300) }]).advice, null);
});

test('product families from categories', () => {
  assert.equal(familyOf('گوشی موبایل'), 'phone');
  assert.equal(familyOf('لپ تاپ و نوت بوک'), 'laptop');
  assert.equal(familyOf('کتانی و کفش اسپرت'), 'shoes');
  assert.equal(familyOf('چوب لباسی و آویز لباس'), 'generic', 'hangers are not clothing');
  assert.ok(familyLabels('phone').includes('باتری'));
});

test('type card: focus first, title-derived RAM, debris cleaned, badges deduped', () => {
  const card = productCard(
    {
      title: 'گوشی اپل دو سیم (استوک) iPhone 13 | حافظه 128 رم 4 گیگ',
      category: 'گوشی موبایل',
      specs: [
        { key: 'حافظه داخلی', value: '128 گیگابایت' },
        { key: 'ظرفیت باتری', value: '3240 میلی‌آمپر ساعت, ,' },
        { key: 'NFC', value: 'ندارد' },
      ],
    },
    ['باتری'],
  );
  assert.equal(card.facts[0].label, 'باتری');
  assert.equal(card.facts[0].focus, true);
  assert.equal(card.facts[0].value, '3240 میلی‌آمپر ساعت');
  assert.ok(card.facts.some((f) => f.label === 'رم' && f.value === '4 گیگابایت'));
  assert.ok(!card.facts.some((f) => f.label === 'NFC'), '«ندارد» is not shown as a value');
  assert.deepEqual(card.badges, ['استوک']);
});

test('type card: shoe sizes and colours as lists', () => {
  const card = productCard({ title: 'کتانی', category: 'کتانی و کفش اسپرت', specs: [{ key: 'سایز', value: '40, 41, 42' }, { key: 'رنگ', value: 'مشکی / سفید' }] });
  assert.deepEqual(card.sizes, ['40', '41', '42']);
  assert.deepEqual(card.colors, ['مشکی', 'سفید']);
});

test('model comparison marks a single winner per row and never a tie', () => {
  const a = { facts: [{ label: 'باتری', value: '5000 mAh', better: 'max' }, { label: 'وزن', value: '190 گرم', better: 'min' }] };
  const b = { facts: [{ label: 'باتری', value: '3240 mAh', better: 'max' }, { label: 'وزن', value: '190 گرم', better: 'min' }] };
  const rows = compareCards([a, b]);
  assert.equal(rows.find((r) => r.label === 'باتری').winner, 0);
  assert.equal(rows.find((r) => r.label === 'وزن').winner, null);
});
