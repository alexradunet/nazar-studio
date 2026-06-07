# Nazar avatars and sprites

Nazar avatars use **one canonical source and multiple terminal backends**:

1. **Per-avatar 64×64 PNG sprite sheets** — source of truth under `assets/avatars/`.
2. **Graphics protocol renderers** — ANSI half-blocks as the compatibility baseline, Kitty graphics when the terminal supports it.

Do not maintain separate terminal art by hand. New avatars start as 64×64 frames in their own sprite sheet, then the selected backend scales them for the terminal.

Current art direction follows **Basm**: 16-bit, woven, Romanian-fairy-tale pixel craft. Nazar and the operator are a **matched pair of floating crystal orbs** — deep-violet glass with gold Romanian-folk filigree, no pedestal, on a dark field. **Nazar is the cosmic eye** inside the orb: the compressed memory of all human knowledge, a single expressive iris over a starlit interior. **The operator ("the Seeker") is a soul-of-light** in the same orb: an abstract, idealized, universal human visage of radiant gold-teal light with calm open eyes. Same vessel, opposite natures — the one who *knows* and the one who *lives*.

## Avatar backend

Avatars are always on. Backend selection is small and explicit:

```txt
NAZAR_UI_QUALITY=auto        # auto | basic | hd; auto uses HD when Kitty support is detected
NAZAR_GRAPHICS_PROTOCOL=auto  # auto | ansi | kitty; low-level override
NAZAR_AVATAR_RECENT_LIMIT=20  # avatars only for latest N messages; 0 = active-only; all = uncapped
```

ANSI is the minimum supported terminal layer: 24-bit truecolor SGR, text attributes, and half-block rasterization. Auto/HD mode uses Kitty graphics APC transmission plus Unicode placeholder cells (`U+10EEEE`) when support is detected, so images obey the same cell-grid contract as ANSI and fall back to ANSI when unsupported.

## Rendering rules

- Chat messages, input editor, thinking widget, and tool panels use the same PNG-sheet-to-backend renderer path.
- For long conversations, avatars are capped to the latest 20 messages by default via `NAZAR_AVATAR_RECENT_LIMIT`; older history keeps the Nazar nameplate/body styling but drops the avatar column and badge.
- Tool avatars animate only while the tool is actively running; pending/ok/error panels render frame 0 with their state background.
- The transient thinking panel is a Nazar-owned widget, not Pi's built-in Loader/Text row.

## Sprite sheets

Every avatar-like entity owns a dedicated 3×3 sheet: **9 frames**, each **64×64 px**.

```txt
assets/avatars/soul.png             3 columns × 3 rows, 9 frames, 64×64 each
assets/avatars/nazar.png            3 columns × 3 rows, 9 frames, 64×64 each
assets/avatars/nazar-expr.png       3 columns × 3 rows, 9 frames, 64×64 each
assets/avatars/tools/eye-read.png   3 columns × 3 rows, 9 frames, 64×64 each
assets/avatars/tools/eye-bash.png   3 columns × 3 rows, 9 frames, 64×64 each
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
- Backend/name helpers: [`../lib/ui/sprites.ts`](../lib/ui/sprites.ts).
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

- single-source: edit that avatar's canonical 3×3, 9-frame, 64×64 PNG sprite sheet, not separate terminal-art copies;
- versioned in git;
- documented here;
- legible in screenshots;
- compact enough for daily chat;
- legible through the generated ANSI half-block renderer.

Future work: add richer multi-frame pixel animations per tool/state without adding a second avatar implementation.
