// SPDX-License-Identifier: AGPL-3.0-or-later
// Visual design primitives for Nazar's Pi terminal UI.
// ANSI remains the minimal compatibility layer; richer terminals may use a
// graphics protocol backend for avatars while panels stay truecolor SGR.
import { graphicsCapabilitySummary } from "./graphics-protocol.ts";
import { LAYER_COLORS } from "./tokens.ts";

export type UiLayer = "background" | "shadow" | "border" | "accent" | "text" | "muted";

export type LayerPalette = Record<UiLayer, readonly [number, number, number]>;

// Derived from the single token source (lib/ui/tokens.ts) — never hand-tune here.
export const DEFAULT_LAYER_PALETTE: LayerPalette = {
  background: LAYER_COLORS.background,
  shadow: LAYER_COLORS.shadow,
  border: LAYER_COLORS.border,
  accent: LAYER_COLORS.accent,
  text: LAYER_COLORS.text,
  muted: LAYER_COLORS.muted,
};

export function ansiLayer(layer: UiLayer, text: string, palette: LayerPalette = DEFAULT_LAYER_PALETTE): string {
  const [r, g, b] = palette[layer];
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

export function paintLayer(layer: UiLayer, text: string, palette: LayerPalette = DEFAULT_LAYER_PALETTE): string {
  return ansiLayer(layer, text, palette);
}

export function uiCapabilitySummary(): string {
  return `${graphicsCapabilitySummary()} notes=portable ANSI truecolor panels, Chafa avatars`;
}
