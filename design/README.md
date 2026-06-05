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
- [`tokens.css`](tokens.css) — **canonical design tokens** (color, type, layout). The one place
  hexes live; the terminal theme and website both mirror this.
- [`crest.png`](crest.png) — the **hero emblem**: the watchful blue eye (nazar) over a teal data-orb on a folk border. Website hero, large surfaces, app icon.
- [`logo.png`](logo.png) — the **compact mark**: gold nazar-eye medallion. Top bar, social/org avatar, favicon source. (Final marks; colors from `tokens.css`.)
- [`pi-terminal.md`](pi-terminal.md) — rules for the `nazar` Pi terminal surface: RPG avatars,
  working avatar, footer/header, thinking display.
- [`avatars.md`](avatars.md) — sprite-sheet avatar catalog, ANSI fallback, and evolution rules.

> Source-of-truth rule: if two docs disagree, the one that *owns* that layer wins — `identity.md`
> for voice/story, `basm.md` + `tokens.css` for anything visual.

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
