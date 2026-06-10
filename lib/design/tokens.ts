// SPDX-License-Identifier: AGPL-3.0-or-later
export type Rgb = readonly [number, number, number];
export type Hex = `#${string}`;

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

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

export const COLOR = {
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
  bg: "#0b1310",
  surface: "#11201b",
  surface2: "#172a23",
  surface3: "#1f352c",
  fg: "#eae4d6",
  onSurface: "#f5f0e6",
  muted: "#93a59b",
  hair: "#233530",
  outline2: "#1a2823",
  nightWarm: "#23170f",
  nightTeal: "#102927",
  nightGreen: "#10221f",
  nightBlue: "#0f1d2a",
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

export type TerminalRole = "user" | "assistant" | "tool" | "thinking" | "system";

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

export const TERMINAL_ROLE_PALETTES: Record<TerminalRole, RolePalette> = {
  user: roleFromHue(rgb(COLOR.indigo), rgb(COLOR.nightGreen)),
  assistant: roleFromHue(rgb(COLOR.gold), rgb(COLOR.nightWarm)),
  thinking: roleFromHue(rgb(COLOR.teal), rgb(COLOR.nightTeal)),
  tool: roleFromHue(rgb(COLOR.steel), rgb(COLOR.nightGreen)),
  system: roleFromHue(rgb(COLOR.smoke), rgb(COLOR.nightBlue)),
};

export const AVATAR_FIELDS = {
  user: TERMINAL_ROLE_PALETTES.user.background,
  balaur: TERMINAL_ROLE_PALETTES.assistant.background,
  thinking: TERMINAL_ROLE_PALETTES.thinking.background,
  tool: TERMINAL_ROLE_PALETTES.tool.background,
} as const satisfies Record<string, Rgb>;
