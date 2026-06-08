// SPDX-License-Identifier: AGPL-3.0-or-later

export const IOSEVKA_URL = "https://github.com/be5invis/Iosevka";
export const RECOMMENDED_FONT = "Iosevka Term";

type Env = Record<string, string | undefined>;

type TerminalExperience = {
  terminalName: string;
  fontName?: string;
  hasModernAnsi: boolean;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isIosevka(fontName: string | undefined): boolean {
  return normalize(fontName ?? "").includes("iosevka");
}

function terminalName(env: Env): string {
  return env.TERM_PROGRAM || env.TERMINAL_EMULATOR || env.TERM || "unknown";
}

function hasModernAnsi(env: Env): boolean {
  const term = env.TERM ?? "";
  const colorTerm = normalize(env.COLORTERM ?? "");
  return term !== "dumb" && (colorTerm.includes("truecolor") || colorTerm.includes("24bit") || term.includes("256color"));
}

function detectFont(env: Env): string | undefined {
  return env.NAZAR_TERMINAL_FONT || env.TERMINAL_FONT;
}

export function detectTerminalExperience(env: Env = process.env): TerminalExperience {
  return {
    terminalName: terminalName(env),
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

  if (!isIosevka(info.fontName)) {
    suggestions.push(`switch your terminal font to ${RECOMMENDED_FONT} (${IOSEVKA_URL})`);
  }

  if (suggestions.length === 0) return undefined;
  const detectedFont = info.fontName ? ` font=${info.fontName};` : " font=unknown;";
  return `For the best Nazar Studio experience:${detectedFont} ${suggestions.join("; ")}.`;
}
