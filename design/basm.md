# Nazar Design System — Basm

This document is the reusable visual system for Nazar. It is written for LLM agents and implementers who need to create Nazar UI, marketing pages, docs, social assets, or app surfaces that feel consistent.

## 1. Brand essence

**Product:** Nazar — your personal wise companion: a self-hosted, FOSS AI assistant that helps you, remembers what matters, grows with you, and keeps your data and information your own.

**Core metaphor:** a wise companion with the patience and loyalty of a *nazar* (the watchful blue eye of Mediterranean and Balkan tradition). It counsels and helps you day to day, and quietly protects what it knows about you. Lead with *wise companion*; protection is the quiet second beat — never lean on chest / hoard / "vault" clichés, and don't lead with "evil eye" (the name carries it).

**Growth metaphor:** every approved skill is a **new eye of the nazar**. It grows by learning reviewable procedures; each head watches one domain while serving the same person. Use this for self-evolution, skill cards, roadmap states, and illustrations. Avoid plugin-marketplace metaphors.

**Design language name:** **Basm** (Romanian for *fairy tale*).

**Design idea:** a **pixel-art, 16-bit design system rooted in Romanian fairy tales (*basme*) and the nazar** — woven, tactile, storybook, hand-built. The interface should feel constructed, crafted, local, and trustworthy — not glossy SaaS, not generic AI gradientware. (The folklore heritage lives here, in the *design* layer; product marketing leads with the universal "wise companion," not an ethnic-folk label.)

**Keywords:** wise, companion, grows-with-you, helpful, trustworthy · pixel-art, 16-bit, woven, tactile, storybook, nazar, basm · local-first, private, open-source, self-hosted.

**Emotional tone:** wise, warm, calm, helpful, handmade, a little mythic.

## 2. Visual principles

1. **Woven, not rendered**  
   Prefer visible structure: borders, dashed stitches, hard shadows, pixel motifs, square marks, folk bands.

2. **Craft over gloss**  
   Avoid glassmorphism, soft SaaS gradients, excessive blur, rounded blobs, stock illustrations, and generic AI sparkle effects.

3. **Sovereign by construction**  
   UI should look robust and self-hostable: readable, inspectable, low-dependency, no dark-pattern polish.

4. **Dark-first guardian domain**  
   Dark mode is the default identity. Light mode exists but should still feel earthy and woven, not sterile.

5. **Pixel-hard interactions**  
   Use crisp edges, 2px borders, small radii, hard offset shadows, tiny square notches, and minimal motion.

6. **Folk accenting**  
   Use madder red, ochre/gold, deep teal, indigo, and embroidery-like bands as accents, not decoration overload.

7. **New skill, new eye**  
   When showing growth, depict a new approved procedure as another Nazar head — not as a generic plugin, extension tile, or SaaS automation. The head appears after human approval.

## 3. Color tokens

> **Single source of truth.** All Nazar colours live in
> [`../lib/ui/tokens.ts`](../lib/ui/tokens.ts) (the typed token module). The
> Pi terminal theme ([`../themes/nazar.json`](../themes/nazar.json)), the web
> CSS variables ([`tokens.css`](tokens.css)), the terminal panel palette, and
> the avatar field backgrounds are all derived from it.
>
> Run `npm run build:tokens` after touching `tokens.ts` to regenerate the
> theme JSON and the CSS file. CI rejects drift via the guard test in
> `lib/ui/tokens.test.ts`.
>
> The blocks below mirror the canonical values for at-a-glance reference.
> If they ever disagree with `tokens.ts`, `tokens.ts` wins.

### Dark theme — default

```css
:root {
  --bg: #0b1310;
  --surface: #11201b;
  --surface-2: #172a23;
  --surface-3: #1f352c;

  --fg: #eae4d6;          /* warm cream body text */
  --on-surface: #f5f0e6;  /* headings / strong foreground */
  --muted: #93a59b;       /* secondary copy, metadata */
  --hair: #233530;        /* hairlines, borders */
  --outline-2: #1a2823;

  --gold: #f2c14e;
  --gold-deep: #b8862a;
  --ember: #ff6a2b;
  --ember-deep: #c2410c;
  --ember-red: #e5484d;
  --teal: #2dd4bf;
  --teal-deep: #0d9488;
  --folkred: #e0563b;
  --indigo: #a8c0f0;
  --violet: #c084fc;

  --ok: var(--teal);
  --warn: var(--gold);
  --err: var(--ember-red);
}
```

