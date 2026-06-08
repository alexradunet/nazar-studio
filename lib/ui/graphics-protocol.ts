// SPDX-License-Identifier: AGPL-3.0-or-later
// Graphics switchboard for Nazar's Pi terminal surface.
//
// Nazar renders avatars purely as Unicode/ANSI character art now — half-block
// (▀) as the dependency-free baseline and Chafa (sextant 2×3, TRUECOLOR) as the
// crisp upgrade (see lib/ui/chafa-render.ts). The legacy image-protocol path
// was removed: Pi redraws the whole surface on every change, and retransmitting
// image bytes each draw is far more costly than blitting a cached ANSI string.
// One PNG master set feeds everything; there is no second hand-maintained
// low-res asset set.
import { graphicsQuality } from "./graphics-state.ts";

// Kept as a single-member union (instead of just `string`) so existing call
// sites and the RenderedAvatar.backend field keep their types unchanged.
export type GraphicsProtocolBackend = "ansi";
export type Rgb = readonly [number, number, number];

export function selectGraphicsBackend(_preferred: "auto" | GraphicsProtocolBackend = "auto"): GraphicsProtocolBackend {
  // Only one backend remains. The argument is retained for call-site
  // compatibility; ANSI/Chafa character art is always used.
  return "ansi";
}

export function truecolorFg([r, g, b]: Rgb): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function truecolorBg([r, g, b]: Rgb): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

export function paintTruecolor(layer: "fg" | "bg", color: Rgb, text: string): string {
  const reset = layer === "fg" ? "\x1b[39m" : "\x1b[49m";
  return `${layer === "fg" ? truecolorFg(color) : truecolorBg(color)}${text}${reset}`;
}

export function graphicsCapabilitySummary(): string {
  return `mode=${graphicsQuality()} chosen=ansi ansi=yes renderer=chafa+halfblock`;
}
