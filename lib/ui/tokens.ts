// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Nazar design tokens — THE single typed source of truth for the Basm design
// system. Color, type, layout, and the terminal role palette all live here.
//
// Generated artifacts (run `npm run build:tokens`, do NOT hand-edit):
//   - design/tokens.css   → web CSS custom properties (dark + light)
//   - themes/nazar.json   → Pi terminal theme (vars + semantic roles)
//
// The terminal panel palette (lib/ui/panel-style.ts) and the low-level layer
// palette (lib/ui/design.ts) import the RGB tuples below directly, so a colour
// is defined exactly once and flows to every surface.
//
// Source-of-truth rule: if a colour differs anywhere else, this file wins.

export type Rgb = readonly [number, number, number];
export type Hex = `#${string}`;

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function rgbToHex([r, g, b]: Rgb): Hex {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Linear mix of two colours. amount=0 → a, amount=1 → b. */
export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
  ];
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
export const lighten = (c: Rgb, amount: number): Rgb => mix(c, WHITE, amount);
export const darken = (c: Rgb, amount: number): Rgb => mix(c, BLACK, amount);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Brand + surface palette — canonical hex values (dark theme is the identity)
//    Values are the canonical Basm set from the former design/tokens.css.
// ─────────────────────────────────────────────────────────────────────────────

export const COLOR = {
  // Brand accents (theme-independent intent)
  gold: "#f2c14e",
  goldDeep: "#b8862a",
  ember: "#ff6a2b",
  emberDeep: "#c2410c",
  emberRed: "#e5484d",
  teal: "#2dd4bf",
  tealDeep: "#0d9488",
  folkred: "#e0563b",
  indigo: "#a8c0f0",
  indigoDeep: "#5b82e4",
  violet: "#c084fc",
  good: "#7fcf6a",
  steel: "#9db0a5",
  smoke: "#566274",

  // Dark surfaces (default — night-green guardian domain)
  bg: "#0b1310",
  surface: "#11201b",
  surface2: "#172a23",
  surface3: "#1f352c",
  fg: "#eae4d6",
  onSurface: "#f5f0e6",
  muted: "#93a59b",
  hair: "#233530",
  outline2: "#1a2823",

  // Per-role night fields (terminal ambient panel tints)
  nightWarm: "#23170f", // assistant (gold/umber)
  nightTeal: "#102927", // thinking (teal)
  nightGreen: "#10221f", // user / tool (guardian green)
  nightBlue: "#0f1d2a", // system (slate)
  nightSelect: "#22332c",
} as const satisfies Record<string, Hex>;

export const LIGHT_COLOR = {
  gold: "#8a6d12",
  goldDeep: "#6b5410",
  ember: "#c2410c",
  emberDeep: "#9a3410",
  emberRed: "#b42318",
  teal: "#00656b",
  tealDeep: "#024a4f",
  folkred: "#983f20",
  indigo: "#1e3a8a",
  indigoDeep: "#1e3a8a",
  violet: "#7c3aed",
  good: "#3f6f2f",
  steel: "#5c6e63",
  smoke: "#5c6e63",
  bg: "#f5f1e8",
  surface: "#fffdf7",
  surface2: "#ece6d7",
  surface3: "#e3dcc9",
  fg: "#18221d",
  onSurface: "#121b16",
  muted: "#5c6e63",
  hair: "#d8d0bf",
  outline2: "#e2dccb",
  nightWarm: "#ece6d7",
  nightTeal: "#e3dcc9",
  nightGreen: "#ece6d7",
  nightBlue: "#e3dcc9",
  nightSelect: "#e3dcc9",
} as const satisfies Record<string, Hex>;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Typography + layout tokens (consumed by the web CSS generator)
// ─────────────────────────────────────────────────────────────────────────────

