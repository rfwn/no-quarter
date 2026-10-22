// Time, coverage, plan B, shop kinds and type-aware search over the real dataset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const hasDb = existsSync(process.env.DB_PATH || 'data/torob.db');
const c = hasDb ? await import('../src/data/catalog.js') : null;
const SHEIKH_HADI = { lat: 35.6953, lon: 51.4098 };
const VANAK = { lat: 35.7575, lon: 51.4099 };

test('visit time: evening is 18:00 Tehran, tomorrow 10:30; past evening means now', { skip: !hasDb }, () => {
  const morning = new Date('2026-10-22T06:00:00Z'); // 09:30 Tehran
  assert.equal(c.visitDate('evening', morning).toISOString(), '2026-10-22T14:30:00.000Z');
  assert.equal(c.visitDate('tomorrow', morning).toISOString(), '2026-10-23T07:00:00.000Z');
  const night = new Date('2026-10-22T18:00:00Z'); // 21:30 Tehran
  assert.equal(c.visitDate('evening', night).getTime(), night.getTime());
  assert.equal(c.visitDate('now', night).getTime(), night.getTime());
});

test('coverage: dense around Sheikh Hadi, honest about Vanak', { skip: !hasDb }, () => {
  assert.equal(c.coverageAt(SHEIKH_HADI.lat, SHEIKH_HADI.lon).level, 'good');
  const v = c.coverageAt(VANAK.lat, VANAK.lon);
  assert.equal(v.level, 'low');
  assert.ok(v.nearest_busy_area?.name, 'points to the nearest well-covered area');
});

test('plan B: another shop, same product, close to the first, with the price difference', { skip: !hasDb }, () => {
  const pid = c.searchProducts('گوشی سامسونگ A17 4G 128 رم 4').results[0].product_id;
  const first = c.findOffers(pid, { origin: SHEIKH_HADI, limit: 1 }).offers[0];
  const fb = c.fallbackFor(first);
  assert.ok(fb, 'found a plan B');
  assert.notEqual(fb.shop_id, first.shop_id);
  assert.equal(fb.product_id, first.product_id);
  assert.ok(fb.from_primary_m <= 1500);
  assert.equal(fb.price_diff, fb.price - first.price);
});

test('visit time changes which shops count as open', { skip: !hasDb }, () => {
  const pid = c.searchProducts('گوشی سامسونگ A17 4G 128 رم 4').results[0].product_id;
  const r = c.findOffers(pid, { origin: SHEIKH_HADI, visit: 'tomorrow', limit: 5 });
  assert.equal(r.visit.key, 'tomorrow');
  assert.match(r.visit.label, /فردا/);
});

test('shop kinds: "موبایل فروشی" means phone shops, "لوازم تحریر" the stationery family', { skip: !hasDb }, () => {
  assert.equal(c.matchShopCategories('نزدیک ترین موبایل فروشی')[0].category, 'گوشی موبایل');
  assert.ok(c.matchShopCategories('لوازم تحریر').every((k) => k.category.includes('تحریر')));
});

test('type-aware search: "گوشی ساده" finds phones, not «قاب … طرح ساده»; accessories when asked', { skip: !hasDb }, () => {
  const phones = c.searchProducts('گوشی ساده', { maxPrice: 10_000_000 });
  assert.equal(phones.category_used, 'گوشی موبایل');
  assert.ok(phones.results.every((p) => p.category === 'گوشی موبایل'));
  const cases = c.searchProducts('قاب آیفون ۱۳');
  assert.ok(!cases.category_used, 'an accessory query is not forced into phones');
});

test('a shop page lists what it sells, searchable', { skip: !hasDb }, () => {
  const pid = c.searchProducts('گوشی سامسونگ A17 4G 128 رم 4').results[0].product_id;
  const shopId = c.findOffers(pid, { limit: 1 }).offers[0].shop_id;
  const page = c.shopPage(shopId, { origin: SHEIKH_HADI });
  assert.ok(page.catalog.total > 0);
  const found = c.shopCatalog(shopId, { query: 'سامسونگ' });
  assert.ok(found.items.every((i) => /سامسونگ/.test(i.title)));
});
