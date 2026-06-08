# Nazar — ANSI/Chafa avatar overhaul (no orb, Kitty removed)

Single PNG-master avatar system rendered as Unicode/ANSI character art (Chafa
sextant, with a half-block fallback). Nazar = bare cosmic eye, Seeker = bare
soul-of-light face, tools = bare icons. Drop these over the same paths in
nazar-studio, then build the Chafa cache (see design/CHAFA-MIGRATION.md).

## Contents (mirrors the repo tree)
```
assets/avatars/nazar.png            cosmic EYE, 768² 3×3 9-frame blink (thinking)
assets/avatars/nazar-expr.png       = eye sheet
assets/avatars/soul.png             radiant SOUL-OF-LIGHT face, 9-frame radiance pulse
assets/avatars/tools/eye-*.png      57 bare tool icons, 9-frame glow pulse
assets/avatars/ansi/**              regenerated half-block prerenders (fallback path)
lib/ui/graphics-protocol.ts         Kitty removed; ANSI-only
lib/ui/pixel-avatar.ts              renders 768² masters + Chafa-cache consult; default 13 rows
lib/ui/pixel-avatar.test.ts         ANSI-only tests
lib/ui/chafa-render.ts              NEW — sync Chafa ANSI cache loader
lib/ui/design.ts                    capability note
scripts/build-chafa-cache.ts        NEW — prewarm cache with chafa-wasm
scripts/build-ansi-avatar-assets.ts feeds the half-block fallback prerenders
design/CHAFA-MIGRATION.md           full migration guide + build/validate steps
builders/                           Python reproducibility scripts + hero masters
qa/                                 QA renders (heroes, all-57 tools, spike)
```

## Apply
1. Copy `assets/`, `lib/`, `scripts/`, `design/` over your repo.
2. `npm i -D chafa-wasm && node scripts/build-chafa-cache.ts` → `chafa-cache.json`.
3. `npm run typecheck && npx vitest run lib/ui/pixel-avatar.test.ts`.

Sizes: `NAZAR_AVATAR_ROWS` (default 13; 9 compact; 17 showcase). Validation runs
in your environment — the authoring sandbox has npm/chafa firewalled, so the
TypeScript was syntax-checked (node strip-types) and the art was verified by
rendering through a faithful sextant/half-block emulator at 19×9 / 27×13 / 35×17.

## What changed vs the orb era
- Orb dropped; glyphs normalized to fill ~92% of frame.
- Kitty image protocol removed across graphics-protocol.ts + pixel-avatar.ts (+ tests).
- One master set; Chafa sextant cache is the renderer, half-block is the fallback.
- 30 busy/orb tools simplified or redrawn (calendar, bug, api, container, time, idle).
