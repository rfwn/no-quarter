// Builds data/torob.db from the Torob hackathon CSV export (shops, products, offers).
//   npm run db:build                      (reads data/dataset/*.csv, unzipping torob-dataset.zip if needed)
//   DATASET_DIR=... DB_PATH=... DATASET_ZIP=... node scripts/build-db.js
import Database from 'better-sqlite3';
import { parse } from 'csv-parse';
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { normalizeText } from '../src/data/normalize.js';

const DATASET_DIR = process.env.DATASET_DIR || 'data/dataset';
const DB_PATH = process.env.DB_PATH || 'data/torob.db';
const ZIP = process.env.DATASET_ZIP || 'torob-dataset.zip';

if (!existsSync(join(DATASET_DIR, 'shops.csv'))) {
  if (!existsSync(ZIP)) throw new Error(`Dataset not found: put ${ZIP} in the project root or CSVs in ${DATASET_DIR}`);
  mkdirSync(DATASET_DIR, { recursive: true });
  console.log(`unzipping ${ZIP} → ${DATASET_DIR}`);
  // Only the CSVs, flattened: the zip nests them in a folder and carries macOS metadata (__MACOSX/._*).
  execFileSync('unzip', ['-o', '-q', '-j', ZIP, '-x', '__MACOSX/*', '-d', DATASET_DIR], { stdio: 'inherit' });
  console.log('dataset files:', readdirSync(DATASET_DIR).join(', '));
}

