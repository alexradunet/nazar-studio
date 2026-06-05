// SPDX-License-Identifier: AGPL-3.0-or-later
// Role/state-aware panel styling for Nazar's terminal UI.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { visibleWidth } from "./ansi.ts";
import { borderGlyphs, bottomHorizontal, topHorizontal, type BorderGlyphs } from "./borders.ts";
import { DEFAULT_LAYER_PALETTE } from "./design.ts";
export type PanelRole = "user" | "assistant" | "tool" | "thinking" | "system";
export type PanelState = "idle" | "active" | "running" | "ok" | "error" | "warning";
export type PanelPaint = (text: string) => string;

export type PanelStyle = {
  role: PanelRole;
  state: PanelState;
  glyphs: BorderGlyphs;
  paint: {
    border: PanelPaint;
    accent: PanelPaint;
    title: PanelPaint;
    muted: PanelPaint;
    shadow: PanelPaint;
    pulse: PanelPaint;
    text: PanelPaint;
  };
  background: Rgb | undefined;
  supports: {
    ansi: boolean;
    shadow: boolean;
    pulse: boolean;
  };
};

type Rgb = readonly [number, number, number];

type RolePalette = {
  border: Rgb;
  accent: Rgb;
  title: Rgb;
  muted: Rgb;
  shadow: Rgb;
  pulse: Rgb;
  text: Rgb;
  background: Rgb;
};

type RolePaletteOverride = Partial<Pick<RolePalette, "border" | "text" | "background">>;

type RolePaletteOverrides = Partial<Record<PanelRole, RolePaletteOverride>>;

const SETTINGS_PATH = join(process.env.HOME || process.cwd(), ".pi", "agent", "settings.json");
// Per-role colors can be customized in ~/.pi/agent/settings.json via one of:
//  - nazarPanelTheme
//  - nazarPanelStyles
//  - nazarPanelColors
// (object keyed by user|assistant|tool|thinking|system, each with border/text/background).
const PANEL_THEME_SETTING_KEYS = ["nazarPanelTheme", "nazarPanelStyles", "nazarPanelColors"] as const;
let panelThemeOverrides: RolePaletteOverrides | null = null;

function parseHex(value: string): Rgb | undefined {
  const match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return undefined;
  const hex = match[1];
  if (hex.length === 3) {
    return [
      Number.parseInt(`${hex[0]}${hex[0]}`, 16),
      Number.parseInt(`${hex[1]}${hex[1]}`, 16),
      Number.parseInt(`${hex[2]}${hex[2]}`, 16),
    ];
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function parseRgb(value: string): Rgb | undefined {
  const raw = value.trim().toLowerCase();
  const rgb = raw.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
  if (rgb) {
    const [, r, g, b] = rgb;
    return clampRgb(Number.parseInt(r, 10), Number.parseInt(g, 10), Number.parseInt(b, 10));
  }
  const parts = raw.split(/\s*,\s*/);
  if (parts.length === 3) {
    const parsed = parts.map((part) => Number.parseInt(part.trim(), 10));
    if (parsed.every((value) => Number.isFinite(value))) return clampRgb(parsed[0], parsed[1], parsed[2]);
  }
  return undefined;
}

function clampRgb(r: number, g: number, b: number): Rgb {
  return [
    Math.max(0, Math.min(255, Math.floor(r))),
    Math.max(0, Math.min(255, Math.floor(g))),
    Math.max(0, Math.min(255, Math.floor(b))),
  ];
}

function parsePanelColor(value: unknown): Rgb | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("#")) return parseHex(trimmed);
  if (trimmed.startsWith("rgb")) return parseRgb(trimmed);
  return parseRgb(trimmed);
}

function readPanelThemeOverrides(): RolePaletteOverrides {
  if (panelThemeOverrides !== null) return panelThemeOverrides;
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    const settings = JSON.parse(raw);
    panelThemeOverrides = {};
    const themeSource = PANEL_THEME_SETTING_KEYS
      .map((key) => settings[key as keyof typeof settings])
      .find((value) => value && typeof value === "object" && !Array.isArray(value));
    const paletteSource = (themeSource as { roles?: Record<string, unknown> } | undefined)?.roles ?? themeSource;

    for (const role of Object.keys(paletteSource ?? {}) as PanelRole[]) {
      const entry = (paletteSource as Record<string, unknown>)[role];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      const override: RolePaletteOverride = {};
      const border = parsePanelColor(raw.border);
      if (border) override.border = border;
      const text = parsePanelColor(raw.text);
      if (text) override.text = text;
      const background = parsePanelColor(raw.background);
      if (background) override.background = background;
      if (Object.keys(override).length > 0) panelThemeOverrides[role] = override;
    }

    return panelThemeOverrides;
  } catch {
    panelThemeOverrides = {};
    return panelThemeOverrides;
  }
}

function roleThemePalette(role: PanelRole): RolePaletteOverride {
  const overrides = readPanelThemeOverrides();
  return overrides[role] ?? {};
}

