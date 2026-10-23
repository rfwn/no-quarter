# Demo script (≈5 minutes)

Just the messages to type: [demo-prompts.md](demo-prompts.md).

The brief: show the output, not the code; narrate it; present the whole thing. Each scene below says what to do, what to say (Persian voice-over, casual), and which judging criterion it feeds.

## Before recording

- Record on the **live Liara URL**, not localhost: the deploy score (40) is easier to give when the judges see it running.
- Phone-sized window (390×844) or a real phone, light mode, notifications off.
- A fresh profile (clear site data) so onboarding shows. Location: **شیخ هادی**, the best-covered area.
- Run every message once before recording. The model's wording varies, but these flows are covered by the evals.
- Have a photo of a phone price tag on the device, and know how to turn on airplane mode quickly.
- If an answer fails on camera, the app falls back to direct search (shops and map still appear). Say so and carry on: it's a feature.

## Script

| # | Time | Do | Say | Criterion |
|---|---|---|---|---|
| 1 | 0:00–0:20 | Show the welcome screen | «خرید حضوری تو تهران یعنی کلی زنگ زدن و پاساژگردی، آخرشم معلوم نیست مغازه جنس رو داره یا نه. ترب‌چین یه دستیاره که از نیاز تو شروع می‌کنه و تا مسیر رفتن به مغازه باهات میاد.» | Product |
| 2 | 0:20–0:40 | Onboarding: type a name, set the location to شیخ هادی | «اسمم رو می‌پرسه و جام رو؛ با جست‌وجو، نقشه یا GPS. همه‌چی فارسی، راست‌به‌چپ و برای موبایل.» | UX |
| 3 | 0:40–1:20 | «یه گوشی ساده برای مامانم» → pick a Nokia → tap a pin on the map | «نگفتم چه مدلی؛ خودش گزینه‌های ساده‌ی واقعی رو نشون داد. حالا نزدیک‌ترین فروشنده‌ها رو روی نقشه می‌بینم: قیمت، باز بودن، فاصله، و منبع هر اطلاعات.» | Product, Dataset |
| 4 | 1:20–1:45 | On the board: «کی می‌ری؟ → امروز عصر», toggle «الان باز», change radius or budget | «لازم نیست دوباره بپرسم؛ با همین فیلترها شعاع، بودجه و زمان رفتن رو عوض می‌کنم و نتیجه همون‌جا آپدیت می‌شه.» | UX |
| 5 | 1:45–2:20 | «سه تای اول رو با هم مقایسه کن» | «یه پیشنهاد مشخص با دلیلش، یه خط درباره‌ی بده‌بستونش، و برای هر مغازه یه پلن B اگه جنس نداشت. حتی می‌گه تا چقدر می‌شه چونه زد.» | Intelligence |
| 6 | 2:20–2:55 | «از اولی بپرس موجود داره یا نه» → «فرستادم» → paste «تموم کردیم» | «قیمت ترب مال هفته‌ی پیشه، پس موجودی رو تأییدشده فرض نمی‌کنه. یه پیام آماده می‌ده برای اینستاگرام یا واتساپ مغازه؛ من می‌فرستم، جوابش رو می‌ذارم، و چون تموم شده خودش جایگزین نزدیک پیدا می‌کنه. پیگیری‌ها هم تو منو می‌مونن.» | Intelligence, Product |
| 7 | 2:55–3:30 | «برنامه‌ی رفتن به دوتای بهتر رو بچین» → «بفرست برای کسی» → airplane mode, reload | «ترتیب رفتن رو جوری می‌چینه که به مغازه‌ی بسته نخورم، دیرترین ساعت راه افتادن رو می‌گه، و تو مغازه چی رو چک کنم: رجیستری، گارانتی. می‌تونم برنامه رو برای کسی بفرستم. تو زیرزمین پاساژ هم که آنتن نیست، برنامه رو داره.» | Product, UX |
| 8 | 3:30–3:55 | Camera button → the price-tag photo | «تو مغازه‌ام و یه قیمت دیدم. عکس برچسب رو می‌دم؛ می‌گه منصفانه‌ست یا نه، و مغازه‌ی ارزون‌تر همین نزدیکی کجاست.» | Intelligence |
| 9 | 3:55–4:20 | «یه گوشی سامسونگ A17، یه قاب براش و یه شارژر» | «چند تا چیز با هم: همه از یه مغازه، از یه پاساژ، یا ارزون‌ترین ترکیب. اگه یه گزینه یه قلم رو نداره، صادقانه می‌گه.» | Product |
| 10 | 4:20–4:40 | Move the location to ونک → show the coverage note; point at «تأیید نشده» and the source labels | «دیتاست فقط حدود ده درصد مغازه‌های تهرانه؛ جایی که پوشش کمه، خودش می‌گه. قیمت ثبت‌شده، زمان تغییر قیمت و موجودی تأییدشده هیچ‌وقت قاطی نمی‌شن.» | Dataset |
| 11 | 4:40–5:00 | Show the browser address bar (Liara URL), then `/admin` traces | «روی لیارا دیپلوی شده. پشتش یه ایجنت LangGraph با ابزارهاست؛ هر قیمت و شماره از خود داده میاد، قانون‌ها تو کد چک می‌شن، و ۱۸ سناریوی ارزیابی داره. اگه هوش مصنوعی هم قطع باشه، اپ هنوز جواب می‌ده. ممنون!» | Deploy, Technical |

## Talking points if there's time

1. It's an agent, not a chatbot: LangGraph with tools, checkpoints, rules enforced in code, and 18 behavioural evals.
2. Every price and phone number is grounded in the data, and every fact shows its source.
3. Built for the passage: maps, time, plan B, bargaining, offline, Iran-specific checks.
