# Nazar design system

Nazar's design language is **Basm** (Romanian for *fairy tale*): a pixel-art, 16-bit design
rooted in Romanian fairy tales and the nazar — woven, tactile, storybook, hand-built.

This folder is the source of truth for identity, UI, theme, illustration, website, terminal,
and copy choices.

## Files

- [`identity.md`](identity.md) — **brand & voice source of truth**: essence, character, the
  eyes/personas, voice, messaging, positioning. *Who Nazar is and how it speaks.*
- [`basm.md`](basm.md) — **visual system**: brand essence, color, typography,
  layout, motifs, web/component recipes. *How Nazar looks.*
- [`tokens.css`](tokens.css) — **generated** CSS variables (color, type, layout). DO NOT EDIT;
  emitted from the canonical token module — see "Token pipeline" below.
- [`../web/crest.png`](../web/crest.png) — the **hero emblem**: the watchful blue eye (nazar) over a teal data-orb on a folk border. Website hero, large surfaces, app icon.
- [`../web/logo.png`](../web/logo.png) — the **compact mark**: gold nazar-eye medallion. Top bar, social/org avatar, favicon source.
- [`pi-terminal.md`](pi-terminal.md) — rules for the `nazar` Pi terminal surface: chat-style
  panels, header / folk-band, editor flow, footer, thinking widget.
- [`avatars.md`](avatars.md) — sprite-sheet avatar catalog, ANSI/Chafa rendering
  backends, layout rules.

> Source-of-truth rule: if two docs disagree, the one that *owns* that layer wins — `identity.md`
> for voice/story, `basm.md` + `tokens.ts` for anything visual.

## Token pipeline (the source of truth for color)

All Nazar palette / type / layout values live in **one typed module**:

```
lib/ui/tokens.ts
       │
       ├─ generates ──> design/tokens.css        (web CSS variables)
       ├─ generates ──> themes/nazar.json        (Pi terminal theme)
       └─ imported by ─> lib/ui/panel-style.ts   (terminal role palettes)
                       lib/ui/design.ts          (low-level UI layer palette)
                       lib/ui/pixel-avatar.ts    (avatar field backgrounds)
                       lib/ui/avatars.ts         (tool status bg accents)
```

After editing `tokens.ts`, run:

```bash
npm run build:tokens
```

…to regenerate `tokens.css` + `themes/nazar.json`. The guard test in
`lib/ui/tokens.test.ts` fails the build if those two artifacts ever drift
from the source — no need to remember.

## Product tone

- Wise companion first; local-first, private, FOSS underneath.
- Wise Nazar, not mascot clown.
- Old-school fantasy RPG, but restrained and useful.
- Handmade/pixel/woven, not glossy AI gradientware.
- Clear technical truth over lore.

## Copy guardrails

Use mythic language sparingly. Prefer:

- “I shall weigh the matter.”
- “Let me trace the old paths.”
- “local-first | private | yours | FOSS”
- “Markdown files”, “your box”, “local model”, “personal data”

Avoid cliché amulet-trinket / evil-eye-fear / vault-protection copy in product UI. Nazar can be a
guardian eye without every line trading on superstition.

## Implementation hooks

- Pi terminal branding: [`../extensions/brand.ts`](../extensions/brand.ts)
- Pi theme tokens: [`../themes/nazar.json`](../themes/nazar.json)
- Web assets: [`../web/`](../web/)