const PALETTES: Record<PanelRole, RolePalette> = {
  user: {
    border: [91, 130, 228],
    accent: [168, 192, 240],
    title: [196, 214, 255],
    muted: [107, 122, 139],
    shadow: [30, 37, 52],
    pulse: [130, 169, 244],
    text: DEFAULT_LAYER_PALETTE.text,
    background: [16, 34, 31],
  },
  assistant: {
    border: [212, 154, 73],
    accent: [233, 194, 103],
    title: [255, 222, 176],
    muted: [107, 122, 139],
    shadow: [42, 35, 25],
    pulse: [255, 214, 122],
    text: DEFAULT_LAYER_PALETTE.text,
    background: [35, 23, 15],
  },
  thinking: {
    border: [72, 179, 188],
    accent: [118, 213, 220],
    title: [160, 235, 240],
    muted: [107, 139, 145],
    shadow: [24, 55, 58],
    pulse: [178, 245, 248],
    text: DEFAULT_LAYER_PALETTE.text,
    background: [16, 41, 39],
  },
  tool: {
    border: [134, 150, 95],
    accent: [233, 194, 103],
    title: [244, 239, 228],
    muted: [107, 122, 139],
    shadow: [36, 38, 42],
    pulse: [244, 239, 228],
    text: DEFAULT_LAYER_PALETTE.text,
    background: [16, 34, 31],
  },
  system: {
    border: [112, 118, 136],
    accent: [154, 177, 185],
    title: [244, 239, 228],
    muted: [107, 122, 139],
    shadow: [31, 35, 42],
    pulse: [180, 190, 200],
    text: DEFAULT_LAYER_PALETTE.text,
    background: [15, 29, 42],
  },
};
const STATE_ACCENTS: Partial<Record<PanelState, Partial<RolePalette>>> = {
  running: {
    accent: [130, 169, 244],
    title: [196, 214, 255],
    shadow: [22, 54, 58],
  },
  ok: {
    border: [70, 150, 156],
    accent: [118, 213, 220],
    title: [170, 238, 242],
    shadow: [22, 54, 58],
  },
  error: {
    border: [170, 65, 52],
    accent: [224, 86, 59],
    title: [255, 160, 130],
    shadow: [70, 30, 27],
    pulse: [255, 120, 96],
  },
  warning: {
    border: [170, 132, 64],
    accent: [233, 194, 103],
    title: [255, 225, 155],
    shadow: [52, 43, 28],
  },
};

function mixPalette(role: PanelRole, state: PanelState): RolePalette {
  const override = roleThemePalette(role);
  const palette = {
    ...PALETTES[role],
    ...(STATE_ACCENTS[state] || {}),
  } as RolePalette;
  return { ...palette, ...override };
}

function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
  ];
}

function pulseColor(palette: RolePalette, frame = 0): Rgb {
  const phase = (Math.sin(frame * 0.9) + 1) / 2;
  return mixRgb(palette.accent, palette.pulse, 0.35 + phase * 0.65);
}

function color([r, g, b]: Rgb, text: string): string {
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

function painter(colorValue: Rgb): PanelPaint {
  return (text) => color(colorValue, text);
}

export type PanelBorderPart = "base" | "vertical" | "corner" | "join" | "separator" | "shadow" | "pulse";

export function paintPanelBorderPart(style: PanelStyle, part: PanelBorderPart, text: string): string {
  if (part === "shadow") return style.paint.shadow(text);
  if (part === "pulse") return style.paint.pulse(text);
  if (part === "separator") return style.paint.muted(text);
  return style.paint.border(text);
}

export function panelHorizontal(style: PanelStyle, width: number, part: PanelBorderPart = "base"): string {
  return paintPanelBorderPart(style, part, topHorizontal(Math.max(0, width), style.glyphs));
}

export function panelBottomHorizontal(style: PanelStyle, width: number, part: PanelBorderPart = "base"): string {
  return paintPanelBorderPart(style, part, bottomHorizontal(Math.max(0, width), style.glyphs));
}

export function panelRule(style: PanelStyle, width: number): string {
  const safeWidth = Math.max(0, Math.floor(width));
  if (safeWidth <= 0) return "";
  return panelHorizontal(style, safeWidth, "base");
}

export function panelLabeledTop(style: PanelStyle, innerWidth: number, label: string | undefined): string {
  const g = style.glyphs;
  const plainTop = `${paintPanelBorderPart(style, "corner", g.topLeft)}${panelHorizontal(style, innerWidth, "base")}${paintPanelBorderPart(style, "corner", g.topRight)}`;
  const title = label ? ` ${label} ` : "";
  const titleWidth = visibleWidth(title);
  if (!title || titleWidth >= innerWidth) return plainTop;
  const left = Math.floor((innerWidth - titleWidth) / 2);
  const right = innerWidth - titleWidth - left;
  return `${paintPanelBorderPart(style, "corner", g.topLeft)}${panelHorizontal(style, left, "base")}${title}${panelHorizontal(style, right, "base")}${paintPanelBorderPart(style, "corner", g.topRight)}`;
}

export function panelStyle(
  role: PanelRole,
  state: PanelState = "idle",
  options: { frame?: number } = {},
): PanelStyle {
  const palette = mixPalette(role, state);
  const activePulse = state === "active" || state === "running";
  const pulse = activePulse ? pulseColor(palette, options.frame) : palette.accent;
  return {
    role,
    state,
    glyphs: borderGlyphs(),
    paint: {
      border: painter(palette.border),
      accent: painter(palette.accent),
      title: painter(palette.title),
      muted: painter(palette.muted),
      shadow: painter(palette.shadow),
      pulse: painter(pulse),
      text: painter(palette.text),
    },
    background: palette.background,
    supports: {
      ansi: true,
      shadow: false,
      pulse: activePulse,
    },
  };
}
