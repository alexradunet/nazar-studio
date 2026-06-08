// SPDX-License-Identifier: AGPL-3.0-or-later
// Small graphics protocol switchboard for Nazar's Pi terminal surface.
import { graphicsQuality } from "./graphics-state.ts";

export type GraphicsProtocolBackend = "ansi";
export type Rgb = readonly [number, number, number];

export function selectGraphicsBackend(_preferred: "auto" | GraphicsProtocolBackend = "auto"): GraphicsProtocolBackend {
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
  return `mode=${graphicsQuality()} chosen=${selectGraphicsBackend()} ansi=yes renderer=chafa`;
}
