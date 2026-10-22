---
name: ترب‌چین
description: In-person shopping assistant for Tehran, set in TorobChat's quiet room; the answer and its product cards are the page.
colors:
  canvas: "#ffffff"
  surface: "#f8f9fb"
  elevated: "#f1f3f6"
  user-message: "#e6e8ec"
  user-message-line: "#d1d5db"
  ink: "#111827"
  ink-2: "#374151"
  muted: "#6b7280"
  line: "#e6e8ec"
  line-strong: "#d1d5db"
  action: "#ef4056"
  action-hover: "#d92e44"
  action-soft: "#fef2f3"
  action-ink: "#b51f33"
  on-action: "#ffffff"
  reward: "#f5a400"
  reward-ink: "#8a5a00"
  reward-soft: "#fff4d6"
  open: "#059669"
  soon: "#b45309"
  warn: "#92400e"
  warn-soft: "#fffbeb"
  danger: "#b91c1c"
  danger-soft: "#fef2f3"
  danger-line: "#fde0e3"
  canvas-dark: "#0f1117"
  surface-dark: "#15181f"
  elevated-dark: "#1e222b"
  user-message-dark: "#343a46"
  ink-dark: "#ececf1"
  ink-2-dark: "#c9ccd4"
  muted-dark: "#9aa0ac"
  line-dark: "#2a2e38"
  line-strong-dark: "#3a404c"
  action-hover-dark: "#f26a7d"
  action-ink-dark: "#f79aa6"
  reward-ink-dark: "#ffc552"
typography:
  display:
    fontFamily: "IRANYekanX, Tahoma, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.5
  sheet-title:
    fontFamily: "IRANYekanX, Tahoma, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: 1.5
  title:
    fontFamily: "IRANYekanX, Tahoma, sans-serif"
    fontSize: "16px"
    fontWeight: 700
  row-title:
    fontFamily: "IRANYekanX, Tahoma, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.5
  price:
    fontFamily: "IRANYekanX, Tahoma, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    fontFeature: "tnum"
  answer:
    fontFamily: "IRANYekanX, Tahoma, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.95
  body:
    fontFamily: "IRANYekanX, Tahoma, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
    fontFeature: "tnum"
  label:
    fontFamily: "IRANYekanX, Tahoma, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  caption:
    fontFamily: "IRANYekanX, Tahoma, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
  micro:
    fontFamily: "IRANYekanX, Tahoma, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
rounded:
  rail: "10px"
  sm: "12px"
  md: "16px"
  bubble: "18px"
  sheet: "20px"
  composer: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  gutter: "16px"
  lg: "20px"
  turn: "28px"
  rail-width: "60px"
  column: "760px"
components:
  send-button:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.pill}"
    size: "40px"
  send-button-hover:
    backgroundColor: "{colors.action-hover}"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.composer}"
    padding: "8px 18px 8px 8px"
  user-message:
    backgroundColor: "{colors.user-message}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "10px 16px"
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.canvas}"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.action-soft}"
    textColor: "{colors.action-ink}"
  steps-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "34px"
  place-pill:
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "34px"
  rail-button:
    textColor: "{colors.muted}"
    rounded: "{rounded.rail}"
    size: "40px"
  rail-button-hover:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  shop-row:
    padding: "12px 16px"
    height: "64px"
  shop-row-hover:
    backgroundColor: "{colors.elevated}"
  shop-row-selected:
    backgroundColor: "{colors.action-soft}"
  field:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  tag-pick:
    backgroundColor: "{colors.action-soft}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
  saving-chip:
    backgroundColor: "{colors.reward-soft}"
    textColor: "{colors.reward-ink}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill}"
    padding: "0 7px"
  data-note:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    padding: "10px 16px"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  toast:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
---

# Design System: ترب‌چین

## Overview

**Creative North Star: "The Quiet Room"**

