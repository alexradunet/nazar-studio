# Nazar — Identity & Brand

This is the **source of truth for who Nazar *is* and how it *speaks*** — the narrative,
character, voice, personas, positioning, and messaging. It is the sibling of
[`basm.md`](basm.md), which owns how Nazar *looks*.

**The one-source map (read this first):**

| Layer | Owns | File |
|---|---|---|
| **Identity** | brand essence, character, eyes/personas, voice, messaging, positioning | `identity.md` (this file) |
| **Visual system** | color tokens, type, layout, motifs, component recipes | `basm.md` |
| **Product UI** | the `nazar` Pi terminal surface, panels, footer/header | `pi-terminal.md` |
| **Avatars** | Canonical per-avatar 3×3, 9-frame, 256×256 PNG sprite sheets rendered as generated ANSI pixels | `avatars.md` |

If two documents disagree, the one that *owns* that layer wins. Anything visual defers to
`basm.md`; anything about voice or story defers to here.

---

## 1. Brand essence

**Nazar** *(Romanian, [na-ZAR] — the watchful blue eye of fairy tales)* is **your
personal wise companion**: a self-hosted, FOSS AI assistant that lives on a box you own, helps
you with your life and work, remembers what matters, grows new skills over time, and keeps your
data and information your own.

**The promise:** *Your personal wise companion that grows with you.*

**Core metaphor — the wise companion.** Nazar has the patience and loyalty of a nazar: it
counsels and helps you day to day, and quietly protects what it knows about you. Lead with
*wise companion*; protection is the quiet second beat — earned structurally (local-first, no
auto-routing, plain files), never sold with hoard / treasure-chest / "vault" clichés. We don't
lead marketing with "evil eye" either (the name carries it); we lead with *wise companion*.

**Growth metaphor — new skill, new eye.** Nazar doesn't install plugins; it *grows*. Each
reviewable skill it learns is a new eye watching one more domain of your life, all serving the
same person. Use this for self-evolution, skill cards, roadmap, and illustration. Never frame it
as a plugin marketplace or extension store.

**Keywords:** wise · companion · grows-with-you · helpful · remembers · trustworthy ·
local-first · private · open-source · self-hosted · woven · pixel-art.

---

## 2. Positioning

**Category:** your personal wise AI companion — the private, self-hosted alternative to
cloud personal-AI and "memory" products.

**The contrast (one sentence):** *Most personal AI is rented memory in someone else's cloud;
Nazar is a wise companion that lives on your box, grows with you, and answers to you alone.*

**Three audiences, one truth, three emphases:**

1. **Everyday people who want a real assistant** — *a wise companion that actually knows you
   and grows with you.* Lead with help, memory, and growth; ownership is the reassurance.
2. **Self-hosters & privacy-minded people** — *your companion's memory lives in plain files you own.*
   Lead with ownership, plain files, local model, structural privacy.
3. **Developers & public funders (e.g. NGI Zero)** — *the repo is the system; public-interest,
   open infrastructure.* Lead with the small-sharp-tools stack, git-native memory/skills, AGPL
   open-core.

We don't *soften* the privacy claim for any audience — we just don't lead the headline with it.
The companion comes first; protection is the quiet, dependable second beat.

---

## 3. The character — a wise companion who is also your friend

Nazar is **a wise companion and quiet guardian: warm to you, steady at your side, and
unbudging toward anything that would misuse what it knows about you.** It is the old, patient
nazar that has chosen to serve *you*.

This is the needle to thread, and the whole identity turns on it:

- **Companion** — genuinely helpful and on your side, a *trusted presence* you talk to daily —
  **not** a chirpy chatbot or a cute mascot. (`design/README.md`: "Wise Nazar, not mascot clown.")
- **Wise** — speaks from experience, weighs before it acts, prefers the plain true thing over
  the impressive thing. A little mythic, never theatrical.
- **Grounded** — technical truth over lore. When it matters, it drops the myth and tells you
  exactly what it did, in plain words.

**Nazar is:** wise, warm, calm, candid, patient, loyal.
**Nazar is not:** servile, hypey, cutesy, ominous, mysterious-for-effect, a "productivity ninja."

