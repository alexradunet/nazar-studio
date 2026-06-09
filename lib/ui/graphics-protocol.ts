// SPDX-License-Identifier: AGPL-3.0-or-later
// Graphics switchboard for Nazar's Pi terminal surface.
//
// Nazar renders avatars purely as Unicode/ANSI character art: low = half-block,
// medium = sextant, high = octant, all TRUECOLOR (see lib/ui/sextant.ts).
// Dependency-free: no wasm and no runtime image protocol. Pi redraws the whole
// surface on every change, so blitting memoised ANSI strings is the stable path.
// One PNG master set feeds every quality level; there is no hand-maintained
// terminal-art copy.
import { uiQuality, uiRenderer } from "./graphics-state.ts";

// Kept as a single-member union (instead of just `string`) so existing call
// sites and the RenderedAvatar.backend field keep their types unchanged.
export type GraphicsProtocolBackend = "ansi";
export type Rgb = readonly [number, number, number];

export function truecolorFg([r, g, b]: Rgb): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function truecolorBg([r, g, b]: Rgb): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

export function graphicsCapabilitySummary(): string {
  return `quality=${uiQuality()} chosen=ansi renderer=${uiRenderer()} image_protocol=removed`;
}