### Light theme

```css
:root.light {
  --bg: #f5f1e8;
  --surface: #fffdf7;
  --surface-2: #ece6d7;
  --surface-3: #e3dcc9;

  --fg: #18221d;
  --on-surface: #121b16;
  --muted: #5c6e63;
  --hair: #d8d0bf;
  --outline-2: #e2dccb;

  --gold: #8a6d12;
  --gold-deep: #6b5410;
  --ember: #c2410c;
  --ember-deep: #9a3410;
  --ember-red: #b42318;
  --teal: #00656b;
  --teal-deep: #024a4f;
  --folkred: #983f20;
  --indigo: #1e3a8a;
  --violet: #7c3aed;
}
```

### Color usage

- `--bg`: page background.
- `--surface`: cards, top bar, framed areas.
- `--surface-2`: tags, icon boxes, code backgrounds.
- `--fg`: main body text and strong borders.
- `--on-surface`: headings and foreground text on cards.
- `--muted`: secondary copy, metadata, descriptions.
- `--ember`: main call-to-action, links, active states, emphasis.
- `--ember-deep`: hard shadows and deep orange-red accents.
- `--gold`: brand accent, kicker text, the nameplate plaque hue in the
  terminal (assistant role), small square notches.
- `--teal`: secondary accent, folk stripes, technical/sovereign accents;
  also the thinking-state hue in the terminal.
- `--folkred`: heritage/embroidery accent, folk-band stripe.
- `--indigo`: the user-role hue in the terminal; folk palette accent.
- `--violet`: rare accent (numbers, syntax).
- `--ok` / `--warn` / `--err`: semantic status aliases, paired with text
  labels — never colour-only.

## 4. Typography

Preferred web fonts from Google Fonts:

```css
--font-display: 'Pixelify Sans', system-ui, sans-serif;
--font-pixel: 'Silkscreen', monospace;
--font-body: 'Work Sans', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

### Type roles

- **Display / hero / major headings:** `Pixelify Sans`, bold or semi-bold. Large, compressed line-height, mythic pixel character.
- **Pixel labels / brand / eyebrow text:** `Silkscreen`. Use sparingly for short labels, kickers, numbers, brand marks.
- **Body copy:** `Work Sans`. Clear, warm, readable.
- **Technical metadata / buttons / nav / tags / code:** `JetBrains Mono`.

### Scale from website

```css
body: 17px / 1.6 Work Sans;
hero h1: clamp(58px, 12vw, 104px), line-height .86;
hero lead: clamp(20px, 3vw, 26px), line-height 1.25;
h2: clamp(28px, 4.4vw, 40px), line-height 1.05;
lede: clamp(20px, 3vw, 27px), line-height 1.3;
card h3: 19px;
card body: 14.5px / 1.55;
nav/button/tag: 11–13px JetBrains Mono uppercase;
```

## 5. Layout system

```css
--radius: 3px;
--maxw: 1080px;
--margin: 6vw;
```

- Page wrapper: `max-width: 1080px; margin: 0 auto; padding: 0 6vw;`.
- Sections: roughly `54px 0` vertical padding.
- Hero: two-column grid, `1.05fr .95fr`, `48px` gap; collapse to one column under `860px`.
- Feature grid: 3 columns desktop, 2 tablet, 1 mobile.
- Use generous whitespace but keep surfaces compact and constructed.

## 6. Motifs and texture

### Folk band

A horizontal Romanian-carpet stripe used to divide major page sections.
The web variant is a diagonal repeating-gradient (below); the terminal
variant is a row of background-painted spaces cycling the same four
hues — see `renderFolkBand()` in `lib/ui/header.ts`. Both lift the same
four tokens (folkred / gold / teal / ember-deep), so the carpet feels
the same across surfaces.

```css
.folk-band {
  height: 16px;
  width: 100%;
  background: repeating-linear-gradient(
    135deg,
    var(--folkred) 0 8px,
    var(--gold) 8px 16px,
    var(--teal) 16px 24px,
    var(--ember-deep) 24px 32px
  );
  border-top: 2px solid var(--fg);
  border-bottom: 2px solid var(--fg);
  image-rendering: pixelated;
}
```

Use between large narrative blocks. Do not overuse inside dense app UI.

### Stitch line

```css
.stitch {
  height: 2px;
  background-image: linear-gradient(to right, var(--outline) 50%, transparent 50%);
  background-size: 8px 2px;
  background-repeat: repeat-x;
}
```

Use for separators, footers, empty states, and subtle construction texture.

### Pixel notches

Small 4–8px square accents in corners. Use gold, teal, or folkred.

Example: top-right gold square on cards; four corner notches on crest frames.

### Background atmosphere

Dark background may use very subtle radial accents only:

```css
background-image:
  radial-gradient(circle at 12% -10%, rgba(118,213,220,.06), transparent 40%),
  radial-gradient(circle at 90% 0%, rgba(255,138,76,.07), transparent 42%);
