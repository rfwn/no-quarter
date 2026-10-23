# ترب‌چین: submission summary

**What it is:** an AI shopping agent for buying things *in person* in Tehran's shops and passages, built on the Torob hackathon dataset. It is a chat with cards, filters and maps, phone-first and Persian RTL, styled like TorobChat.

**Try it:** `<live URL on Liara>` · Demo video: `<link>` · Demo script: [docs/demo.md](docs/demo.md)

## The four steps

| Step | What ترب‌چین does |
|---|---|
| 1. Understand the need | Understands vague needs («یه گوشی ساده برای مامانم»); product-type cards (phone, laptop, shoes, clothing…) with the specs that matter; «X بهتره یا Y؟» comparisons; a photo of a price tag or product |
| 2. Find shops by distance | Nearest sellers on an interactive map linked to the list; filters (radius, budget, open now, payment, warranty); «کی می‌ری؟» (now / this evening / tomorrow); shops by kind («موبایل‌فروشی نزدیکم»); shop pages |
| 3. Compare and verify | A decision-first comparison with a pick, the trade-off, **plan B** per shop, and a bargaining range; checking the shop's own website; asking the shop (Instagram DM link, website, WhatsApp) with the reply read back by the agent; follow-up tracker and reminders |
| 4. Plan the visit | Best visiting order (never arriving at a closed shop when that can be avoided), the latest time to leave, in-shop checks (رجیستری، گارانتی، کارت ملی for instalments), Neshan routes; several items in one trip (one shop / one passage / cheapest mix) |

## Against the judging criteria

| Criterion | Where to look |
|---|---|
| **Product (75)** | Everything above; out-of-stock and plan B handling; the in-shop price check; multi-item trips |
| **UX (75)** | Cards, filters and buttons instead of chat-only; inline maps linked to lists; no pop-ups (questions and nudges appear in the chat); light/dark/system theme; onboarding; mascot; Persian copy in a friendly voice |
| **Intelligence (50)** | LangGraph agent with 22 tools; follow-up with sellers; alternatives when out of stock; visit conditions (time, place, hours, payment); coverage-aware answers; bargaining; [harness rules](docs/architecture.md#harness-rules-enforced-in-code-not-left-to-the-prompt) |
| **Deploy (40)** | Dockerfile + `liara.json` (disk for chats and traces); health endpoint; CSP; the app still answers when the AI provider is down ([fallbacks](docs/architecture.md#fallbacks)) |
| **Technical (40)** | [Architecture](docs/architecture.md): generative UI from an allowlist, grounding and governance, tracing and admin, 44 unit tests, 18 behavioural evals (latest 18/18), CI |
| **Dataset (20)** | [docs/data.md](docs/data.md): listed price, price age and confirmed stock are never conflated; unknowns shown as unknown; every fact labelled with its source; payment channel; honest coverage notes |

## Honest limits

- Prices are listed prices, about a week old; stock is never confirmed unless the shop answers.
- The dataset covers about 10% of Tehran's shops, from selected areas. The app says so where it matters.
- ترب‌چین never contacts shops itself: Instagram doesn't allow it. The user sends a ready message.
- Most shop names and all phone numbers in the dataset are synthetic.
- Neshan maps switch on when the Neshan keys are active; until then, OpenStreetMap.
