# Nazar avatars and sprites

Nazar avatars use **one canonical source and one portable terminal backend**:

1. **Per-avatar 256×256 PNG sprite sheets** — source of truth under `assets/avatars/`.
2. **Native ANSI rendering** — truecolor SGR character art generated directly from the source sheets: `low` = half-block, `medium` = sextant, `high` = octant.

Do not maintain separate terminal art by hand. New avatars start as 256×256 frames in their own sprite sheet; Nazar's renderer samples those masters at runtime.

Current art direction follows **Basm**: 16-bit, woven, Romanian-fairy-tale pixel craft. Nazar and the operator are a matched pair on a dark field, but the old orb vessel is gone so the silhouette can read at 23×11 cells. **Nazar is the bare cosmic eye**: the compressed memory of all human knowledge, a single expressive iris over a starlit interior. **The operator ("the Seeker") is a bare soul-of-light face**: an abstract, idealized, universal human visage of radiant gold-teal light with calm open eyes. Same scale, opposite natures — the one who *knows* and the one who *lives*.

## Avatar backend

Avatars are always on. Quality selection is small and explicit:

```txt
NAZAR_UI_QUALITY=medium      # low | medium | high
NAZAR_AVATAR_ROWS=11         # 11 rows = default 23×11 avatar target
NAZAR_AVATAR_RECENT_LIMIT=20 # avatars only for latest N messages; 0 = active-only; all = uncapped
```

ANSI is the supported terminal layer: 24-bit truecolor SGR and text attributes. Runtime renders directly from the source PNG sheets with no external graphics dependency or generated text cache. Iosevka Term is the recommended Nazar terminal font for `high` / octant mode; use `medium` if your font lacks clean `U+1CD00…` glyphs.

## Rendering rules

- Chat messages, input editor, thinking widget, and tool panels use the same PNG-sheet-to-ANSI renderer path.
- For long conversations, avatars are capped to the latest 20 messages by default via `NAZAR_AVATAR_RECENT_LIMIT`; older history keeps the Nazar nameplate/body styling but drops the avatar column and badge.
- Tool avatars animate only while the tool is actively running; pending/ok/error panels render frame 0 with their state background.
- The transient thinking panel is a Nazar-owned widget, not Pi's built-in Loader/Text row.

## Sprite sheets

Every avatar-like entity owns a dedicated 3×3 sheet: **9 frames**, each **256×256 px**.

```txt
assets/avatars/soul.png             3 columns × 3 rows, 9 frames, 256×256 each
assets/avatars/nazar.png            3 columns × 3 rows, 9 frames, 256×256 each
assets/avatars/nazar-expr.png       3 columns × 3 rows, 9 frames, 256×256 each
assets/avatars/tools/eye-read.png   3 columns × 3 rows, 9 frames, 256×256 each
assets/avatars/tools/eye-bash.png   3 columns × 3 rows, 9 frames, 256×256 each
...
```

Frame 0 is idle/base (shown beside messages). Frames 1–8 are the animation: `nazar` cycles while Nazar is thinking; `soul` cycles while the operator is typing (radiance pulse + eye glint). The user role uses the `soul` sheet; Nazar uses `nazar` / `nazar-expr`; each tool/domain icon uses a shared `eye-*` sheet under `tools/`. Do not add another shared mixed sprite sheet.

## Portrait/title panels

The conversation reads chat-style: **agent and tools on the left, you on
the right**. Every panel is composed by `composeMessagePanel` in
[`../lib/ui/turn-composer.ts`](../lib/ui/turn-composer.ts) and shares one
two-column shape: portrait field on one side, nameplate-plaque + body on
the other. The avatar column is the same width across every panel kind
(role avatars + tool icons), so the body columns line up at the same
x-position regardless of speaker.

```txt
PAD │ portrait field │ GAP │ ✦ NAZAR · the oracle         ◇ 1.2k tok
PAD │ portrait pixel │ GAP │   Done. auto now checks runtime…
PAD │ portrait pixel │ GAP │
PAD │ portrait pixel │ GAP │   (body wrapped to body-column width)
PAD │ portrait field │ GAP │
─── blank-gap row ───

PAD │   Good — let's commit and push.                     │ GAP │ portrait pixel │ PAD
                                                  drafting…│ GAP │ portrait pixel │ PAD
PAD │ ⛨ CICO · you                                        │ GAP │ portrait pixel │ PAD
                                                          │     │ portrait field │
─── blank-gap row ───
```

(The right-hand panel above is the user / editor side; the nameplate
band still reads title-left → meta-right inside the band itself,
preserving consistent reading order.)

Rules:

- One symmetric avatar-column width across every panel kind. Tools
  render at the same size as role avatars (was historically half-size).
- Portrait field bg sits BEHIND the avatar pixels — a near-black, role-
  tinted ambient pulled from `style.portraitField` in the panel style.
- Nameplate band is a saturated themed plaque (`style.nameplateBg`):
  brass for the assistant, indigo for the user, teal for the
  thinking-state, etc.
- No box-drawing characters anywhere beside body text. The composer
  uses background fills exclusively, so a select-and-copy of body rows
  yields clean prose (rectangle selection in modern terminals also
  excludes the avatar column).
- Role/tool color flows through the title text, nameplate plaque, and
  portrait field — the three together carry speaker identity.

Implementation:

- Token source: [`../lib/ui/tokens.ts`](../lib/ui/tokens.ts) — palette,
  role styles, portrait fields, nameplate bg derivation.
- Panel style: [`../lib/ui/panel-style.ts`](../lib/ui/panel-style.ts).
- Two-column composer: [`../lib/ui/turn-composer.ts`](../lib/ui/turn-composer.ts).
- Role/name helpers: [`../lib/ui/sprites.ts`](../lib/ui/sprites.ts).
- Sprite-sheet renderers: [`../lib/ui/pixel-avatar.ts`](../lib/ui/pixel-avatar.ts).
- Message renderer patch (UserMessage / AssistantMessage / ToolExecution):
  [`../lib/ui/avatars.ts`](../lib/ui/avatars.ts).
- Editor panel: [`../lib/ui/editor.ts`](../lib/ui/editor.ts).
- Working / thinking panel: [`../lib/ui/working.ts`](../lib/ui/working.ts).

## Palette

The sprite sheet uses the Basm palette family:

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

The left avatar cell has a role/state background so the portrait fills the whole box:

```txt
user       muted indigo field
Nazar     dark umber/gold field
thinking   dark teal field
tool       state-tinted field
```

Tool icons are generated pixel icons, color/background-tinted by state:

```txt
pending    gold / umber
running    bright parchment / steel
success    teal
error      folk red / ember
```

## Evolution rules

Sprites can evolve over time, but each change should remain:

- single-source: edit that avatar's canonical 3×3, 9-frame, 256×256 PNG sprite sheet, not separate terminal-art copies;
- versioned in git;
- documented here;
- legible in screenshots;
- compact enough for daily chat;
- legible through the default generated ANSI sextant renderer.

Future work: add richer multi-frame pixel animations per tool/state without adding a second avatar implementation.