export const FONT = {
  display: "'Pixelify Sans', system-ui, sans-serif",
  pixel: "'Silkscreen', monospace",
  body: "'Work Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const LAYOUT = {
  radius: "3px",
  maxw: "1080px",
  margin: "6vw",
  shadowHard: "5px 5px 0",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Terminal role palette — derived from the brand hues above.
//    Shape matches lib/ui/panel-style.ts RolePalette (all RGB tuples).
// ─────────────────────────────────────────────────────────────────────────────

export type PanelRole = "user" | "assistant" | "tool" | "thinking" | "system";

export type RolePalette = {
  border: Rgb;
  accent: Rgb;
  title: Rgb;
  muted: Rgb;
  shadow: Rgb;
  pulse: Rgb;
  text: Rgb;
  background: Rgb;
};

const rgb = (hex: Hex): Rgb => hexToRgb(hex);

/** Build a role palette from a single brand hue + an ambient night background. */
function roleFromHue(hue: Rgb, background: Rgb): RolePalette {
  return {
    border: hue,
    accent: lighten(hue, 0.12),
    title: lighten(hue, 0.4),
    muted: rgb(COLOR.muted),
    shadow: darken(hue, 0.78),
    pulse: lighten(hue, 0.55),
    text: rgb(COLOR.onSurface),
    background,
  };
}

export const TERMINAL_ROLE_PALETTES: Record<PanelRole, RolePalette> = {
  user: roleFromHue(rgb(COLOR.indigo), rgb(COLOR.nightGreen)),
  assistant: roleFromHue(rgb(COLOR.gold), rgb(COLOR.nightWarm)),
  thinking: roleFromHue(rgb(COLOR.teal), rgb(COLOR.nightTeal)),
  tool: roleFromHue(rgb(COLOR.steel), rgb(COLOR.nightGreen)),
  system: roleFromHue(rgb(COLOR.smoke), rgb(COLOR.nightBlue)),
};

export type PanelStateAccent = Partial<RolePalette>;

/** State overlays — outcome colours that may override a role's accent/border. */
export const TERMINAL_STATE_ACCENTS: Record<string, PanelStateAccent> = {
  running: {
    accent: rgb(COLOR.indigoDeep),
    title: lighten(rgb(COLOR.indigoDeep), 0.35),
    shadow: darken(rgb(COLOR.teal), 0.7),
  },
  ok: {
    border: rgb(COLOR.tealDeep),
    accent: rgb(COLOR.teal),
    title: lighten(rgb(COLOR.teal), 0.4),
    shadow: darken(rgb(COLOR.teal), 0.7),
  },
  error: {
    border: rgb(COLOR.emberRed),
    accent: rgb(COLOR.ember),
    title: lighten(rgb(COLOR.emberRed), 0.4),
    shadow: darken(rgb(COLOR.emberRed), 0.6),
    pulse: lighten(rgb(COLOR.ember), 0.3),
  },
  warning: {
    border: rgb(COLOR.goldDeep),
    accent: rgb(COLOR.gold),
    title: lighten(rgb(COLOR.gold), 0.4),
    shadow: darken(rgb(COLOR.gold), 0.7),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3b. Avatar portrait fields — the background behind a rendered sprite.
//     Intentionally brighter than the panel ambient tint so the pixel art keeps
//     contrast. Single home for what pixel-avatar.ts + avatars.ts both consumed.
// ─────────────────────────────────────────────────────────────────────────────

export const AVATAR_FIELDS = {
  user: [31, 40, 64],
  nazar: [54, 42, 30],
  thinking: [24, 55, 58],
  toolPending: [52, 43, 28],
  toolRunning: [50, 51, 55],
  toolOk: [22, 54, 58],
  toolError: [70, 30, 27],
} as const satisfies Record<string, Rgb>;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Low-level UI layer palette (consumed by lib/ui/design.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const LAYER_COLORS = {
  background: rgb(COLOR.surface),
  shadow: rgb(COLOR.surface2),
  border: rgb(COLOR.smoke),
  accent: rgb(COLOR.gold),
  text: rgb(COLOR.onSurface),
  muted: rgb(COLOR.muted),
} as const satisfies Record<string, Rgb>;

// ─────────────────────────────────────────────────────────────────────────────
// 5. Pi theme mapping — semantic role → token key.
//    Consumed by scripts/build-tokens.ts to generate themes/nazar.json.
// ─────────────────────────────────────────────────────────────────────────────

/** Token keys exposed to the Pi theme as `vars`. */
export const THEME_VARS = [
  "gold",
  "ember",
  "emberRed",
  "teal",
  "indigo",
  "violet",
  "good",
  "steel",
  "smoke",
  "muted",
  "hair",
  "onSurface",
  "nightWarm",
  "nightTeal",
  "nightGreen",
  "nightBlue",
  "nightSelect",
] as const;

/** Pi theme role → token var name (or literal). Mirrors the schema in pi-tui. */
export const THEME_ROLE_MAP: Record<string, keyof typeof COLOR | number> = {
  accent: "gold",
  border: "teal",
  borderAccent: "ember",
  borderMuted: "smoke",
  success: "good",
  error: "emberRed",
  warning: "gold",
  muted: "steel",
  dim: 240,
  text: "onSurface",
  thinkingText: "teal",
  selectedBg: "nightSelect",
  userMessageBg: "nightGreen",
  userMessageText: "onSurface",
  customMessageBg: "nightWarm",
  customMessageText: "onSurface",
  customMessageLabel: "gold",
  toolPendingBg: "nightTeal",
  toolSuccessBg: "nightGreen",
  toolErrorBg: "nightWarm",
  toolTitle: "gold",
  toolOutput: "onSurface",
  mdHeading: "ember",
  mdLink: "teal",
  mdLinkUrl: "steel",
  mdCode: "teal",
  mdCodeBlock: "onSurface",
  mdCodeBlockBorder: "smoke",
  mdQuote: "steel",
  mdQuoteBorder: "teal",
  mdHr: "smoke",
  mdListBullet: "gold",
  toolDiffAdded: "good",
  toolDiffRemoved: "emberRed",
  toolDiffContext: "steel",
  syntaxComment: "steel",
  syntaxKeyword: "ember",
  syntaxFunction: "gold",
  syntaxVariable: "teal",
  syntaxString: "teal",
  syntaxNumber: "indigo",
  syntaxType: "gold",
  syntaxOperator: "ember",
  syntaxPunctuation: "steel",
  thinkingOff: "steel",
  thinkingMinimal: "teal",
  thinkingLow: "teal",
  thinkingMedium: "gold",
  thinkingHigh: "gold",
  thinkingXhigh: "ember",
  bashMode: "ember",
};
