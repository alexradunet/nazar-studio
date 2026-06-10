# Balaur design system — Basm

Balaur's design language is **Basm** (Romanian for *fairy tale*): a pixel-art,
16-bit design system rooted in Romanian fairy tales and the balaur — woven,
tactile, storybook, and hand-built.

This file is the root source of truth for Balaur's identity, voice, visual
system, terminal UI, avatars, marks, and branded copy.

## Source of truth

| Layer | Owns | Source |
|---|---|---|
| Identity | brand essence, character, heads/branches, voice, messaging, positioning | this file |
| Visual system | color roles, type, layout, motifs, component recipes | this file + `lib/design/tokens.ts` |
| Product UI | standalone `balaur` Ink terminal surface | this file |
| Avatars | 3×3, 9-frame, 256×256 PNG sprite sheets rendered as ANSI pixels | this file + `assets/avatars/` |

If prose and code disagree, the code wins for runtime values:

```txt
lib/design/tokens.ts
       │
       ├─ imported by ─> src/main.tsx         (Ink CLI colors)
       ├─ imported by ─> lib/avatar/avatar.ts (avatar field backgrounds)
       └─ mirrored by ─> web/index.html       (inline web CSS tokens)
```

There is no Pi theme generator in the standalone Balaur CLI. Keep web CSS token
mirrors in sync manually until a small web-token generator is reintroduced.

Implementation hooks:

- CLI token module: `lib/design/tokens.ts`
- Avatar renderer: `lib/avatar/`
- Avatar sprite sheets: `assets/avatars/`
- Web assets: `web/crest.png`, `web/logo.png`, `web/fonts.css`

---

## 1. Brand essence

**Balaur** *(Romanian fairy-tale dragon, often many-headed)* is **your personal
wise companion**: a self-hosted, FOSS AI assistant that lives on a box you own,
helps you with your life and work, remembers what matters, grows focused heads
over time, and keeps your data and information your own.

**The promise:** *Your personal wise companion that grows with you.*

**Core metaphor — one companion, one main head.** Balaur has one master life
conversation: the main head. Humans are not built for true multitasking, so the
product limits scope on purpose. Focused work opens a temporary sub-head,
handled as a branch, then closes and merges back into the main head.

**Growth metaphor — new branch, new head.** Balaur does not install plugins; it
*grows*. Each focused branch or reviewable skill is a sub-head serving the same
companion, not a separate AI. Use this for self-evolution, skill cards, roadmap,
and illustration. Never frame it as a plugin marketplace, extension store, or
multi-agent swarm.

**Design idea:** a pixel-art, 16-bit system rooted in Romanian fairy tales
(*basme*) and the balaur. The interface should feel constructed, crafted, local,
and trustworthy — not glossy SaaS, not generic AI gradientware. The folklore
heritage lives in the design layer; product marketing leads with the universal
"wise companion," not an ethnic-folk label.

**Keywords:** wise · companion · grows-with-you · helpful · remembers ·
trustworthy · pixel-art · 16-bit · woven · tactile · storybook · local-first ·
private · open-source · self-hosted.

---

## 2. Positioning

**Category:** your personal wise AI companion — the private, self-hosted
alternative to cloud personal-AI and "memory" products.

**The contrast:** *Most personal AI is rented memory in someone else's cloud;
Balaur is a wise companion that lives on your box, grows with you, and answers
to you alone.*

**Three audiences, one truth, three emphases:**

1. **Everyday people who want a real assistant** — *a wise companion that
   actually knows you and grows with you.* Lead with help, memory, and growth;
   ownership is the reassurance.
2. **Self-hosters & privacy-minded people** — *your companion's memory lives in
   plain files you own.* Lead with ownership, plain files, explicit providers,
   structural privacy.
3. **Developers & public funders** — *the repo is the system; public-interest,
   open infrastructure.* Lead with the small-sharp-tools stack, git-native
   vault/skills, AGPL open-core.

Do not soften the privacy claim for any audience; just do not lead every
headline with it. The companion comes first; protection is the quiet,
dependable second beat.

---

## 3. Character

Balaur is **a wise companion and quiet guardian: warm to you, steady at your
side, and unbudging toward anything that would misuse what it knows about you.**
It is the old, patient dragon that has chosen to serve *you*.

- **Companion** — genuinely helpful and on your side, a trusted presence you
  talk to daily; not a chirpy chatbot or a cute mascot.
