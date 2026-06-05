// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Token generator: lib/ui/tokens.ts → design/tokens.css + themes/nazar.json.
//
//   npm run build:tokens            regenerate the artifacts
//   npm run build:tokens -- --check verify they are in sync (exits 1 on drift)
//
// tokens.ts is the single source of truth; these two files are build outputs.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLOR, FONT, LAYOUT, LIGHT_COLOR, THEME_ROLE_MAP, THEME_VARS } from "../lib/ui/tokens.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type ColorKey = keyof typeof COLOR;

const CSS_BRAND: [string, ColorKey][] = [
  ["gold", "gold"],
  ["gold-deep", "goldDeep"],
  ["ember", "ember"],
  ["ember-deep", "emberDeep"],
  ["ember-red", "emberRed"],
  ["teal", "teal"],
  ["teal-deep", "tealDeep"],
  ["folkred", "folkred"],
  ["indigo", "indigo"],
  ["violet", "violet"],
];

const CSS_SURFACE: [string, ColorKey][] = [
  ["bg", "bg"],
  ["surface", "surface"],
  ["surface-2", "surface2"],
  ["surface-3", "surface3"],
  ["fg", "fg"],
  ["on-surface", "onSurface"],
  ["muted", "muted"],
  ["hair", "hair"],
  ["outline-2", "outline2"],
];

function cssBlock(selector: string, palette: Record<string, string>, includeStatic: boolean): string {
  const lines = [`${selector} {`, "  /* Brand accents */"];
  for (const [name, key] of CSS_BRAND) lines.push(`  --${name}: ${palette[key]};`);
  lines.push("  /* Surfaces */");
  for (const [name, key] of CSS_SURFACE) lines.push(`  --${name}: ${palette[key]};`);
  lines.push("  /* Status — always pair with a text label, never colour-only */");
  lines.push("  --ok: var(--teal);", "  --warn: var(--gold);", "  --err: var(--ember-red);");
  if (includeStatic) {
    lines.push("  /* Type */");
    lines.push(`  --font-display: ${FONT.display};`);
    lines.push(`  --font-pixel: ${FONT.pixel};`);
    lines.push(`  --font-body: ${FONT.body};`);
    lines.push(`  --font-mono: ${FONT.mono};`);
    lines.push("  /* Layout */");
    lines.push(`  --radius: ${LAYOUT.radius};`);
    lines.push(`  --maxw: ${LAYOUT.maxw};`);
    lines.push(`  --margin: ${LAYOUT.margin};`);
    lines.push(`  --shadow-hard: ${LAYOUT.shadowHard};`);
  }
  lines.push("}");
  return lines.join("\n");
}

export function renderTokensCss(): string {
  const header = [
    "/* SPDX-License-Identifier: AGPL-3.0-or-later */",
    "/* GENERATED FROM lib/ui/tokens.ts — DO NOT EDIT. Run `npm run build:tokens`. */",
    "/* Nazar canonical design tokens (Basm). Dark is the default identity; */",
    '/* add class="light" on <html> for the light theme. */',
    "",
  ].join("\n");
  return `${header}\n${cssBlock(":root", COLOR, true)}\n\n${cssBlock(":root.light", LIGHT_COLOR, false)}\n`;
}

export function renderThemeJson(): string {
  const vars: Record<string, string> = {};
  for (const key of THEME_VARS) vars[key] = COLOR[key];
  const colors: Record<string, string | number> = {};
  for (const [role, value] of Object.entries(THEME_ROLE_MAP)) colors[role] = value;
  const theme = {
    $schema:
      "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
    name: "nazar",
    vars,
    colors,
  };
  return `${JSON.stringify(theme, null, 2)}\n`;
}

/**
 * Compact inline CSS block for web/index.html — a minified :root { } +
 * :root.light { } pair without the full CSS file comments.
 * GitHub Pages serves the page from the web/ directory, so we can't
 * reference ../design/tokens.css with a <link>; the palette is embedded
 * inline and regenerated here from the same token source.
 */
export function renderWebInlineCss(): string {
  const darkVars: string[] = [];
  for (const [name, key] of CSS_BRAND) darkVars.push(`  --${name}:${COLOR[key as ColorKey]};`);
  for (const [name, key] of CSS_SURFACE) darkVars.push(`  --${name}:${COLOR[key as ColorKey]};`);
  darkVars.push(
    `  --font-display:${FONT.display};`,
    `  --font-pixel:${FONT.pixel};`,
    `  --font-body:${FONT.body};`,
    `  --font-mono:${FONT.mono};`,
    `  --radius:${LAYOUT.radius}; --maxw:${LAYOUT.maxw};`,
  );

  const lightVars: string[] = [];
  for (const [name, key] of CSS_BRAND) lightVars.push(`  --${name}:${LIGHT_COLOR[key as ColorKey]};`);
  for (const [name, key] of CSS_SURFACE) lightVars.push(`  --${name}:${LIGHT_COLOR[key as ColorKey]};`);

  return [
    "/* GENERATED FROM lib/ui/tokens.ts — DO NOT EDIT. Run `npm run build:tokens`. */",
    `:root{\n${darkVars.join("\n")}\n}`,
    `:root.light{\n${lightVars.join("\n")}\n}`,
  ].join("\n");
}

const WEB_INDEX = join(ROOT, "web", "index.html");
const WEB_MARKER_START = "/* GENERATED TOKENS START */";
const WEB_MARKER_END   = "/* GENERATED TOKENS END */";

function renderWebIndex(): string {
  const current = readFileSync(WEB_INDEX, "utf8");
  const startIdx = current.indexOf(WEB_MARKER_START);
  const endIdx = current.indexOf(WEB_MARKER_END);
  if (startIdx === -1 || endIdx === -1) return current; // markers not present, leave unchanged
  const next = renderWebInlineCss();
  return current.slice(0, startIdx) + WEB_MARKER_START + "\n" + next + "\n" + current.slice(endIdx);
}

export const TOKEN_ARTIFACTS = [
  { path: join(ROOT, "design", "tokens.css"), render: renderTokensCss },
  { path: join(ROOT, "themes", "nazar.json"), render: renderThemeJson },
  { path: WEB_INDEX, render: renderWebIndex },
];

function main(): void {
  const check = process.argv.includes("--check");
  let drift = false;
  for (const { path, render } of TOKEN_ARTIFACTS) {
    const next = render();
    const current = (() => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return "";
      }
    })();
    if (current === next) continue;
    if (check) {
      drift = true;
      console.error(`drift: ${path}`);
      continue;
    }
    writeFileSync(path, next);
    console.log(`wrote ${path}`);
  }
  if (check) {
    if (drift) {
      console.error("Token artifacts are stale. Run: npm run build:tokens");
      process.exit(1);
    }
    console.log("tokens in sync");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
