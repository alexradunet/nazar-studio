# Nazar — native ANSI mosaic avatars (no orb, no Kitty, no Chafa)

Single PNG-master avatar system rendered to Unicode block mosaics by a tiny,
dependency-free TypeScript module. Nazar = bare cosmic eye, Seeker = bare
soul-of-light face, tools = bare icons. Three fidelity modes via NAZAR_ANSI_DETAIL:

  octant  (2x4, Unicode 16, highest fidelity; kitty/recent fonts)  <- default
  sextant (2x3, Unicode 13, broad support)
  block   (half-block, universal fallback)
Default size: 23x11 cells (NAZAR_AVATAR_ROWS=11); 19x9 compact, 35x17 showcase.

## Contents (mirrors the repo tree)
```
assets/avatars/{nazar,nazar-expr,soul}.png   heroes (eye blink / soul radiance pulse)
assets/avatars/tools/eye-*.png               57 no-orb tool icons (glow pulse)
assets/avatars/ansi/**                        regenerated half-block prerenders (fallback)
lib/ui/sextant.ts                             NEW — renderMosaic (sextant + octant), pure TS, 0 deps
lib/ui/pixel-avatar.ts                        samples 768 masters; ansiDetail() picks mode; default 13 rows; memoised
lib/ui/graphics-protocol.ts                   Kitty removed, ANSI-only
lib/ui/pixel-avatar.test.ts                   ANSI/mosaic tests
lib/ui/design.ts                              capability note
scripts/build-ansi-avatar-assets.ts           feeds the half-block fallback prerenders
design/ANSI-AVATAR-MIGRATION.md               full migration guide
builders/                                      Python repro scripts + hero masters
qa/                                            QA renders incl. modes_compare + ts_roundtrip
```

## Apply
1. Copy assets/, lib/, scripts/, design/ over your repo.
2. `npm run typecheck && npx vitest run lib/ui/pixel-avatar.test.ts`.
3. Default is octant @ 23x11; set `NAZAR_ANSI_DETAIL=sextant` or `=block` for older fonts.

## Notes
- Zero runtime deps (mirrors the repo's pure-TS PNG tooling). No wasm, no Chafa.
- The renderer was executed on Node here and round-trip-rasterised to confirm
  correct geometry/colours and both glyph maps at 19x9 / 27x13 / 35x17.
- Octant base codepoint is OCTANT_BASE=0x1CD00 in sextant.ts — verify in your
  terminal/font if octant glyphs look shifted (isolated to one constant).
- tsc/vitest run in your env (npm firewalled in the authoring sandbox).
