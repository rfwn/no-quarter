# How the dataset is used, and what it can't tell us

The app uses the Torob hackathon dataset (`torob-dataset.zip`: 6,476 shops · 225,903 products · 331,506 offers). Nothing is fetched from Torob live.

## What we use

| Data | How it shows up |
|---|---|
| Products: title, brand, category, specs, images | Search (Persian and English, type-aware), product-type cards (storage, battery, sizes, colours…), model comparison |
| Offers: price, last price change, seller title and description, warranty | Shop lists, the price check in the shop, bargaining ranges, comparisons, visit plans |
| Shops: location, address (passage, floor, unit), weekly hours | Distance, maps, open now / at the visit time, visit order, passage-level shopping lists |
| Shops: payment options with their channel | «اسنپ‌پی (حضوری)» vs «تارا (نوع پذیرش نامعلوم)» |
| Shops: declared categories | Shops by kind («موبایل‌فروشی نزدیکم»); "may have it" shops, always marked as category only |
| Shops: Instagram (22) and websites (90) | Ask the shop via an Instagram DM link; read the shop's own site for price and stock |

## What we never claim

- **Stock is never confirmed by the data.** Every offer is shown as «تأیید نشده» until the shop itself answers (the user relays the reply).
- **A listed price is not a confirmed price.** It is shown with its age («۱۱ روز پیش»), and stale prices get «قبلش بپرس». The data is about a week old; lists say so («داده‌ها تا ۲۱ مهر»).
- **A shop that only declares a category** is never presented as having the product.
- **Payment options are the seller's declaration.** They are labelled «به اعلام فروشنده», with the channel when the data has one.
- **Unknown stays unknown.** Missing hours read «ساعت کاری ثبت نشده», missing prices «بدون قیمت», missing warranty «گارانتی ثبت نشده».
- Every fact in the UI carries its source: «ثبت‌شده در ترب», «به اعلام فروشنده», «ثبت‌شده‌ی مغازه», «تأیید نشده», «به گفته‌ی خودت», «از سایت مغازه».

## Limits of the dataset (and how the app handles them)

| Limit | Handling |
|---|---|
| About 10% of Tehran's shops, from selected areas (5,580 shops within 2 km of شیخ هادی, none near ونک) | The app shows the coverage at the user's location and suggests the nearest well-covered area. The agent says so and never calls far-away shops "near". |
| Shop names (except the 112 with Instagram or a website) and all phone numbers are synthetic | Call buttons exist for the demo; follow-up prefers Instagram and websites for the real shops |
| At most 300 products per shop | Shop pages show what is listed, not "everything they sell" |
| Not in the export: shop photos, licences, Torob history, WhatsApp/Bale contacts, کالابرگ support | Not shown and not invented. WhatsApp links appear only for mobile numbers in the data. |
| Payment channel is often `unknown` | Labelled «نوع پذیرش نامعلوم», with advice to ask |
| Weekly hours don't know official holidays | `src/data/holidays.js` lists the coming months' holidays: shop lists and visit plans warn «تعطیل رسمیه». Lunar dates are computed (±1 day) and shown as «احتمالاً» |
| No signal in passage basements | The latest visit plan or shopping list is saved on the phone; with no connection the app still opens (service worker) and shows it |

## Instagram and contacting shops

A business account can only DM people who wrote to it first, so ترب‌چین cannot open a conversation with a shop. The user asks instead:
1. The follow-up card gives the shop's channels (Instagram DM link, website, WhatsApp, phone) and a ready message, copied when you tap a channel.
2. The user pastes the reply. It is read for stock and price, and a price is kept only if it literally appears in the reply.
3. The agent acts on it: out of stock leads to alternatives, in stock to a visit plan.

Replies are labelled «به گفته‌ی خودت» (as you reported).
