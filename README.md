# In-person shopping agent (Tehran)

An agentic assistant for buying things **in person** from Tehran's shops, passages and malls, built on Torob's Starcoach dataset (6,476 shops · 225,903 products · 331,506 offers).

It follows four steps:
1. **Understand the need.** It helps the user pick a model or brand when they don't know one (catalogue facets, comparison questions).
2. **Find shops** near the user or a named place (passage, street, area), nearest first.
3. **Compare and verify.** Side-by-side comparison, stale-price detection, the shop's Instagram posts, and asking the shop directly (Instagram DM through BoxAPI, or a ready-made message), with every answer tracked.
4. **Plan the trip.** Visiting order, travel time, whether each shop is open on arrival, and what to check there.

Users don't have to do everything through chat. Results are cards with filters (radius, budget, open now, TorobPay, installments, warranty, fast delivery), selection for comparison and route planning, and buttons for call, route and asking the shop.

## Run locally

```bash
cp .env.example .env              # set LLM_API_KEY (+ BOXAPI_* for Instagram)
npm install && npm run web:install
npm run db:build                  # dataset zip → data/torob.db (~35s)
npm run build                     # web → public/
npm start                         # http://localhost:3000
```

| Command | What |
|---|---|
| `npm test` | Unit tests: grounding, privacy, policy, history, catalogue, hours |
| `npm run eval` | Live behavioural evals: 11 scenarios through the real agent, printing progress as they run |
| `npm run dev` / `npm run web:dev` | API with reload / Vite dev server proxying `/api` |
| `/admin?token=$ADMIN_TOKEN` | Trace viewer (per-turn spans, latency, tokens, flags) and audit log |

## Architecture

```
web/ (React + Vite, generative UI registry)
  │  POST /api/chat  (NDJSON stream: step · token · ui · interrupt · done)
  ▼
src/agent/runtime.js ── governance gate (kill switch, rate limit, input screening)
  ▼
src/agent/graph.js   ── LangGraph: agent → tools → human (interrupt) → verify
  │                     checkpointed per thread in SQLite
  ├─ src/agent/tools.js     data · generative-UI · human-in-the-loop tools (zod schemas)
  ├─ src/harness/           tool registry (timeouts, retries), budgets, tracer
  ├─ src/governance/        grounding, untrusted-data sanitising, privacy, audit, policy
  ├─ src/data/catalog.js    dataset queries: FTS5 search, geo, opening hours, alternatives
  ├─ src/followups.js       ask-the-shop tracking, Instagram evidence
  └─ src/channels/text.js   the same turn rendered as text + buttons for Instagram
```

**Generative UI.** The model picks components (`shop_board`, `compare`, `visit_plan`, `price_verdict`, `product_list`, `instagram_evidence`, `followup`) and passes ids. The harness fills in the real data, so a card can never show a price, phone number or distance that isn't in the dataset. The client renders from an allowlist registry.

**Human in the loop.** `ask_user` (choices), `request_location` (GPS or area) and `ask_shop` (approve the message before anything is sent) pause the checkpointed graph until the user answers.

**Governance.**
- Every price and phone number in a reply must trace back to a tool result. Violations get one retry, then redaction.
- Contract checks: questions must use the question cards, and any claim of having contacted a shop must match a real approved `ask_shop`.
- Seller text is sanitised and labelled untrusted.
- Location is coarsened to about 100 m before it's stored.
- Phone numbers never appear in logs.
- Per-user rate limits, a kill switch (`AGENT_ENABLED=false` or `data/KILL_SWITCH`), and an append-only audit log.
- No shop is messaged more than once per product per 24h; answers are shared across users.

**Transparency.** Listed price, price age and stock are always shown separately. Stock is "unconfirmed" unless the shop itself answered. Missing hours or prices show as unknown. Shops that only match by category are listed separately as "may have it, ask first".

## Instagram (BoxAPI)

- **Evidence:** reads a shop's recent public posts for the product and any price (Data API). No consent needed.
- **Ask the shop:** Meta only allows DMs to accounts that messaged you first. When the shop has an open thread with our page, the agent DMs it after the user approves. Otherwise it prepares the message for the user to send on WhatsApp, by phone or by Instagram, and the user records the answer.
- **Webhook** `POST /webhooks/boxapi`: HMAC-verified and deduplicated. A shop's reply updates its open follow-ups (stock and price extracted, prices kept only if literally present). A shopper's DM runs the same agent and is answered as text.

Only 22 shops in the dataset have real Instagram handles. Shop names and phone numbers in the dataset are synthetic; locations are real.

## Deploy (Liara)

```bash
liara login
liara disk create --app torob-agent --name storage --size 1   # once
liara env set --app torob-agent LLM_API_KEY=... ADMIN_TOKEN=... BOXAPI_TOKEN=... BOXAPI_ACCOUNT_ID=... BOXAPI_WEBHOOK_SECRET=...
liara deploy
```

The Dockerfile builds the web bundle and bakes the dataset into a read-only SQLite file. The `storage` disk at `/app/storage` keeps conversations, follow-ups, traces and the audit log across deploys. `liara.json` sets the platform, port, timezone (Asia/Tehran) and disk.

The app name is a placeholder: `APP_NAME` in `web/src/App.jsx` and `<title>` in `web/index.html`.
