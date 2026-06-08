# Nazar avatars → native ANSI mosaics

Avatars are now a single PNG master set rendered to Unicode block-mosaic
character art by a tiny, dependency-free TypeScript module (`lib/ui/sextant.ts`).
Nazar is a bare cosmic **eye**, the Seeker a bare **soul-of-light face**, each
tool a bare **icon** — no orb. No wasm and no npm graphics dependency.

## Renderer (lib/ui/sextant.ts) — pure TS, zero deps
`renderMosaic(frame, background, cols, rows, mode)` area-downsamples the RGBA
frame to `subCols·cols × subRows·rows`, splits each cell into two colours by mid
luminance, and emits one TRUECOLOR fg+bg SGR plus one mosaic glyph per cell.

| UI quality | mode | grid | subpixels/cell | Unicode | notes |
|------------|------|------|----------------|---------|-------|
| **low** | half-block | 1×2 | 2 | ▀ U+2580 | works on any truecolor terminal |
| **medium** (default) | sextant | 2×3 | 6 | U+1FB00… (v13, 2020) | broad support; good default for real-world fonts |
| **high** | octant | 2×4 | 8 | U+1CD00… (v16, 2024) | highest fidelity; needs a recent font |

Chosen via `/nazar-ui low|medium|high` or `NAZAR_UI_QUALITY=low|medium|high`.
All three sample the same 768² master — one source of truth. Results are
memoised per (detail, frame, cols, rows, background) so Pi's redraw-on-every-change
just blits cached lines.

### Octant fidelity
Octant packs 8 subpixels/cell vs sextant's 6 — 33% more vertical resolution
(same density as braille, but solid blocks). It visibly sharpens faces and eyes,
but depends on newer font coverage. The recommended Nazar terminal font for high mode is **Iosevka Term**. The default is **medium / sextant**; switch to **high / octant** only when your terminal font renders U+1CD00 glyphs cleanly, or to **low / half-block** for conservative systems. **Verify** the
`OCTANT_BASE = 0x1CD00` constant in `sextant.ts` against your font if octant
glyphs look shifted — it is isolated to that one constant.

## Sizes (terminal cells, not pixels)
Default **23×11** (`NAZAR_AVATAR_ROWS=11`) — sextant keeps the identity readable
at this compact size; **19×9** ultra-compact, **35×17** showcase (clamp 6–20).
Columns derive from the live cell aspect (~2.0): 11 rows ≈ 23 cols.

## Files
- **NEW** `lib/ui/sextant.ts` — the mosaic renderer (renderMosaic / renderSextant / renderOctant).
- **Changed** `lib/ui/pixel-avatar.ts` — samples the 768² masters; `ansiDetail()` selects sextant by default, with half-block/octant quality choices; memoised.
- **Changed** `lib/ui/graphics-state.ts` — `/nazar-ui` and `NAZAR_UI_QUALITY` use `low | medium | high`.
- **Changed** `lib/ui/graphics-protocol.ts` — ANSI-only.
- **Changed** `lib/ui/pixel-avatar.test.ts`, `lib/ui/design.ts`.
- **Assets** (all no-orb): `nazar.png`/`nazar-expr.png` (eye, 9-frame blink), `soul.png` (radiance pulse), `tools/eye-*.png` (57 icons, glow pulse).

## Validate (your env)
```sh
npm run typecheck
npx vitest run lib/ui/pixel-avatar.test.ts
# try fidelity modes live:
NAZAR_UI_QUALITY=low    <run pi>  # half-block fallback
NAZAR_UI_QUALITY=medium <run pi>  # sextant default
NAZAR_UI_QUALITY=high   <run pi>  # octant, newer fonts
```
The renderer was executed on Node here (renderMosaic → ANSI → rasterised back to
image) to confirm correct geometry, colours, and both glyph maps at 19×9 / 23×11
/ 35×17. `tsc`/`vitest` run in your environment (npm is firewalled in the sandbox).
