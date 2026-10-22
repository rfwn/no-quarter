# Demo script (≈5 minutes)

Record on a phone-sized window (or a real phone) in light mode, with the location set to **شیخ هادی** (the best-covered area). Before recording, try every message once: the model's wording varies between runs, but these flows are covered by the evals.

| # | Time | Do | Point out |
|---|---|---|---|
| 1 | 0:00–0:25 | Open the app for the first time | Onboarding: ترب‌چین asks your name. The welcome uses it. TorobChat look, light and dark. |
| 2 | 0:25–1:05 | «یه گوشی ساده برای مامانم» → pick a Nokia | It understands a vague need, offers real basic phones, then shows the shop list with **its map**. Tap a pin: the row lights up and the peek shows price, open state and route. |
| 3 | 1:05–1:35 | On the board: «کی می‌ری؟ → امروز عصر», toggle «الان باز» | Opening hours re-checked for that time; filters change results without another chat turn. Source labels on every fact. |
| 4 | 1:35–2:15 | «سه تای اول رو با هم مقایسه کن» | Decision-first comparison: the pick, the trade-off in one line, **plan B** under each shop («اگه نداشت: … ۱۰۰ متر اون‌طرف‌تر»), bargaining range. |
| 5 | 2:15–2:45 | «از اولی بپرس موجود داره یا نه» → «فرستادم» → paste «تموم کردیم» | Follow-up card (Instagram DM link, website, WhatsApp, a ready message). The reply goes back to the agent, which finds alternatives. The sidebar tracks it under «پیگیری‌ها». |
| 6 | 2:45–3:15 | «برنامه‌ی رفتن به دوتای بهتر رو بچین» | Visit plan: best order (never arriving at a closed shop), latest time to leave, numbered route on the map, in-shop checks (رجیستری، گارانتی), Neshan routes. |
| 7 | 3:15–3:45 | Camera button → a photo of a price tag | It reads the tag, finds the product, and judges «منصفانه‌ست؟» with a bargaining range and the cheaper shop next door. |
| 8 | 3:45–4:15 | «یه گوشی سامسونگ A17، یه قاب براش و یه شارژر» | Shopping list: one shop / one passage / cheapest mix, honest when an option misses an item, one tap to a visit plan. |
| 9 | 4:15–4:40 | «نزدیک ترین موبایل فروشی کجاست» → tap a shop name | Shops by kind; the shop page with what it lists and searching inside it. |
| 10 | 4:40–5:00 | Close | Data honesty (coverage note at ونک, «تأیید نشده»), the no-AI fallback, Liara deployment. |

**If something fails on camera:** the app answers with the direct search (shops and map still appear). Say so; it's a feature.

**Talking points:**
1. It's an agent, not a chatbot: LangGraph with tools, checkpoints, rules enforced in code, and 18 behavioural evals.
2. Every price and phone number is grounded in the data, and every fact shows its source.
3. Built for the passage: maps, time, plan B, bargaining, Iran-specific checks.
