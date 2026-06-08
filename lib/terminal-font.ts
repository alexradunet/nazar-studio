// SPDX-License-Identifier: AGPL-3.0-or-later
import { join } from "node:path";

export const IOSEVKA_FONT_FAMILY = "Iosevka Term";
export const IOSEVKA_URL = "https://github.com/be5invis/Iosevka";
export const OCTANT_RANGE = "U+1CD00-U+1CDEF";

export type TerminalKind = "kitty" | "unknown";

type Env = Record<string, string | undefined>;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function terminalKind(env: Env = process.env): TerminalKind {
  if (env.KITTY_WINDOW_ID) return "kitty";
  const term = `${env.TERM_PROGRAM ?? ""} ${env.TERM ?? ""}`;
  return normalize(term).includes("kitty") ? "kitty" : "unknown";
}

export function defaultKittyConfigPath(env: Env = process.env): string {
  const home = env.HOME || ".";
  const configHome = env.XDG_CONFIG_HOME || join(home, ".config");
  return join(configHome, "kitty", "kitty.conf");
}

export function octantGlyphTestCommand(): string {
  return "printf '\\U0001CD00 \\U0001CD01 \\U0001CD02 \\U0001CD03\\n'";
}

export function isIosevkaFontName(fontName: string | undefined): boolean {
  return normalize(fontName ?? "").includes("iosevka");
}

function directivePattern(name: string): RegExp {
  return new RegExp(`^\\s*${name}\\s+`, "i");
}

function isComment(line: string): boolean {
  return line.trimStart().startsWith("#");
}

function setDirective(lines: string[], name: string, value: string): boolean {
  const pattern = directivePattern(name);
  const next = `${name} ${value}`;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (isComment(line) || !pattern.test(line)) continue;
    if (line === next) return false;
    lines[i] = next;
    return true;
  }
  lines.push(next);
  return true;
}

function setOctantSymbolMap(lines: string[], fontFamily: string): boolean {
  const next = `symbol_map ${OCTANT_RANGE} ${fontFamily}`;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (isComment(line) || !directivePattern("symbol_map").test(line)) continue;
    if (!line.toUpperCase().includes("1CD00")) continue;
    if (line === next) return false;
    lines[i] = next;
    return true;
  }
  lines.push(next);
  return true;
}

export function upsertKittyFontConfig(content: string, fontFamily = IOSEVKA_FONT_FAMILY): { content: string; changed: boolean } {
  const hadFinalNewline = content.endsWith("\n") || content.length === 0;
  const lines = content.length > 0 ? content.replace(/\r\n/g, "\n").split("\n") : [];
  if (lines.at(-1) === "") lines.pop();

  let changed = false;
  if (!lines.some((line) => line.includes("Nazar terminal font"))) {
    if (lines.length > 0 && lines.at(-1) !== "") lines.push("");
    lines.push("# Nazar terminal font: Iosevka Term for octant/high avatars");
    changed = true;
  }
  changed = setDirective(lines, "font_family", fontFamily) || changed;
  changed = setOctantSymbolMap(lines, fontFamily) || changed;

  return { content: `${lines.join("\n")}${hadFinalNewline ? "\n" : ""}`, changed };
}