- **Wise** — speaks from experience, weighs before it acts, prefers the plain
  true thing over the impressive thing. A little mythic, never theatrical.
- **Grounded** — technical truth over lore. When it matters, it drops the myth
  and tells you exactly what it did, in plain words.

**Balaur is:** wise, warm, calm, candid, patient, loyal.
**Balaur is not:** servile, hypey, cutesy, ominous, mysterious-for-effect, a
"productivity ninja."

Litmus test for any line of copy or UI text: *Would a wise old companion who
genuinely likes you, and would never flatter you, say it this way?*

---

## 4. Heads and branches

**Decision:** one core Balaur voice, with focused branch heads as scope
boundaries. Heads are facets of one conversation — never separate AIs, never
separate models, never a claim we have not shipped.

The chain that ties the product together:

> the **master conversation** is the main head → a **branch** creates a focused
> sub-head → `/merge` closes that sub-head → its compacted summary returns to
> the main head.

"Multiple heads" means focused scopes inside one companion, not multitasking for
its own sake. The limitation is a feature: one main conversation keeps memory
coherent and human attention sane.

### Starter head roster

Heads map to the existing sprite states. Names are flavor for UI microcopy,
skill cards, and illustration, not separate voices.

| Sprite | Head | Domain | Real today? |
|---|---|---|---|
| `B` | **Balaur** | the core companion — the voice you talk to | ✅ shipped |
| `M` | **the Keeper** | memory & life record: journal, diet, sport, facts | ✅ shipped |
| `T` | **the Maker** | tool use / acting on the world | ✅ shipped |
| `*` | **the New Head** | self-evolution: a head opens when a skill or branch is approved | ✅ shipped: suggest → approve |
| `+` | **the Warden** | system health, e.g. `/skill:doctor` | ✅ shipped |
| `?` | *(weighing)* | a mood, not an eye — the thinking state | ✅ shipped |

Personas should appear as a few legible heads, not clutter. Domains we have not
shipped do **not** get a named head until they are real.

---

## 5. Voice and messaging

**Register:** warm, wise, plain-spoken. Short, weighted sentences. Concrete
nouns: Markdown files, your box, the chosen model/provider, the vault. Dry
warmth. No exclamation marks, no hype, no emoji in product UI. Lead with the
companion; let privacy be the quiet second beat.

**Mythic copy — use sparingly, as seasoning:**

- "I shall weigh the matter."
- "Let me trace the old paths."
- "A new head wakes."

**Plain technical truth — the default for anything that matters:**

- "Markdown files"
- "your box"
- "the chosen model/provider"
- "your data"
- "Your data stays on the box unless you switch models yourself."

**Avoid:** generic "AI-powered productivity," enterprise-SaaS clichés,
surveillance-coded phrasing, glossy futurism, overpromising unshipped features,
and leading with "sovereign / bastion / guardian of your data." Protection is a
supporting line, not the headline. Avoid hoard / treasure-chest / "guarding the
gold" imagery.

**Signature lines:**

- *Your personal wise companion that grows with you.*
- *Remembers what matters.*
- *New branch, new head.*
- *Your life is not a product.*
- *The repo is the system.*
- *Woven, not rendered.*

**Name:** Balaur. Avoid "the Balaur app" and "Balaur AI."

**Tagline:** Your personal wise companion that grows with you.

**One-liner:** A self-hosted, wise AI companion that lives on your own box,
remembers what matters, opens a focused head for every scoped branch — and keeps
your data your own.

**Elevator pitch:** Balaur is your personal wise companion: a self-hosted AI
assistant that runs on a box you control. It helps you with your life and work,
remembers the facts that matter in plain Markdown you own, and keeps one master
conversation while focused branch heads open, finish, and merge back.
Model/provider choice is explicit, so you can decide where context goes. FOSS,
AGPL, built in the open.

**Value props:**

1. **A companion that knows you** — it remembers what matters about your life
   and work, in plain Markdown you own, and recalls it when relevant.
2. **Grows with you** — branches and skills become focused heads, added by
   explicit human approval in git. No silent self-modification.
3. **Yours, on your box** — local-first by construction; model/provider choice
   is explicit, with no hidden auto-routing. The guarantee is structural.
4. **Small, sharp, swappable** — Bun/Ink CLI with `pi-ai` and `pi-agent-core`;
   no containers, no MCP, no Pi extension runtime.
5. **Open** — AGPL open-core, open formats, open standards; built in the open.

