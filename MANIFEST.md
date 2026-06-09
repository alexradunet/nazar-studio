# Nazar — native ANSI mosaic avatars

Single PNG-master avatar system rendered to Unicode block mosaics by a tiny,
dependency-free TypeScript module. Nazar = bare cosmic eye, Seeker = bare
soul-of-light face, tools = bare icons. Three quality modes via `NAZAR_UI_QUALITY` or `/nazar-ui`:

  low     half-block (universal fallback)
  medium  sextant (default; broad support)
  high    octant (highest fidelity; recent fonts)
Default size: 23x11 cells (NAZAR_AVATAR_ROWS=11); 19x9 compact, 35x17 showcase.

## Contents (mirrors the repo tree)
```
assets/avatars/{nazar,nazar-expr,soul}.png   heroes (eye blink / soul radiance pulse)
assets/avatars/tools/eye-*.png               56 no-orb tool icons (glow pulse)
lib/ui/sextant.ts                             renderMosaic (sextant + octant), pure TS, 0 deps
lib/ui/pixel-avatar.ts                        samples 768 masters; ansiDetail() picks mode; default 11 rows; memoised
lib/ui/graphics-state.ts                      low | medium | high quality config
lib/ui/graphics-protocol.ts                   ANSI-only
lib/ui/pixel-avatar.test.ts                   ANSI/mosaic tests
lib/ui/design.ts                              capability note
scripts/review-ansi-avatars.ts               terminal review helper
design/ANSI-AVATAR-MIGRATION.md               full migration guide
```

## Apply
1. Copy assets/, lib/, scripts/, design/ over your repo.
2. `npm run typecheck && npx vitest run lib/ui/pixel-avatar.test.ts`.
3. Default is medium/sextant @ 23x11; set `NAZAR_UI_QUALITY=high` for octants or `=low` for half-blocks.

## Notes
- Zero runtime deps (mirrors the repo's pure-TS PNG tooling). No wasm.
- The renderer was executed on Node here and round-trip-rasterised to confirm
  correct geometry/colours and both glyph maps at 19x9 / 23x11 / 35x17.
- Octant base codepoint is OCTANT_BASE=0x1CD00 in sextant.ts — verify in your
  terminal/font if octant glyphs look shifted (isolated to one constant).
- tsc/vitest run in your env (npm firewalled in the authoring sandbox).