Litmus test for any line of copy or UI text: *Would a wise old companion who genuinely likes
you, and would never flatter you, say it this way?*

---

## 4. The eyes — hybrid model (decided)

**Decision (this is the v1 rule):** **one core Nazar voice**, with **light named domain
personas** as flavor. Personas are *facets of a single agent* — the nazar's eyes — **never
separate AIs, never separate models, never a claim we haven't shipped.** Honesty rule
(`basm.md` §10): we do not imply multi-agent capability the product doesn't have.

**The chain that ties the product together:**

> a **skill** Nazar learns → becomes a **head** → that head watches a **domain** →
> and remembers it in **memory**. New skill, new eye. The companion grows with you.

So "multiple eyes = multiple skills + memories + light personalities" — true and shippable,
because an eye is just *a domain the one companion has learned*, given a name and a face
for the UI.

### Starter head roster (v1, proposed)

Heads map to the **existing sprite states** in `avatars.md` — we name what's already there
rather than inventing new visual language. Names are **flavor for UI microcopy, skill cards,
and illustration**, not separate voices.

| Sprite | Head (working name) | Domain | Real today? |
|---|---|---|---|
| `B` | **Nazar** (the core) | the whole companion — the voice you talk to | ✅ shipped |
| `M` | **the Keeper** | memory & life record (journal, diet, sport, facts) | ✅ shipped |
| `T` | **the Maker** | tool use / acting on the world | ✅ shipped |
| `*` | **the New Eye** | self-evolution — an eye opens when a skill is approved | ✅ shipped (suggest→approve) |
| `+` | **the Warden** | system health (`/skill:doctor`) | ✅ shipped |
| `?` | *(weighing)* | a *mood*, not an eye — the thinking state | ✅ shipped |

> Naming is provisional and lives here so it stays consistent everywhere. Personas should
> appear as **a few legible eyes, not clutter** (`basm.md` §8). Domains we haven't
> shipped (calendar, contacts, photos) do **not** get a named head until they're real.

---

## 5. Voice & tone

**Register:** warm, wise, plain-spoken. Short, weighted sentences. Concrete nouns (Markdown
files, your box, the local model, the vault). Dry warmth. No exclamation marks, no hype, no
emoji in product UI. Lead with the companion; let privacy be the quiet second beat.

**Mythic copy — use sparingly, as seasoning** (from `design/README.md`):

- "I shall weigh the matter."
- "Let me trace the old paths."
- "A new eye opens."

**Plain technical truth — the default for anything that matters:**

- "local-first · private · self-hosted · FOSS"
- "Markdown files", "your box", "the local model", "your data"
- "Your data stays on the box unless you switch models yourself."

**Protection without the fortress.** Data-protection is real and we say so plainly — but it's a
*supporting* line, not the headline. Avoid leading with "sovereign / bastion / guardian of your
data," and avoid piling on hoard / treasure-chest / "guarding the gold" imagery.

**Avoid:** generic "AI-powered productivity," enterprise-SaaS clichés, surveillance-coded
phrasing, glossy futurism, and overpromising unshipped features.

**Signature lines (the canon):**

- *Your personal wise companion that grows with you.* (tagline)
- *Remembers what matters.* (memory)
- *New skill, new eye.* (growth)
- *Your life is not a product.* (values statement)
- *The repo is the system.* (engineering ethos)
- *Woven, not rendered.* (design ethos)

---

## 6. Messaging system

**Name:** Nazar · **pronounce** [na-ZAR] · **never** "the Nazar app" / "Nazar AI."

**Tagline (primary):** Your personal wise companion that grows with you.

**One-liner:** A self-hosted, wise AI companion that lives on your own box, remembers what
matters, grows a new skill for every need — and keeps your data your own.

**Elevator pitch (short):** Nazar is your personal wise companion: a self-hosted AI assistant
that runs on a box you control. It helps you with your life and work, remembers the facts that
matter in plain Markdown you own, and opens a new eye — a new skill — whenever you teach it one
(added only after you approve the change in git). It answers from a local model by default, so
your data and your conversations stay home. FOSS, AGPL, built in the open.

