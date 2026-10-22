// Dataset layer tests. Needs data/torob.db (npm run db:build); skipped otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { normalizeText, queryTokens } from '../src/data/normalize.js';

const hasDb = existsSync(process.env.DB_PATH || 'data/torob.db');
const catalog = hasDb ? await import('../src/data/catalog.js') : null;

test('normalisation unifies Arabic/Persian letters, digits and ZWNJ', () => {
  assert.equal(normalizeText('آيفون ۱۳ كارکرده‌ی'), 'ایفون 13 کارکرده ی');
  assert.deepEqual(queryTokens('ایرپاد پرو')[0], ['ایرپاد', 'airpods']);
});

test('opening hours: open, later, closed today, unknown', { skip: !hasDb }, () => {
  const hours = { mon: { status: 'declared', shifts: [{ start_time: '10:00:00', end_time: '19:00:00' }] }, fri: { status: 'closed', shifts: [] } };
  assert.equal(catalog.openStatus(hours, { day: 'mon', minutes: 11 * 60 }).status, 'open');
  assert.equal(catalog.openStatus(hours, { day: 'mon', minutes: 9 * 60 }).status, 'opens_later');
  assert.equal(catalog.openStatus(hours, { day: 'mon', minutes: 20 * 60 }).status, 'closed_now');
  assert.equal(catalog.openStatus(hours, { day: 'fri', minutes: 11 * 60 }).status, 'closed_today');
  assert.equal(catalog.openStatus(null).status, 'unknown');
});

test('search finds Persian and English queries with facets', { skip: !hasDb }, () => {
  const r = catalog.searchProducts('آیفون ۱۳ ۱۲۸');
  assert.ok(r.results.length > 0);
  assert.ok(r.results.some((p) => /iPhone 13/i.test(p.title)));
  assert.ok(r.facets.categories.length > 0);
});

test('offers keep listed price, price age and stock separate', { skip: !hasDb }, () => {
  const p = catalog.searchProducts('آیفون ۱۳ ۱۲۸').results.find((x) => x.shops > 1);
  const r = catalog.findOffers(p.product_id, { origin: { lat: 35.695, lon: 51.41 } });
  const o = r.offers[0];
  assert.equal(o.stock, 'unconfirmed');
  assert.ok('price_age_days' in o && 'price_freshness' in o);
  assert.ok(r.offers.every((x, i, a) => i === 0 || (a[i - 1].distance_km ?? 0) <= (x.distance_km ?? Infinity)), 'sorted by distance');
  const capped = catalog.findOffers(p.product_id, { origin: { lat: 35.695, lon: 51.41 }, maxPrice: 1 });
  assert.equal(capped.matched, 0);
  assert.equal(capped.excluded_by_filters, r.total);
});

test('places resolve from areas and passage addresses', { skip: !hasDb }, () => {
  assert.equal(catalog.resolvePlace('فردوسی').source, 'area');
  assert.ok(catalog.resolvePlace('پاساژ علاءالدین')?.matched_shops > 10);
  assert.equal(catalog.resolvePlace('ناکجاآباد'), null);
});
