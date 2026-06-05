// SPDX-License-Identifier: AGPL-3.0-or-later
// Small graphics protocol switchboard for Nazar's Pi terminal surface.
import { getCapabilities } from "@earendil-works/pi-tui";
import { graphicsQuality } from "./graphics-state.ts";

export type GraphicsProtocolBackend = "ansi" | "kitty-placeholder";
export type Rgb = readonly [number, number, number];

export type KittyImageOptions = {
  data: Buffer;
  format: "rgba" | "rgb" | "png";
  widthPx?: number;
  heightPx?: number;
  columns?: number;
  rows?: number;
  id?: number;
  virtualPlacement?: boolean;
};

const KITTY_CHUNK_BYTES = 4096;

function envBackend(): "auto" | GraphicsProtocolBackend {
  const raw = (process.env.NAZAR_GRAPHICS_PROTOCOL || process.env.NAZAR_AVATAR_BACKEND || "auto").trim().toLowerCase();
  if (raw === "kitty" || raw === "kitty-placeholder") return "kitty-placeholder";
  if (raw === "ansi") return "ansi";
  return "auto";
}

export function terminalSupportsKitty(): boolean {
  try {
    if (getCapabilities().images === "kitty") return true;
  } catch {
    // Capability probing is best-effort; environment detection below is cheap and local.
  }
  return (process.env.TERM || "").toLowerCase().includes("kitty") || Boolean(process.env.KITTY_WINDOW_ID);
}

export function selectGraphicsBackend(preferred: "auto" | GraphicsProtocolBackend = envBackend()): GraphicsProtocolBackend {
  if (preferred === "ansi") return "ansi";
  if (preferred === "kitty-placeholder") return terminalSupportsKitty() ? "kitty-placeholder" : "ansi";
  const quality = graphicsQuality();
  if (quality === "basic") return "ansi";
  if (quality === "hd") return terminalSupportsKitty() ? "kitty-placeholder" : "ansi";
  return terminalSupportsKitty() ? "kitty-placeholder" : "ansi";
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

function kittyFormat(format: KittyImageOptions["format"]): number {
  if (format === "png") return 100;
  if (format === "rgb") return 24;
  return 32;
}

function kittyControl(options: KittyImageOptions, more: 0 | 1, first: boolean): string {
  if (!first) return `m=${more}`;
  const fields = [`a=T`, `f=${kittyFormat(options.format)}`, `m=${more}`, "q=2"];
  if (options.format !== "png") {
    fields.push(`s=${Math.max(1, Math.floor(options.widthPx ?? 1))}`);
    fields.push(`v=${Math.max(1, Math.floor(options.heightPx ?? 1))}`);
  }
  if (options.columns !== undefined) fields.push(`c=${Math.max(1, Math.floor(options.columns))}`);
  if (options.rows !== undefined) fields.push(`r=${Math.max(1, Math.floor(options.rows))}`);
  if (options.id !== undefined) fields.push(`i=${Math.max(1, Math.floor(options.id))}`);
  if (options.virtualPlacement) fields.push("U=1");
  return fields.join(",");
}

export function kittyImage(options: KittyImageOptions): string {
  const encoded = options.data.toString("base64");
  if (!encoded) return "";
  let output = "";
  let first = true;
  for (let offset = 0; offset < encoded.length; offset += KITTY_CHUNK_BYTES) {
    const chunk = encoded.slice(offset, offset + KITTY_CHUNK_BYTES);
    const more = offset + KITTY_CHUNK_BYTES < encoded.length ? 1 : 0;
    output += `\x1b_G${kittyControl(options, more, first)};${chunk}\x1b\\`;
    first = false;
  }
  return output;
}

const PLACEHOLDER = "\u{10eeee}";
const ROW_COLUMN_DIACRITICS = [
  "\u0305", "\u030d", "\u030e", "\u0310", "\u0312", "\u033d", "\u033e", "\u033f",
  "\u0346", "\u034a", "\u034b", "\u034c", "\u0350", "\u0351", "\u0352", "\u0357",
  "\u035b", "\u0363", "\u0364", "\u0365", "\u0366", "\u0367", "\u0368", "\u0369",
  "\u036a", "\u036b", "\u036c", "\u036d", "\u036e", "\u036f",
] as const;

function diacritic(value: number): string {
  return ROW_COLUMN_DIACRITICS[value] ?? ROW_COLUMN_DIACRITICS[0];
}

export function kittyPlaceholderGrid(id: number, columns: number, rows: number): string[] {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  const colorId = Math.max(1, Math.floor(id)) & 0xffffff;
  const r = (colorId >> 16) & 0xff;
  const g = (colorId >> 8) & 0xff;
  const b = colorId & 0xff;
  const fg = `\x1b[38;2;${r};${g};${b}m`;
  const reset = "\x1b[39m";
  return Array.from({ length: safeRows }, (_, row) => {
    let line = fg;
    for (let column = 0; column < safeColumns; column++) {
      line += `${PLACEHOLDER}${diacritic(row)}${diacritic(column)}`;
    }
    return `${line}${reset}`;
  });
}

export function graphicsCapabilitySummary(): string {
  const chosen = selectGraphicsBackend();
  return `mode=${graphicsQuality()} chosen=${chosen} ansi=yes kitty=${terminalSupportsKitty() ? "yes" : "no"}`;
}