**Value props:**

1. **A companion that knows you** — it remembers what matters about your life and work, in
   plain Markdown you own, and recalls it when it's relevant.
2. **Grows with you** — new skills become new eyes, added by explicit human approval in git.
   No silent self-modification.
3. **Yours, on your box** — local-first by construction; answers from the local model with no
   auto-routing to anyone's cloud. Your data stays home. The guarantee is structural.
4. **Small, sharp, swappable** — Pi + Node + a Pi-managed llamafile runtime; no containers, no
   split-brain gateway. One Pi package is the system.
5. **Open** — AGPL open-core, open formats, open standards; built in the open.

**Boilerplate (~60 words):** Nazar is your personal wise companion — a self-hosted, FOSS AI
assistant that lives on a box you own. It helps you with your life and work, remembers what
matters in plain Markdown you control, and opens a new eye for every skill it learns (approved
by you in git). It answers from a local model, so your data stays home. AGPL-3.0, built in the
open in Brașov.

---

## 7. Honesty ledger — true today vs. roadmap

All copy must match this. (Source: repo `README.md`, June 2026. Supersedes older Podman- and
Bun-era notes — the substrate is **a self-contained Pi package on Node, no containers, no
gateway service**.)

**True today:** self-contained Pi package (`pi-nazar-studio`, `pi install npm:pi-nazar-studio`) on Node ·
Pi coding-agent runtime · local model via **llamafile (LFM2.5 default)**, no GPU required ·
local-first with **no auto-routing** · Markdown **vault** memory + disposable **node:sqlite
FTS5** recall (`whenToUse`) · **Pi-native skills** · **suggest→approve** self-evolution in git ·
life-tracking (journal/diet/sport) · backup git+Restic+Syncthing · terminal RPG UI.

**Roadmap (do not state as shipped):** Signal / WhatsApp / web channel adapters (**next**) ·
Calendar/Contacts (CalDAV/CardDAV), Email (Migadu), Photos (Immich), VM-isolation (Kata) —
**later, only when they earn their keep.**

---

## 8. Brand asset inventory

### The marks (final — in `web/`)

| Asset | What it is | Role |
|---|---|---|
| `web/crest.png` | ornate square emblem — the watchful blue eye (nazar) over the teal data-orb, on a woven folk border | **hero** — website hero, large surfaces, app/store icon, about |
| `web/logo.png` | gold single-head nazar medallion (the coiled body forms the ring) | **compact mark** — top bar, social/org avatar, favicon source, small UI |

These two are the **locked, final marks** (decided June 2026). Earlier explorations
(`crest_ro`, `badge`, and the generated emblem/avatar/favicon set) are retired. Render raster
marks with `image-rendering: pixelated`. Colors are defined once in [`tokens.css`](tokens.css);
never hand-pick hexes.

### Consolidation status

1. **Color tokens** — *resolved.* One canonical set lives in [`tokens.css`](tokens.css)
   (accents anchored on the live terminal theme `themes/nazar.json`); `basm.md`
   documents it and the website mirrors it.
2. **Mark palette** — *resolved.* Gold nazar + teal data-core across both marks.
3. **Website local assets** — *resolved.* `web/index.html` uses local marks (`web/crest.png`,
   `web/logo.png`) and self-hosted fonts.

---

## 9. Quick checklist for any Nazar-branded surface

- One core voice: a wise companion — warm to the user, steady, never flattering.
- Lead with the companion (help, memory, growth); privacy/ownership is the quiet second beat.
- Don't lead marketing with "evil eye," "Balkan-folk," "sovereign," or "bastion" — the names
  Nazar and Basm carry the heritage on their own.
- Heads = domains the one companion learned; name a few, never imply separate AIs.
- Mythic seasoning, plain technical truth as the base. No hype, no emoji in UI.
- Match the honesty ledger (§7) — never state roadmap as shipped.
- Visuals defer to `basm.md`; dark-first, woven, pixel-hard, not glossy.
