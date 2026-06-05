// SPDX-License-Identifier: AGPL-3.0-or-later
// Visual design primitives for Nazar's Pi terminal UI.
// ANSI remains the minimal compatibility layer; richer terminals may use a
// graphics protocol backend for avatars while panels stay truecolor SGR.
import { graphicsCapabilitySummary } from "./graphics-protocol.ts";

export type UiLayer = "background" | "shadow" | "border" | "accent" | "text" | "muted";

export type LayerPalette = Record<UiLayer, readonly [number, number, number]>;

export const DEFAULT_LAYER_PALETTE: LayerPalette = {
  background: [18, 22, 26],
  shadow: [31, 35, 42],
  border: [86, 98, 116],
  accent: [233, 194, 103],
  text: [244, 239, 228],
  muted: [107, 122, 139],
};

export function ansiLayer(layer: UiLayer, text: string, palette: LayerPalette = DEFAULT_LAYER_PALETTE): string {
  const [r, g, b] = palette[layer];
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

export function paintLayer(layer: UiLayer, text: string, palette: LayerPalette = DEFAULT_LAYER_PALETTE): string {
  return ansiLayer(layer, text, palette);
}

export function uiCapabilitySummary(): string {
  return `${graphicsCapabilitySummary()} notes=ANSI truecolor panels, optional Kitty avatars`;
}