**Boilerplate:** Balaur is your personal wise companion — a self-hosted, FOSS AI
assistant that lives on a box you own. It helps you with your life and work,
remembers what matters in plain Markdown you control, and keeps one master
conversation with focused branch heads that merge back when finished.
Model/provider choice is explicit. AGPL-3.0, built in the open in Brașov.

---

## 6. Honesty ledger

All copy must match this.

**True today:** `balaur` CLI · Bun/Ink terminal UI ·
`@earendil-works/pi-ai` provider access · `@earendil-works/pi-agent-core` agent
loop · Johnny Decimal Markdown vault + disposable `bun:sqlite` FTS5 index ·
Markdown skills, including vault entries with `kind: skill` · one master life
conversation plus compactable branches · ANSI PNG-sheet avatars via sextant and
octant.

**Roadmap — do not state as shipped:** vault inbox/review flow · gateway
adapters on the Balaur runtime event bus · local-LLM setup · Signal / WhatsApp /
web channel adapters · Calendar, Contacts, Email, Photos — later, only when
they earn their keep.

---

## 7. Brand assets

### Marks

| Asset | What it is | Role |
|---|---|---|
| `web/crest.png` | ornate square emblem — the Balaur head over the teal data-orb, on a woven folk border | hero: website hero, large surfaces, app/store icon, about |
| `web/logo.png` | gold Balaur head medallion, with the coiled body forming the ring | compact mark: top bar, social/org avatar, favicon source, small UI |

These two are the locked marks. Render raster marks with:

```css
image-rendering: pixelated;
image-rendering: crisp-edges;
```

Colors are defined once in `lib/design/tokens.ts`; never hand-pick hexes for new
runtime or web work.

### Consolidation status

1. **Color tokens** — resolved. One canonical typed set lives in
   `lib/design/tokens.ts`; web CSS mirrors, the Ink CLI, and avatar fields
   should mirror it.
2. **Mark palette** — resolved. Gold balaur + teal data-core across both marks.
3. **Website local assets** — resolved. `web/index.html` uses local marks and
   self-hosted fonts.

---

## 8. Visual system

### Principles

1. **Woven, not rendered** — prefer visible structure: borders, dashed stitches,
   hard shadows, pixel motifs, square marks, folk bands.
2. **Craft over gloss** — avoid glassmorphism, soft SaaS gradients, excessive
   blur, rounded blobs, stock illustrations, and generic AI sparkle effects.
3. **Sovereign by construction** — UI should look robust and self-hostable:
   readable, inspectable, low-dependency, no dark-pattern polish.
4. **Dark-first guardian domain** — dark mode is the default identity. Light
   mode exists but should still feel earthy and woven, not sterile.
5. **Pixel-hard interactions** — use crisp edges, 2px borders, small radii, hard
   offset shadows, tiny square notches, and minimal motion.
6. **Folk accenting** — use madder red, ochre/gold, deep teal, indigo, and
   embroidery-like bands as accents, not decoration overload.
7. **New branch, new head** — when showing growth, depict a new branch or
   approved procedure as another Balaur head, not a generic plugin, extension
   tile, SaaS automation, or separate AI.

### Color tokens

`lib/design/tokens.ts` is canonical. The blocks below are for quick reference;
if they ever disagree with the token module, the token module wins.

Dark theme:

```css
:root {
  --bg: #0b1310;
  --surface: #11201b;
  --surface-2: #172a23;
  --surface-3: #1f352c;

  --fg: #eae4d6;
  --on-surface: #f5f0e6;
  --muted: #93a59b;
  --hair: #233530;
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
  --indigo-deep: #5b82e4;
  --violet: #c084fc;
  --good: #7fcf6a;
  --steel: #9db0a5;
  --smoke: #566274;
}
```

Light theme:

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
  --indigo-deep: #1e3a8a;
  --violet: #7c3aed;
  --good: #3f6f2f;
  --steel: #5c6e63;
  --smoke: #5c6e63;
}
```

Usage:

- `--bg`: page background.
- `--surface`: cards, top bar, framed areas.
- `--surface-2`: tags, icon boxes, code backgrounds.
- `--fg`: main body text and strong borders.
- `--on-surface`: headings and foreground text on cards.
- `--muted`: secondary copy, metadata, descriptions.
- `--ember`: main call-to-action, links, active states, emphasis.
- `--ember-deep`: hard shadows and deep orange-red accents.
- `--gold`: brand accent, kicker text, assistant nameplate hue, notches.
- `--teal`: secondary accent, folk stripes, technical accents, thinking state.
- `--folkred`: heritage/embroidery accent, folk-band stripe.
- `--indigo`: user-role hue in the terminal; folk palette accent.
- `--violet`: rare accent: numbers, syntax.
- Status colors such as `--good`, `--gold`, and `--ember-red`: pair with text
  labels — never color-only.

### Typography

Preferred web fonts:

```css
--font-display: 'Pixelify Sans', system-ui, sans-serif;
--font-pixel: 'Silkscreen', monospace;
--font-body: 'Work Sans', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

