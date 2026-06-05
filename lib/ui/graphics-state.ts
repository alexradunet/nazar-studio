// SPDX-License-Identifier: AGPL-3.0-or-later
// Session-local Nazar UI graphics quality. Kept deliberately small: renderers
// read this at call time, and /nazar-ui can switch it without reloading Pi.

export type GraphicsQuality = "basic" | "hd" | "auto";

let overrideQuality: GraphicsQuality | undefined;

function envQuality(): GraphicsQuality {
  const raw = (process.env.NAZAR_UI_QUALITY || process.env.NAZAR_GRAPHICS_QUALITY || "auto").trim().toLowerCase();
  if (raw === "basic" || raw === "ansi") return "basic";
  if (raw === "hd" || raw === "kitty") return "hd";
  return "auto";
}

export function graphicsQuality(): GraphicsQuality {
  return overrideQuality ?? envQuality();
}

export function setGraphicsQuality(quality: GraphicsQuality | undefined): void {
  overrideQuality = quality;
}
