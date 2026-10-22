import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planShoppingList, resolveItem } from '../src/data/shoppingList.js';

const ALAEDDIN = { lat: 35.6953, lon: 51.4098 };
const LIST = ['گوشی سامسونگ A17 4G 128 رم 4', 'قاب سامسونگ A17', 'شارژر سامسونگ 25 وات'];

test('resolveItem finds a product that shops list for each line', () => {
  for (const q of LIST) {
    const p = resolveItem(q);
    assert.ok(p, q);
    assert.ok(p.shops > 0, q);
  }
});

test('planShoppingList: options are distinct, nearby, and honest about coverage', () => {
  const products = LIST.map(resolveItem);
  const plan = planShoppingList(products, ALAEDDIN);
  assert.ok(plan.options.length >= 2);
  const keys = plan.options.map((o) => [...o.offer_ids].sort().join('|'));
  assert.equal(new Set(keys).size, keys.length, 'no duplicate options');
  for (const o of plan.options) {
    assert.equal(o.covered + o.missing.length, products.length, `${o.title}: covered + missing = all items`);
    assert.equal(o.total, o.stops.flatMap((s) => s.items).reduce((sum, i) => sum + i.price, 0), `${o.title}: total is the sum of its prices`);
    for (const s of o.stops) assert.ok(s.distance_km == null || s.distance_km <= 5, `${o.title}: stops are within reach`);
  }
  const cheapest = plan.options.find((o) => o.kind === 'cheapest');
  for (const o of plan.options.filter((x) => x.covered === cheapest.covered)) assert.ok(cheapest.total <= o.total, 'cheapest mix is cheapest among full options');
});