```

Keep gradients faint and atmospheric, never glossy.

## 7. Component recipes

### Top bar

- Sticky, 60px height.
- Background is mostly page bg with slight transparency/blur.
- 1px bottom border.
- Brand mark is a square pixel-art crest, `34px`, 2px border.
- Navigation uses uppercase JetBrains Mono, muted by default, primary on hover.

### Buttons

Buttons are squared, uppercase, mono, with 2px border and hard pixel shadow.

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: .06em;
  padding: 13px 20px;
  border-radius: var(--radius);
  border: 2px solid var(--on-surface);
  transition: transform .08s, box-shadow .08s;
}
.btn-primary {
  background: var(--ember);
  color: #1a0e07;
  box-shadow: var(--shadow-hard) var(--ember-deep);
}
.btn-ghost {
  background: var(--surface);
  color: var(--on-surface);
  box-shadow: var(--shadow-hard) var(--hair);
}
.btn:hover { transform: translate(1px, 1px); }
.btn:active { transform: translate(5px, 5px); box-shadow: 0 0 0; }
```

### Hero

- Kicker: `Silkscreen`, gold, short all-caps phrase with stars or separators.
- Title: huge `Pixelify Sans`, cream text, hard orange-red text shadow.
- Lead: primary orange, display font.
- Subcopy: muted body, max width ~520px.
- Art: pixel crest in a framed surface, 2px border, hard 8px shadow.

Hero title style:

```css
h1.title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(58px, 12vw, 104px);
  line-height: .86;
  color: var(--on-surface);
  text-shadow: 4px 4px 0 var(--ember-deep);
}
```

### Cards

- Surface background, 2px outline, 3px radius.
- Slight hover lift, primary border on hover.
- Top-right 7px gold notch.
- Optional icon box: pixel font, 40px square, 2px border, surface-2 background.

### Tags

- Mono, small, surface-2, 1px outline.
- Prefix with teal square glyph: `▪`.
- Use for stack/tool labels.

### Manifesto / pledges

- List without bullets.
- Each item uses a primary square bullet and dashed bottom separator.
- Bold opening phrase in `--on-surface`, rest muted.

### Principle panels

- Surface background.
- 1px outline.
- 3px teal left border.
- Compact heading and muted explanatory copy.

### Roadmap timeline

- Left vertical line in outline color.
- Square timeline markers, not circles.
- State colors:
  - done: `--good`
  - now: `--primary`
  - next: `--teal`
  - later/horizon: `--gold`
- Pills use mono uppercase microtext and colored outlines.

## 8. Imagery and iconography

### Crest / mascot

The central image is a pixel-art nazar: the watchful blue eye (the *nazar boncuğu*) over a glowing data-orb. It should feel like a storybook woodcut crossed with retro pixel-art.

For self-evolution visuals, each added skill can appear as a small new eye, head badge, or domain watcher connected to the same body/vault. Keep it readable: a few symbolic eyes are better than visual clutter.

Use with:

```css
image-rendering: pixelated;
image-rendering: crisp-edges;
```

### Icon style

Use simple glyphs or pixel-style symbols, not detailed line icons. Existing examples:

