# Nazar avatars and sprites

Nazar avatars use **one canonical source and multiple terminal backends**:

1. **Per-avatar 64×64 PNG sprite sheets** — source of truth under `assets/avatars/`.
2. **Graphics protocol renderers** — ANSI half-blocks as the compatibility baseline, Kitty graphics when the terminal supports it.

Do not maintain separate terminal art by hand. New avatars start as 64×64 frames in their own sprite sheet, then the selected backend scales them for the terminal.

Current art direction follows **Basm**: 16-bit, woven, Romanian-fairy-tale pixel craft. **Nazar is the watchful blue eye** (the *nazar boncuğu*) — concentric blue/white iris, a calm steady gaze, gold/umber amulet rim, restrained teal/ember accents. **The human/user is a mage** — pointed hood/hat, robe, staff/glow, indigo/teal palette.

## Avatar backend

Avatars are always on. Backend selection is small and explicit:

```txt
NAZAR_UI_QUALITY=auto        # auto | basic | hd; auto uses HD when Kitty support is detected
NAZAR_GRAPHICS_PROTOCOL=auto  # auto | ansi | kitty; low-level override
NAZAR_AVATAR_RECENT_LIMIT=10  # full avatars only for latest N panels; 0 = active-only; all = uncapped
```

ANSI is the minimum supported terminal layer: 24-bit truecolor SGR, text attributes, and half-block rasterization. Auto/HD mode uses Kitty graphics APC transmission plus Unicode placeholder cells (`U+10EEEE`) when support is detected, so images obey the same cell-grid contract as ANSI and fall back to ANSI when unsupported.

## Rendering rules

- Chat messages, input editor, thinking widget, and tool panels use the same PNG-sheet-to-backend renderer path.
- For long conversations, full avatars are capped to recent panels by `NAZAR_AVATAR_RECENT_LIMIT`; old history uses compact generated ANSI badges for performance.
- Tool avatars animate only while the tool is actively running; pending/ok/error panels render frame 0 with their state background.
- The transient thinking panel is a Nazar-owned widget, not Pi's built-in Loader/Text row.

## Sprite sheets

Every avatar-like entity owns a dedicated 3×3 sheet: **9 frames**, each **64×64 px**.

```txt
assets/avatars/mage.png          3 columns × 3 rows, 9 frames, 64×64 each
assets/avatars/nazar.png        3 columns × 3 rows, 9 frames, 64×64 each
assets/avatars/tools/scroll.png  3 columns × 3 rows, 9 frames, 64×64 each
assets/avatars/tools/needle.png  3 columns × 3 rows, 9 frames, 64×64 each
...
```

Index files live beside each image:

```txt
assets/avatars/mage.txt
assets/avatars/nazar.txt
assets/avatars/tools/<tool>.txt
```

Frame 0 is idle/base. Frames 1–8 are animation variants for that avatar. The user/human role uses the `mage` sheet; Nazar uses the `nazar` sheet; each tool/domain icon uses its own sheet under `tools/`. Do not add another shared mixed sprite sheet.

## Portrait/title panels

Avatars render in a left RPG dialog cell. The person/tool name is shown as the right-panel title, not as a badge under the portrait:

```txt
╔══════════╗ ╔═◆ Nazar ◆════╗
║          ║ ║ message        ║
║ portrait ║ ║                ║
║ portrait ║ ║                ║
║          ║ ║                ║
╚══════════╝ ╚════════════════╝
```

Rules:

- Fixed-width avatar rail across roles.
- No `[ Name ]` text badges.
- Names/tools use the same labeled border language as the input editor.
- Role/tool color lives in the title text and border palette.
- Never let message background color bleed into the avatar rail.

Implementation:

- Backend/name helpers: [`../lib/ui/sprites.ts`](../lib/ui/sprites.ts)
- Sprite-sheet renderers: [`../lib/ui/pixel-avatar.ts`](../lib/ui/pixel-avatar.ts) (legacy filename)
- Message renderer patch: [`../lib/ui/avatars.ts`](../lib/ui/avatars.ts)
- Editor panel: [`../lib/ui/editor.ts`](../lib/ui/editor.ts)
- Working/thinking panel: [`../lib/ui/working.ts`](../lib/ui/working.ts)

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