Shopping as a conversation in TorobChat's dark, quiet room. The page is a near-black canvas (or a white one, when the system is light) with a thin icon rail on the reading-start edge, a centred 760px column, and a pill composer docked at the bottom. The user's words sit in a soft gray bubble; the assistant's answer is plain text on the canvas, and its product and shop cards are the substance of the page. Chrome recedes: the top bar holds only the conversation title and a place pill, and the agent's working steps collapse into one small pill.

Tokens follow TorobChat's own names (canvas, surface, elevated, user-message, line), and light and dark follow `prefers-color-scheme` under the same names. Color stays rare. Soft off-white ink (dark) or near-black ink (light) does the reading, hairlines separate everything, Torob red (#ef4056) shows up only on things you press or that are selected, and saffron only on wins. The game layer (missions, levels, badges, savings) and the pixel-art mascot چینو sit in the same room without raising its voice.

Phone-first, Persian and RTL, tabular Persian digits throughout. Under 720px the rail becomes the top bar.

**Key Characteristics:**
- Near-black canvas (#0f1117) with surface cards (#15181f) and hairlines (#2a2e38) in dark; white / #f8f9fb / #e6e8ec in light.
- One brand red for press and selection; saffron for wins; nothing else is colored except state.
- IRANYekanX variable font in five weight steps (400 / 500 / 600 / 700 / 800).
- Chat layout: icon rail, centred column, user bubble, plain-text answer, pill composer in a fading dock.
- Honesty is visual: listed price, price age and stock are always separate; one data note per list.
- Agent questions open as blocking sheets.

## Colors

A neutral TorobChat room in two lighting states, one brand red for interaction, one saffron for rewards, and quiet state colors.

### Primary
- **Torob Red** (action): fills only. The send button, primary buttons, selected-chip borders, the filled selection check, picked map pins, visit-plan step dots, focus outlines, the caret, the set place-pill icon. Same value in light and dark.
- **Pressed Red** (action-hover): hover on red fills; darker in light, lighter (#f26a7d) in dark.
- **Red Wash** (action-soft): selected ground: selected chips and shop rows, the "pick" tag, answered pills, callouts, text selection, the spinner track.
- **Red Ink** (action-ink): red as text. Links, selected-chip labels, the pick tag, the "more" link on the steps pill, the answered check. #b51f33 in light and #f79aa6 in dark, both for AA.

### Secondary
- **Saffron** (reward): wins only. Completed mission steps and their track, earned medals, the XP bar fill, the big-win toast border.
- **Saffron Ink** (reward-ink) on **Saffron Wash** (reward-soft): saving chips on shop rows, win-toast titles and icons, the finished mission bar, reward stat numbers.

### Tertiary (state only)
- **Open Green** (open): the open-now dot and a good price verdict.
- **Closing Amber** (soon): the "closing soon" dot.
- **Doubt Amber** (warn) on **Doubt Wash** (warn-soft): stale price age, "تأیید نشده" stock, "possibly" notes, a sent-but-unanswered follow-up.
- **Alert Red** (danger) on **Alert Wash** (danger-soft) with **Alert Line** (danger-line): errors, notices, a bad price verdict, flagged reply lines.

### Neutral
- **Canvas** (canvas): the page, rail, top bar, dock gradient, data note band, tags, quotes, ghost-button hover.
- **Surface** (surface): cards, the composer, chips, the steps pill, sheets, toasts, the selection tray.
- **Elevated** (elevated): hover on rail buttons, shop rows and history items; the open row and its detail panel.
- **User Bubble** (user-message) with **Bubble Line** (user-message-line): the user's own message only.
- **Ink** (ink): titles, prices, the answer text, the "best" mark in comparisons.
- **Graphite** (ink-2): chip labels, meta lines, icon buttons, listing lines.
- **Muted** (muted): addresses, units, captions, placeholders, rail icons at rest, closed and unknown states, "نامشخص".
- **Hairline** (line) and **Strong Hairline** (line-strong): every divider and card border; hover and field borders, list markers, the unselected check ring, the sheet grip.

### Named Rules
**The Press-Only Red Rule.** Torob red appears only on things you can press or that are selected. If it can't be tapped and isn't the current selection, it is ink, gray, a state color or saffron.

**The Red Ink Rule.** Red text uses action-ink, never action. Action is a fill color; on text it fails contrast.

**The Saffron Is a Win Rule.** Saffron marks a win: a mission step done, a saving, a badge, a level. It never marks an action, a price level or a warning.

**The Ink Best Rule.** In comparisons the winning value is bold ink (800) with a small check, never colored. Ties are never marked.

## Typography

**Display Font:** IRANYekanX variable (self-hosted, weights 100-1000), falling back to Tahoma, sans-serif
**Body Font:** the same family
**Label/Mono Font:** none; numbers use tabular figures set on body

**Character:** one familiar Persian UI family carrying all hierarchy through weight and size, as TorobChat does. Digits are Persian and tabular so prices line up.

### Hierarchy
- **Display** (800, 22px, 1.5): the welcome question only; 20px under 720px.
- **Sheet title** (800, 17px, 1.5): sheet headers. Profile level and toast titles use the same 800 weight at 18px and 15px.
- **Title** (700, 16px): card titles.
- **Row title** (700, 15px, 1.5): shop and product names in rows; product names use 600 and clamp to two lines.
- **Price** (800, 17px, tabular): the row price, always nowrap, with a 12px muted unit.
- **Answer** (400, 15px, 1.95): the assistant's answer in the thread, in ink. Collapsed summaries inside cards use 14px / 1.75 in Graphite.
- **Body** (400, 15px, 1.7): base text and the user bubble.
- **Label** (500, 13px): chips, pills, meta lines. Buttons are 600 at 14px (13px small); the conversation title is 600 at 14px.
- **Caption** (12-12.5px): units, price age, tags (600), legends, the data note, the steps pill.
- **Micro** (11-11.5px): the dock disclaimer, saving chips (700), mission step labels.

### Named Rules
**The Weight Step Rule.** Hierarchy comes from the fixed weight steps (400 body, 500 labels, 600 buttons, 700 titles, 800 display, prices, win titles). No new families, no italics, no uppercase or tracking tricks.

**The Persian Digits Rule.** Every number is rendered with Persian digits and tabular figures.

## Layout

A chat layout. On wide screens a fixed 60px icon rail runs down the reading-start edge (right, in RTL) with a hairline on its inner side; the main area sits beside it. A 52px top bar centres the conversation title (600, 14px, ellipsized) and pins the place pill to the inline end; it gains a bottom hairline once a conversation exists. Content is one centred column, max 760px, with 16px gutters.

The empty state is a vertically centred welcome: چینو at 72px, the 22px question, a muted 14px line, the composer at up to 540px wide, a muted hint line, then example chips centred and wrapping. Once a conversation starts, the thread shows each turn as a user bubble (max 82% wide, aligned to the reading start), the steps pill, then the answer and its cards. Turns are 28px apart; cards 12px apart. The thread reserves 170px at the bottom for the dock.

The dock is fixed to the bottom of the main area: the composer in the 760px column over a canvas gradient that fades to transparent upward, then an 11.5px muted disclaimer. The mission bar is sticky under the top bar inside the column, one compact row. The selection tray sticks inside the results card just above the dock. Toasts rise 110px above the bottom.

Under 720px the rail turns into a 52px top bar spanning the width (rail buttons at the edges, the place pill sharing the row), the conversation title and mission title hide, and the dock spans the full width.

**The One Composer Rule.** There is exactly one text input for search and conversation: the pill composer, centred on the welcome screen and docked at the bottom afterwards. Other inputs (budget, follow-up answers) are small fields inside cards or sheets.

## Elevation & Depth

Flat and tonal. Depth comes from the canvas, surface and elevated steps plus 1px hairlines; cards, rows, the rail, the top bar and the composer carry no shadow. One shared shadow token exists for things that float over moving content (map pins over tiles, toasts over the thread), and modal sheets sit on a dimmed backdrop. Medals use ring shadows as outlines, not lift. Selection is shown with Red Wash, never elevation.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 10px 28px rgb(17 24 39 / 0.14)`; dark `rgb(0 0 0 / 0.45)`): map price pins and toasts only.
- **Medal ring** (`box-shadow: 0 0 0 3px var(--surface), 0 0 0 4px var(--line)`; earned `0 0 0 5px var(--reward)`): badge medals.
- **Sheet backdrop** (`background: rgb(17 24 39 / 0.42)`; dark `rgb(0 0 0 / 0.55)`): behind modal sheets.

### Named Rules
**The Hairline Not Shadow Rule.** Cards, rows and the composer separate with 1px hairlines and a tonal step. A card never gets a shadow.

## Shapes

Soft, rounded and pill-heavy, as in TorobChat. 10px on rail buttons; 12px on buttons, fields, thumbnails, history items and stat tiles; 16px on cards and toasts; 18px on the user bubble; 20px on sheets (top corners only as a phone bottom sheet, all corners centred on wider screens); 28px on the composer; full pills on chips, tags, the steps pill, the place pill, the mission "new" button, saving chips, icon buttons, the send button and map pins. Borders are 1px hairlines; the "clear filters" chip is dashed. Round 7px dots show open state; the selection check is a 26px ring. Icons are one stroke family: 24px grid, 1.75 stroke, round caps and joins, drawn in currentColor.

## Components

### Composer (signature)
A 28px-radius pill on Surface with a hairline that strengthens on focus. An auto-growing textarea (15px / 1.6, 40-160px, red caret, muted placeholder) and a 40px round red send button with a white arrow; send darkens on hover and drops to 38% opacity when disabled.

### User Message
A gray bubble (user-message fill, bubble-line border, 18px corners, 10px 16px padding, 15px ink), fit to content up to 82% of the column. The answer that follows has no bubble.

### Steps Pill
A 34px Surface pill with a hairline, 12.5px muted text: a spinner while working (red arc on a Red Wash track) or a search icon after, the latest step ellipsized, and a red-ink "more" toggle that expands a muted 13px list of steps.

### Buttons
- **Shape:** 12px corners, 44px tall; 36px small; 48px full-width block.
- **Primary:** red fill, white 600 text. In action groups the primary takes the full row.
- **Hover / Focus:** primary moves to Pressed Red; focus is a 2px red outline offset 2px. Disabled drops to 50%.
- **Ghost:** hairline border, ink text; hover strengthens the border and fills with Canvas.
- **Link button:** muted 13px underlined text.
- **Icon / rail buttons:** 40px; icon buttons are round in Graphite, rail buttons are 10px squares in Muted that go Elevated with ink on hover.

### Chips
- **Style:** Surface pill, hairline border, Graphite 13px/500, 36px tall (42px large). Example chips on the welcome screen are the same shape, lifting to ink on hover.
- **State:** pressed chips take Red Wash, a red border and red-ink text. "Clear" is a dashed muted chip.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Surface with a 1px hairline.
- **Shadow Strategy:** none.
- **Internal Padding:** 14px 16px; lists inside run edge to edge.
- **Notice:** error variant on Alert Wash with Alert Line border and Alert Red text.

### Inputs / Fields
- **Fields:** 40px (44px in answer forms), Surface fill, Strong Hairline border, 12px corners, red caret; red border on focus.

### Navigation
The rail (wide) or top bar (phone) holds two icon buttons: the current conversation's history sheet and a new conversation. The place pill is a 34px hairline pill, muted until a place is set, then ink with a red pin icon.

### Shop Row
The core unit. Minimum 64px, 12px 16px padding, hairline between rows, Elevated on hover. Start side: name (700) with optional tag, muted place line, meta line with a status dot (green open, amber soon, gray closed or unknown). End side: price (800, 17px) with a muted unit, the price age in 12px muted (Doubt Amber when stale), and a saffron saving chip when the shop beats the typical price. A 52px selection column holds the check ring, filled red when on. Selected rows wash Red Wash; an open row and its fact panel use Elevated. Unknown facts read "نامشخص" in muted; unconfirmed stock reads "تأیید نشده" in Doubt Amber.

### Data Note
One band per list on Canvas between hairlines, 12.5px muted text with a small icon, stating once that prices are Torob's listed prices and stock is unconfirmed. Rows never repeat it.

### Compare Table
A header row of shops, then each attribute as a labelled line with values side by side in equal columns (13px on phones so four fit). Labels 12px muted; values 14px. The best value is bold ink with a check; ties are unmarked.

### Sheet
A native dialog on Surface: bottom sheet on phones (20px top corners, grip, up to 86% of viewport height, slides up 40px over 0.32s on `cubic-bezier(0.22, 1, 0.36, 1)`), centred 520px panel (640px tall variant) from 680px. Header 17px/800 with a close icon button. Agent questions open as blocking sheets that can't be dismissed by tapping outside or Esc.

### Map Pins
Leaflet on CARTO basemaps, light_all or dark_all following the color scheme. Pins are Surface pills (700, 12px) with a Strong Hairline border and the Float shadow. Cheapest gets a 2px ink border; picked shops fill red with white text; closed shops go muted. Pins cluster by on-screen distance at the current zoom; zooming in splits a cluster.

### Mission Bar and Game Layer
A sticky one-row bar under the top bar: چینو at 30px, a 13px/800 mission title (hidden on phones), and a step track of 20px nodes on a 3px hairline track. Done steps fill saffron with a pop; the finished bar washes Saffron Wash with a Saffron Ink title. The level chip is a 40px ring around an 800 numeral. The profile sheet shows a saffron XP bar on Saffron Wash, three hairline stat tiles, and a badge grid of medals (gray ring when locked, saffron fill and ring when earned).

### Toast
Surface, hairline, 16px corners, Float shadow, rising in over 0.42s from 110px above the bottom. A 40px icon disc on Saffron Wash, a 15px/800 title (Saffron Ink for savings and big wins), a 13px muted line. Big wins get a 2px saffron border and a burst of tiny price tags; the burst is skipped under reduced motion.

### چینو (mascot)
A 16×16 pixel-art shopping bag with a saffron price tag, drawn as crisp-edged SVG rects. It carries its own illustration palette (bag greens, tag saffron, cheek pink), separate from the UI tokens. Moods map to state: idle (blinks) on the mission bar, think while the agent works, happy on welcome and profile, cheer on wins, worried on errors.

## Do's and Don'ts

### Do:
- **Do** keep Torob red on pressable or selected things only: send, primary buttons, selected chips, checks, picked pins, focus rings.
- **Do** write red text in action-ink (#b51f33 light, #f79aa6 dark) and keep action (#ef4056) for fills.
- **Do** keep saffron for wins only: missions, savings, badges, levels.
- **Do** mark the best compare value with bold ink and a check, and leave ties unmarked.
- **Do** show listed price, price age and stock as separate facts; color a stale price age amber and write unknowns as "نامشخص" and unconfirmed stock as "تأیید نشده".
- **Do** put one data note per list instead of repeating caveats on each row.
- **Do** open agent questions as blocking sheets.
- **Do** cluster map pins by on-screen distance, and switch map tiles with the color scheme.
- **Do** define every new color in both the light `:root` and the dark `prefers-color-scheme` block under the same token name.
- **Do** use Persian, tabular digits and logical (inline-start/end) spacing everywhere.

### Don't:
- **Don't** put shadows on cards, rows or the composer; the Float shadow is for pins and toasts.
- **Don't** use red to emphasize, rank or decorate non-interactive content, and don't set text in the raw action red.
- **Don't** use saffron for actions, warnings or price levels.
- **Don't** add a second text input for search or chat outside the composer.
- **Don't** merge price, price age and stock into one claim, or imply stock is confirmed when the shop hasn't answered.
- **Don't** wrap the assistant's answer in a bubble; only the user's message gets one.
- **Don't** introduce another type family or weight steps beyond 400/500/600/700/800.