- `⌂` home / own box
- `✉` messaging
- `◇` standards / open protocols
- `⛨` guard / privacy
- `⟳` reproducible/self-host
- `⌥` open core / tools

Icons sit inside square bordered boxes.

## 9. Motion and interaction

- Keep motion minimal and reversible.
- Prefer tiny translate movements over fades or bouncy animations.
- Respect reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; scroll-behavior: auto; }
}
```

- Button press should feel physical: shadow collapses when pressed.
- Card hover may lift by `translateY(-2px)` and change border to primary.

## 10. Voice and copy style

Use warm, wise, plain-spoken language. Lead with the companion; let privacy be the quiet second beat.

Good phrases:

- "Your personal wise companion that grows with you."
- "Remembers what matters."
- "New skill, new eye."
- "Your data stays your own."
- "Plain files you can read, move, and delete."
- "Local-first, private by default."
- "Built in the open."
- "The repo is the system."
- "Woven, not rendered."

Avoid:

- Generic "AI-powered productivity" language.
- Enterprise SaaS clichés.
- Leading with "sovereign / bastion / guardian of your data" — protection is a supporting strength, not the headline.
- Leading with "Romanian-folk" as a product label — the names Nazar and Basm carry the heritage.
- Claims that imply surveillance or cloud dependency.
- Overpromising features that are not shipped.

## 11. Accessibility and implementation notes

- Maintain high contrast between background, surface, and text.
- Body text should stay at least 16–17px.
- Do not encode important meaning only in color; pair status color with text labels.
- Use semantic HTML sections, headings, lists, and links.
- Buttons and toggles need focus states; use visible outlines consistent with `--primary` or `--teal`.
- Keep assets local where possible; avoid unnecessary third-party dependencies.
- If using external fonts is undesirable, fall back to system fonts but preserve role distinctions: display, pixel/mono labels, body, mono technical text.

## 12. Quick implementation checklist

When creating a new Nazar visual surface, ensure it has:

- Dark-first theme using the token palette above.
- Basm typography roles.
- 2px borders, 3px radius, hard shadows where interactive.
- At least one restrained folk/pixel motif: stitch line, square notch, folk band, or pixel crest.
- For skill/self-evolution surfaces, use the “new skill = new eye” metaphor.
- Sovereignty-first copy: local, open, inspectable, user-owned.
- No glossy SaaS styling, no generic AI gradients, no surveillance-coded messaging.

## 13. Minimal CSS starter

For new surfaces, link the canonical token file instead of copy-pasting
the palette:

```html
<link rel="stylesheet" href="/path/to/design/tokens.css">
```

Then write only the structure / component CSS. Reference for ad-hoc cases:

```css
:root {
  /* Surfaces (dark) */
  --bg:#0b1310; --surface:#11201b; --surface-2:#172a23; --surface-3:#1f352c;
  --fg:#eae4d6; --on-surface:#f5f0e6; --muted:#93a59b; --hair:#233530;
  /* Brand accents */
  --gold:#f2c14e; --gold-deep:#b8862a;
  --ember:#ff6a2b; --ember-deep:#c2410c; --ember-red:#e5484d;
  --teal:#2dd4bf; --teal-deep:#0d9488;
  --folkred:#e0563b; --indigo:#a8c0f0; --violet:#c084fc;
  /* Type */
  --font-display:'Pixelify Sans',system-ui,sans-serif;
  --font-pixel:'Silkscreen',monospace;
  --font-body:'Work Sans',system-ui,sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,monospace;
  /* Layout */
  --radius:3px; --maxw:1080px; --margin:6vw; --shadow-hard:5px 5px 0;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.6;
}

.wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--margin); }
h1, h2, h3 { font-family: var(--font-display); color: var(--on-surface); }
a { color: var(--ember); text-decoration: none; }
.pixel { image-rendering: pixelated; image-rendering: crisp-edges; }

.card {
  position: relative;
  background: var(--surface);
  border: 2px solid var(--hair);
  border-radius: var(--radius);
  padding: 22px 20px;
}
.card::after {
  /* signature 7×7 gold notch in the top-right corner */
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 7px;
  height: 7px;
  background: var(--gold);
}
```
