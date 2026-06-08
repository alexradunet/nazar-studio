# Nazar avatars → native ANSI mosaics (no orb, no Kitty, no Chafa)

Avatars are now a single PNG master set rendered to Unicode block-mosaic
character art by a tiny, dependency-free TypeScript module (`lib/ui/sextant.ts`).
Nazar is a bare cosmic **eye**, the Seeker a bare **soul-of-light face**, each
tool a bare **icon** — no orb. No wasm, no Chafa, no npm graphics dependency.

## Renderer (lib/ui/sextant.ts) — pure TS, zero deps
`renderMosaic(frame, background, cols, rows, mode)` area-downsamples the RGBA
frame to `subCols·cols × subRows·rows`, splits each cell into two colours by mid
luminance, and emits one TRUECOLOR fg+bg SGR plus one mosaic glyph per cell.

| mode | grid | subpixels/cell | Unicode | notes |
|------|------|----------------|---------|-------|
| **octant** (default) | 2×4 | 8 | U+1CD00… (v16, 2024) | highest fidelity; needs a recent font / kitty (renders built-in) |
| **sextant** | 2×3 | 6 | U+1FB00… (v13, 2020) | broad support; fallback for older fonts |
| **block** | 1×2 | 2 | ▀ U+2580 | works on any truecolor terminal |

Chosen via `NAZAR_ANSI_DETAIL=octant|sextant|block` (default `octant`). The
half-block path is the existing built-in sampler. All three sample the same 768²
master — one source of truth. Results are memoised per (detail, frame, cols,
rows, background) so Pi's redraw-on-every-change just blits cached lines (the
performance win over Kitty, which re-transmitted image bytes each draw).

### Octant fidelity
Octant packs 8 subpixels/cell vs sextant's 6 — 33% more vertical resolution
(same density as braille, but solid blocks). It visibly sharpens faces and eyes,
and is what lets the soul's face stay legible at the compact 23×11 default.
**It is the default.** If your terminal/font lacks the U+1CD00 glyphs, set
`NAZAR_ANSI_DETAIL=sextant` (or `block`); kitty renders octants built-in.
**Verify** the `OCTANT_BASE = 0x1CD00` constant in `sextant.ts` against your font
if octant glyphs look shifted — it is isolated to that one constant.

## Sizes (terminal cells, not pixels)
Default **23×11** (`NAZAR_AVATAR_ROWS=11`) — octant holds the soul's face at this
compact size; **19×9** ultra-compact, **35×17** showcase (clamp 6–20). Columns
derive from the live cell aspect (~2.0): 11 rows ≈ 23 cols.

## Files
- **NEW** `lib/ui/sextant.ts` — the mosaic renderer (renderMosaic / renderSextant / renderOctant).
- **Changed** `lib/ui/pixel-avatar.ts` — Kitty removed; samples the 768² masters; `ansiDetail()` selects octant/sextant/block; default rows 9→13; memoised.
- **Changed** `lib/ui/graphics-protocol.ts` — Kitty removed, ANSI-only.
- **Changed** `lib/ui/pixel-avatar.test.ts`, `lib/ui/design.ts`.
- **Removed** the Kitty path and the Chafa experiment (`chafa-render.ts`, `build-chafa-cache.ts`).
- **Assets** (all no-orb): `nazar.png`/`nazar-expr.png` (eye, 9-frame blink), `soul.png` (radiance pulse), `tools/eye-*.png` (57 icons, glow pulse); `ansi/**` regenerated for the half-block fallback.

## Validate (your env)
```sh
npm run typecheck
npx vitest run lib/ui/pixel-avatar.test.ts
# try fidelity modes live:
NAZAR_ANSI_DETAIL=octant  <run pi>      # max fidelity (kitty / v16 fonts)
NAZAR_ANSI_DETAIL=sextant <run pi>      # default
NAZAR_ANSI_DETAIL=block   <run pi>      # universal fallback
```
The renderer was executed on Node here (renderMosaic → ANSI → rasterised back to
image) to confirm correct geometry, colours, and both glyph maps at 19×9 / 27×13
/ 35×17. `tsc`/`vitest` run in your environment (npm is firewalled in the sandbox).