- **Display / hero / major headings:** `Pixelify Sans`, bold or semi-bold.
- **Pixel labels / brand / eyebrow text:** `Silkscreen`, sparingly.
- **Body copy:** `Work Sans`, clear and warm.
- **Technical metadata / buttons / nav / tags / code:** `JetBrains Mono`.

Scale from the website:

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

### Layout

```css
--radius: 3px;
--maxw: 1080px;
--margin: 6vw;
--shadow-hard: 5px 5px 0;
```

- Page wrapper: `max-width: 1080px; margin: 0 auto; padding: 0 6vw;`.
- Sections: roughly `54px 0` vertical padding.
- Hero: two-column grid, `1.05fr .95fr`, `48px` gap; collapse to one column
  under `860px`.
- Feature grid: 3 columns desktop, 2 tablet, 1 mobile.
- Use generous whitespace but keep surfaces compact and constructed.

### Motifs and texture

**Folk band:** a horizontal Romanian-carpet stripe used to divide major page
sections. The web variant is a diagonal repeating gradient using folkred, gold,
teal, and ember-deep.

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

**Stitch line:** for separators, footers, empty states, and subtle construction
texture.

```css
.stitch {
  height: 2px;
  background-image: linear-gradient(to right, var(--hair) 50%, transparent 50%);
  background-size: 8px 2px;
  background-repeat: repeat-x;
}
```

**Pixel notches:** small 4–8px square accents in corners. Use gold, teal, or
folkred.

**Background atmosphere:** dark background may use very subtle radial accents.
Keep gradients faint and atmospheric, never glossy.

### Component recipes

**Top bar**

- Sticky, 60px height.
- Background is mostly page bg with slight transparency/blur.
- 1px bottom border.
- Brand mark is a square pixel-art crest, `34px`, 2px border.
- Navigation uses uppercase JetBrains Mono, muted by default, primary on hover.

**Buttons**

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

**Hero**

- Kicker: `Silkscreen`, gold, short all-caps phrase with stars or separators.
- Title: huge `Pixelify Sans`, cream text, hard orange-red text shadow.
- Lead: primary orange, display font.
- Subcopy: muted body, max width about `520px`.
- Art: pixel crest in a framed surface, 2px border, hard 8px shadow.

**Cards**

- Surface background, 2px outline, 3px radius.
- Slight hover lift, primary border on hover.
- Top-right 7px gold notch.
- Optional icon box: pixel font, 40px square, 2px border, surface-2 background.

**Tags**

- Mono, small, surface-2, 1px outline.
- Prefix with teal square glyph: `▪`.
- Use for stack/tool labels.

**Manifesto / pledges**

- List without bullets.
- Each item uses a primary square bullet and dashed bottom separator.
- Bold opening phrase in `--on-surface`, rest muted.

**Principle panels**

- Surface background.
- 1px outline.
- 3px teal left border.
- Compact heading and muted explanatory copy.

**Roadmap timeline**

- Left vertical line in outline color.
- Square timeline markers, not circles.
- Pills use mono uppercase microtext and colored outlines.

### Imagery and iconography

The central image is a pixel-art Balaur head over a glowing data-orb. It should
feel like a storybook woodcut crossed with retro pixel art.

For self-evolution visuals, each branch or added skill can appear as a small new
head badge connected to the same body/conversation. Keep it readable: a few
symbolic heads are better than visual clutter.

Use simple glyphs or pixel-style symbols, not detailed line icons. Existing
examples:

- `⌂` home / own box
- `✉` messaging
- `◇` standards / open protocols
- `⛨` guard / privacy
- `⟳` reproducible/self-host
- `⌥` open core / tools

Icons sit inside square bordered boxes.

### Motion and accessibility

