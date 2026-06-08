// SPDX-License-Identifier: AGPL-3.0-or-later
// Session-local Nazar UI avatar quality. Kept deliberately small: renderers
// read this at call time, and /nazar-ui can switch it without reloading Pi.

export type UiQuality = "low" | "medium" | "high";
export type UiRenderer = "half-block" | "sextant" | "octant";

const DEFAULT_UI_QUALITY: UiQuality = "medium";

let overrideQuality: UiQuality | undefined;

function envQuality(): UiQuality {
  const raw = (process.env.NAZAR_UI_QUALITY || "").trim().toLowerCase();
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return DEFAULT_UI_QUALITY;
}

export function uiQuality(): UiQuality {
  return overrideQuality ?? envQuality();
}

export function uiRenderer(quality: UiQuality = uiQuality()): UiRenderer {
  if (quality === "low") return "half-block";
  if (quality === "high") return "octant";
  return "sextant";
}

export function setUiQuality(quality: UiQuality | undefined): void {
  overrideQuality = quality;
}
