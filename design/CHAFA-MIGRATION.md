# Nazar avatars → ANSI/Chafa (no orb, Kitty removed)

This change drops the floating-orb framing and the Kitty image protocol, and
moves every avatar to a single PNG master set rendered as Unicode/ANSI character
art. Nazar is now a bare cosmic **eye**, the Seeker a bare **soul-of-light face**,
and each tool a bare **icon** — no orb. One master set feeds everything; there is
no second hand-maintained low-res asset set.

## Why
- **Performance.** Pi redraws the whole surface on every change. Kitty
  re-transmits image bytes each draw — costly. Chafa output is plain ANSI text we
  render **once** and cache, then blit on redraw (near-free).
- **One source of truth.** No more maintaining HD (Kitty) art *and* a separate
  low-res ANSI set. The PNG masters are the only hand-maintained art; terminal
  output is derived.
- **Legibility.** Without the orb eating the cell budget, the eye/face/icon fills
  the frame and reads crisply even at ~19×9 cells.

## Rendering model
- **Primary:** Chafa **sextant** (2×3 mosaics), TRUECOLOR, `fontRatio 0.5`.
  Rendered ahead of time by `scripts/build-chafa-cache.ts` (uses `chafa-wasm`) and
  cached in `assets/avatars/chafa-cache.json`, keyed `"<sheet>#<frame>#<rows>"`.
- **Fallback:** if the cache is absent, `lib/ui/pixel-avatar.ts` renders the same
  768² master with its built-in **half-block (▀)** sampler. So avatars always
  render, even before you build the cache.
- **Sizes (terminal cells, not pixels):** default **27×13** (`NAZAR_AVATAR_ROWS=13`),
  **19×9** compact, **35×17** showcase. Set `NAZAR_AVATAR_ROWS` / `NAZAR_TOOL_ROWS`
  (clamped 6–20). Columns are derived from the live cell aspect (~2.0), so 13 rows ≈ 27 cols.

## Files
**New**
- `lib/ui/chafa-render.ts` — sync cache loader (`chafaLinesFor(sheet, frame, rows)`).
- `scripts/build-chafa-cache.ts` — prewarm the cache with `chafa-wasm`.

**Changed**
- `lib/ui/graphics-protocol.ts` — Kitty removed (no `kittyImage` / `kittyPlaceholderGrid`
  / `terminalSupportsKitty` / `KittyImageOptions`); `GraphicsProtocolBackend = "ansi"`;
  `selectGraphicsBackend()` always returns `"ansi"`; truecolor helpers kept.
- `lib/ui/pixel-avatar.ts` — Kitty path removed; `ansiAvatar` samples the **768² master**
  (`SOURCE_SHEET_ASSETS`) and first consults the Chafa cache; default rows 9→**13**
  (clamp 6–20); `tool` rows clamp raised to 20.
- `lib/ui/pixel-avatar.test.ts` — Kitty tests replaced with ANSI-only assertions;
  geometry tests pin `NAZAR_AVATAR_ROWS=9`.
- `lib/ui/design.ts` — capability note wording.

**Assets (all no-orb now)**
- `assets/avatars/{nazar,nazar-expr}.png` — cosmic eye, 9-frame blink (thinking).
- `assets/avatars/soul.png` — radiant soul-of-light face, 9-frame radiance pulse (typing).
- `assets/avatars/tools/eye-*.png` — 57 bare icons, 9-frame glow pulse.
- `assets/avatars/ansi/**` — regenerated half-block prerenders (fallback path).

## Build & validate (in your env — npm/chafa are firewalled in the authoring sandbox)
```sh
npm i -D chafa-wasm
node scripts/build-chafa-cache.ts        # writes assets/avatars/chafa-cache.json
npm run typecheck
npx vitest run lib/ui/pixel-avatar.test.ts
npm run build:tokens -- --check
```
Commit `chafa-cache.json` (or generate it in CI / on first run). `chafaLinesFor`
loads it lazily and falls back to half-block if missing.

### chafa-wasm input note
`build-chafa-cache.ts` slices each sheet into 256px frames, PNG-encodes them, and
calls `imageToAnsi(pngBuffer, { height, fontRatio: 0.5, colors: TRUECOLOR,
symbols: "sextant", bg: 0x0f1117 })` per the chafa-wasm README. If your installed
version prefers raw `ImageDataLike`, pass `{ data, width, height }` instead of the
PNG buffer (one line in `main()`).

## Optional cleanup (later)
- `scripts/build-ansi-avatar-assets.ts` + `assets/avatars/ansi/**` now only feed the
  half-block fallback. Once the Chafa cache is always built, they can be retired.
- `assets/avatars/orbs/**` (orb templates) are legacy.
- `mage-alien.png` remains an unused fallback sheet.