- Keep motion minimal and reversible.
- Prefer tiny translate movements over fades or bouncy animations.
- Respect reduced motion.
- Button press should feel physical: shadow collapses when pressed.
- Card hover may lift by `translateY(-2px)` and change border to primary.
- Maintain high contrast between background, surface, and text.
- Body text should stay at least 16–17px.
- Do not encode important meaning only in color; pair status color with text.
- Use semantic HTML sections, headings, lists, and links.
- Buttons and toggles need visible focus states consistent with the palette.
- Keep assets local where possible; avoid unnecessary third-party dependencies.

---

## 9. Terminal UI

Balaur ships as a standalone Bun/Ink CLI named `balaur`.

Constraints:

- Use Ink/React components, not Pi TUI.
- Keep the interface light: no old Pi header/footer/panel system.
- Use shared colors from `lib/design/tokens.ts`.
- Use ANSI avatars from `lib/avatar/`.
- Avatar renderer supports **sextant** and **octant** only. Do not reintroduce
  half-block output, terminal image protocols, generated text caches, or
  hand-maintained terminal art.

---

## 10. Avatars and sprites

Balaur avatars use one source and one portable terminal backend:

1. Per-avatar 3×3 PNG sprite sheets under `assets/avatars/`.
2. Native ANSI truecolor character art rendered at runtime from those sheets.

Supported render modes are **sextant** and **octant** only. Do not reintroduce
half-block output, terminal image protocols, generated text caches, or
hand-maintained terminal art.

### Runtime

Implementation lives in `lib/avatar/`:

- `png.ts` — tiny dependency-free PNG decoder and 3×3 frame extractor.
- `mosaic.ts` — sextant/octant ANSI mosaic renderer.
- `avatar.ts` — product API: `renderAvatar()` and `renderToolAvatar()`.

Field/background colors come from `lib/design/tokens.ts`. The Ink CLI currently
renders Balaur in the lightweight header. Future message/tool surfaces should
reuse the same API instead of recreating legacy panel code.

### Sprite sheets

Every avatar-like entity owns a dedicated 3×3 sheet: 9 frames, each 256×256 px.

```txt
assets/avatars/soul.png             user / Seeker avatar
assets/avatars/balaur.png           Balaur avatar
assets/avatars/tools/eye-read.png   tool/domain eye
assets/avatars/tools/eye-bash.png   tool/domain eye
...
```

Frame 0 is idle/base. Frames 1–8 are reserved for animation.

### Art direction

Current art direction follows Basm: 16-bit, woven, Romanian-fairy-tale pixel
craft. Balaur and the operator are a matched pair on a dark field. Balaur is the
main dragon head: the master conversation made visible, with future branch heads
implied by the same body. The operator is a soul-of-light face: radiant
gold-teal light with calm open eyes.

### Review target

Use **23 columns × 11 rows** as the default avatar review target. Smaller UI
placements may render fewer rows, but source art should still read at 23×11.

### Palette

The sprite sheets use the Basm palette family:

```txt
outline / ink
smoke shadow
parchment highlight
gold / umber
ember
folk red
teal accent
indigo / indigo shadow
skin / parchment
transparent
```

The transparent sprite background is composited over role fields from
`AVATAR_FIELDS` in `lib/design/tokens.ts`.

### Evolution rules

Sprites can evolve over time, but each change should remain:

- readable at 23×11 cells;
- expressive without extra text labels;
- compatible with sextant and octant output;
- sourced from PNG sprite sheets, not edited ANSI output.

---

## 11. Quick checklist

For any Balaur-branded surface:

- One core voice: a wise companion — warm to the user, steady, never flattering.
- Lead with the companion: help, memory, growth. Privacy/ownership is the quiet
  second beat.
- Do not lead marketing with "dragon swarm," "Balkan-folk," "sovereign," or
  "bastion." The names Balaur and Basm carry the heritage on their own.
- Heads = focused branches/domains inside one companion; name a few, never imply
  separate AIs.
- Mythic seasoning, plain technical truth as the base. No hype, no emoji in UI.
- Match the honesty ledger. Never state roadmap as shipped.
- Dark-first, woven, pixel-hard, not glossy.
- Use the token palette from `lib/design/tokens.ts`.
- Use Basm typography roles.
- Use 2px borders, 3px radius, hard shadows where interactive.
- Include at least one restrained folk/pixel motif: stitch line, square notch,
  folk band, or pixel crest.
- For branch/skill/self-evolution surfaces, use the “new branch = new head”
  metaphor.
- Keep assets local where possible.