const json = (v) => {
  if (v == null || v === '' || v === 'null') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
const nul = (v) => (v == null || v === '' || v === 'null' ? null : v);
const num = (v) => (nul(v) == null ? null : Number(v));

async function* rows(file) {
  const parser = createReadStream(join(DATASET_DIR, file)).pipe(parse({ columns: true, relax_quotes: true, bom: true }));
  for await (const r of parser) yield r;
}

const tmp = `${DB_PATH}.building`;
mkdirSync(dirname(DB_PATH), { recursive: true });
rmSync(tmp, { force: true });
const db = new Database(tmp);
db.pragma('journal_mode = OFF');
db.pragma('synchronous = OFF');

db.exec(`
  CREATE TABLE shops (
    shop_id TEXT PRIMARY KEY, name TEXT, address TEXT, area TEXT, lat REAL, lon REAL,
    categories TEXT, phone TEXT, instagram TEXT, website TEXT, fast_delivery INTEGER,
    payment TEXT, hours TEXT, offer_count INTEGER DEFAULT 0
  );
  CREATE TABLE shop_categories (shop_id TEXT, category TEXT);
  CREATE TABLE products (
    rowid INTEGER PRIMARY KEY, product_id TEXT UNIQUE, title TEXT, brand TEXT, category TEXT, model TEXT,
    images TEXT, specs TEXT, offer_count INTEGER DEFAULT 0, min_price INTEGER, max_price INTEGER, priced_count INTEGER DEFAULT 0
  );
  CREATE TABLE offers (
    offer_id TEXT PRIMARY KEY, product_id TEXT, shop_id TEXT, price INTEGER, price_changed_at TEXT,
    seller_title TEXT, description TEXT, warranty TEXT
  );
  CREATE VIRTUAL TABLE products_fts USING fts5(text, tokenize = 'unicode61 remove_diacritics 2', content = '');
`);

const t0 = Date.now();

// ---- shops ----
const insShop = db.prepare(`INSERT INTO shops VALUES (@shop_id, @name, @address, @area, @lat, @lon, @categories, @phone, @instagram, @website, @fast_delivery, @payment, @hours, 0)`);
const insCat = db.prepare('INSERT INTO shop_categories VALUES (?, ?)');
let n = 0;
db.transaction(() => {})();
const shopBatch = [];
for await (const r of rows('shops.csv')) shopBatch.push(r);
db.transaction(() => {
  for (const r of shopBatch) {
    const cats = json(r.category_names) || [];
    const phone = (json(r.contacts) || []).find((c) => c.channel === 'phone')?.display_number || null;
    const ig = json(r.instagram);
    insShop.run({
      shop_id: r.shop_id,
      name: nul(r.name),
      address: nul(r.address),
      area: nul(r.location_label),
      lat: num(r.lat),
      lon: num(r.lon),
      categories: JSON.stringify(cats),
      phone,
      instagram: ig?.handle || null,
      website: nul(r.website_url),
      fast_delivery: r.supports_fast_delivery === 'true' ? 1 : r.supports_fast_delivery === 'false' ? 0 : null,
      payment: JSON.stringify(json(r.payment_options) || []),
      hours: nul(r.weekly_hours),
    });
    for (const c of cats) insCat.run(r.shop_id, c);
    n++;
  }
})();
console.log(`shops: ${n}`);

// ---- products ----
const insProd = db.prepare(`INSERT INTO products (product_id, title, brand, category, model, images, specs) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const insFts = db.prepare('INSERT INTO products_fts (rowid, text) VALUES (?, ?)');
n = 0;
let batch = [];
const flushProducts = db.transaction((items) => {
  for (const r of items) {
    const specs = json(r.specs) || [];
    const info = insProd.run(r.product_id, nul(r.persian_title), nul(r.brand_name), nul(r.category_name), nul(r.model), nul(r.image_urls), JSON.stringify(specs));
    // Index title, brand, model, category and the English product name from specs.
    const englishName = specs.find((s) => s.key === 'نام محصول')?.value || '';
    insFts.run(info.lastInsertRowid, normalizeText([r.persian_title, r.brand_name, r.model, r.category_name, englishName].filter((x) => nul(x)).join(' ')));
  }
});
for await (const r of rows('products.csv')) {
  batch.push(r);
  if (batch.length === 5000) flushProducts(batch), (n += batch.length), (batch = []);
}
flushProducts(batch);
n += batch.length;
console.log(`products: ${n}`);

// ---- offers ----
const insOffer = db.prepare(`INSERT INTO offers VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
n = 0;
batch = [];
const flushOffers = db.transaction((items) => {
  for (const r of items) {
    const price = num(r.price_toman);
    insOffer.run(r.offer_id, r.product_id, r.shop_id, price ? Math.round(price) : null, nul(r.last_price_changed_at), nul(r.seller_title), nul(r.description), nul(r.warranty));
  }
});
for await (const r of rows('offers.csv')) {
  batch.push(r);
  if (batch.length === 10000) flushOffers(batch), (n += batch.length), (batch = []);
}
flushOffers(batch);
n += batch.length;
console.log(`offers: ${n}`);

// ---- indexes & aggregates ----
db.exec(`
  CREATE INDEX offers_product ON offers(product_id);
  CREATE INDEX offers_shop ON offers(shop_id);
  CREATE INDEX shop_categories_cat ON shop_categories(category);
  CREATE INDEX products_category ON products(category);
  CREATE INDEX products_brand ON products(brand);
  UPDATE products SET
    offer_count = (SELECT COUNT(*) FROM offers o WHERE o.product_id = products.product_id),
    priced_count = (SELECT COUNT(price) FROM offers o WHERE o.product_id = products.product_id),
    min_price = (SELECT MIN(price) FROM offers o WHERE o.product_id = products.product_id),
    max_price = (SELECT MAX(price) FROM offers o WHERE o.product_id = products.product_id);
  UPDATE shops SET offer_count = (SELECT COUNT(*) FROM offers o WHERE o.shop_id = shops.shop_id);
  INSERT INTO products_fts(products_fts) VALUES ('optimize');
  ANALYZE;
`);
db.close();
rmSync(DB_PATH, { force: true });
renameSync(tmp, DB_PATH);
console.log(`built ${DB_PATH} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
