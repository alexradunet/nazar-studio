// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEPARTURE_MONO_URL = "https://departuremono.com/";
export const RECOMMENDED_FONT = "Departure Mono";
export const MIN_KITTY_VERSION = "0.35.0";

type Env = Record<string, string | undefined>;

type TerminalExperience = {
  terminalName: string;
  isKitty: boolean;
  kittyVersion?: string;
  fontName?: string;
  hasModernAnsi: boolean;
};

function compareVersions(left: string, right: string): number {
  const a = left.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isDepartureMono(fontName: string | undefined): boolean {
  return normalize(fontName ?? "").includes("departuremono");
}

function terminalName(env: Env): string {
  if (env.KITTY_WINDOW_ID) return "kitty";
  return env.TERM_PROGRAM || env.TERMINAL_EMULATOR || env.TERM || "unknown";
}

function kittyVersion(env: Env): string | undefined {
  if (!env.KITTY_WINDOW_ID && normalize(env.TERM_PROGRAM ?? "") !== "kitty") return undefined;
  return env.KITTY_VERSION || env.TERM_PROGRAM_VERSION;
}

function hasModernAnsi(env: Env): boolean {
  const term = env.TERM ?? "";
  const colorTerm = normalize(env.COLORTERM ?? "");
  return term !== "dumb" && (colorTerm.includes("truecolor") || colorTerm.includes("24bit") || term.includes("256color"));
}

function parseKittyFont(config: string): string | undefined {
  for (const line of config.split(/\r?\n/)) {
    const clean = line.replace(/#.*/, "").trim();
    const match = clean.match(/^font_family\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function kittyConfigPaths(env: Env): string[] {
  const paths: string[] = [];
  if (env.KITTY_CONFIG_DIRECTORY) paths.push(join(env.KITTY_CONFIG_DIRECTORY, "kitty.conf"));
  const home = env.HOME ?? env.USERPROFILE;
  if (env.XDG_CONFIG_HOME) paths.push(join(env.XDG_CONFIG_HOME, "kitty", "kitty.conf"));
  if (home) paths.push(join(home, ".config", "kitty", "kitty.conf"));
  return [...new Set(paths)];
}

function detectFont(env: Env): string | undefined {
  const envFont = env.NAZAR_TERMINAL_FONT || env.KITTY_FONT_FAMILY || env.TERMINAL_FONT;
  if (envFont) return envFont;
  for (const path of kittyConfigPaths(env)) {
    try {
      if (!existsSync(path)) continue;
      const font = parseKittyFont(readFileSync(path, "utf8"));
      if (font) return font;
    } catch {
      // Best-effort startup hint only.
    }
  }
  return undefined;
}

export function detectTerminalExperience(env: Env = process.env): TerminalExperience {
  const name = terminalName(env);
  const isKitty = normalize(name) === "kitty" || Boolean(env.KITTY_WINDOW_ID);
  return {
    terminalName: name,
    isKitty,
    kittyVersion: kittyVersion(env),
    fontName: detectFont(env),
    hasModernAnsi: hasModernAnsi(env),
  };
}

export function terminalExperienceNotice(env: Env = process.env): string | undefined {
  const info = detectTerminalExperience(env);
  const suggestions: string[] = [];

  if (!info.hasModernAnsi) {
    suggestions.push("run Nazar Studio in a modern truecolor ANSI terminal");
  }

  if (!info.isKitty) {
    suggestions.push(`use kitty >= ${MIN_KITTY_VERSION} so Nazar can leverage the kitty protocol fully`);
  } else if (info.kittyVersion && compareVersions(info.kittyVersion, MIN_KITTY_VERSION) < 0) {
    suggestions.push(`upgrade kitty ${info.kittyVersion} to >= ${MIN_KITTY_VERSION}`);
  }

  if (!isDepartureMono(info.fontName)) {
    suggestions.push(`switch your terminal font to ${RECOMMENDED_FONT} (${DEPARTURE_MONO_URL})`);
  }

  if (suggestions.length === 0) return undefined;
  const detectedFont = info.fontName ? ` font=${info.fontName};` : " font=unknown;";
  const detectedKitty = info.kittyVersion ? ` kitty=${info.kittyVersion};` : "";
  return `For the best Nazar Studio experience:${detectedFont}${detectedKitty} ${suggestions.join("; ")}.`;
}
