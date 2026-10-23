# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Backend: plain Node.js (no dependencies), `src/server.js`, `src/agent.js`, `src/torob.js`.
- Web frontend: React + Vite (user's choice), in `web/`, built into `dist/` and served by the Node server; in dev, Vite runs inside the Node server with hot reload.
- Later channel: Instagram DM bot via BoxAPI (boxapi.ir), reusing the same `chat()` agent. Replies must therefore read well as plain text.

## Users

People in Iran buying something **in person** (phones, electronics, appliances, etc.), equally in two situations:
1. **Before going out**: they know roughly what they want and need the cheapest/closest physical shop that has it, whether it's open, and how to reach it.
2. **Standing in a shop or bazaar/passage**: checking whether the price in front of them is fair and what nearby shops charge.

Mostly on a phone, often one-handed, sometimes outdoors or in a busy passage.

## Product Purpose

A conversational assistant that turns Torob's physical-store ("خرید حضوری") data into a shopping decision: which shop, what price, how far, open now, how to call. Success is the user walking into the right shop (or walking out of the wrong one) with confidence.

## Positioning

Torob's site lists in-store sellers, but as a long, unranked list per product. This assistant understands a fuzzy request ("آیفون ۱۳ کارکرده تمیز نزدیک من"), picks the right variant, filters by city and distance, and recommends 2-3 shops with reasons, then fetches the real contact on demand.

## Operating Context

- Data comes live from Torob's public web API (api.torob.com/v4): search, product details, in-store map sellers (lat/lon, hours, price, price age), contact info. It's unofficial and can change.
- Torob's official "API v3" is a feed spec for shops and can't be queried; it isn't used.
- LLM: GapGPT Responses API, model `gapgpt-qwen-3.6`, reasoning off for speed. A full first answer still takes ~20-60s, so progress must be visible.
- Prices are in Toman; in-store prices can be months old (`price_updated`).

## Capabilities and Constraints

- Tools: search products, product details/variants, in-store sellers (city filter, distance sort from browser geolocation), shop contact (phone, WhatsApp/Bale/Telegram links, full address).
- Never show a price, shop or phone number that didn't come from Torob. Phone numbers in replies are checked in code against fetched contacts.
- Language: Persian, RTL. Persian digits in UI.
- Product name: **undecided**. The user has one but hasn't shared it yet; placeholder «دستیار خرید» lives in a single constant.

## Brand Commitments

None yet. Not affiliated with Torob; don't use Torob's logo or imply official status.

## Evidence on Hand

No testimonials, user numbers or partnerships exist. Don't fabricate any.

## Product Principles

1. Decision over data: lead with a recommendation, keep the full list one tap away.
2. Trust is the product: show price age, open status and "call first" honestly.
3. Thumb-first: every key action (call, map, next question) reachable one-handed.
4. Channel-portable: the agent's text must stand alone without the web UI (Instagram later).

## Accessibility & Inclusion

Outdoor/sunlight readability and large touch targets; WCAG AA contrast.
