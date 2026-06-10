// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

type DotEnv = Record<string, string>;

const DEFAULT_DOT_ENV = ".env";

function unescapeDoubleQuotedValue(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

function parseDotEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;

  const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const equalsAt = withoutExport.indexOf("=");
  if (equalsAt <= 0) return undefined;

  const key = withoutExport.slice(0, equalsAt).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;

  let value = withoutExport.slice(equalsAt + 1).trim();
  if (!value) return [key, ""];

  if (!value.startsWith("\"") && !value.startsWith("'")) {
    const commentAt = value.indexOf("#");
    if (commentAt >= 0) value = value.slice(0, commentAt).trimEnd();
  }

  if (!value) return [key, ""];
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return [key, unescapeDoubleQuotedValue(value.slice(1, -1))];
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return [key, value.slice(1, -1)];
  }

  return [key, value];
}

function parseDotEnvText(content: string): DotEnv {
  const env: DotEnv = {};
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    env[key] = value;
  }
  return env;
}

function runtimeEnvFileCandidates(): string[] {
  const rootFallback = dirname(import.meta.dir);
  const configured = Bun.env.BALAUR_ENV_FILE?.trim();
  const cwdPath = join(process.cwd(), DEFAULT_DOT_ENV);
  return [
    ...(configured ? [configured] : []),
    cwdPath,
    join(rootFallback, DEFAULT_DOT_ENV),
  ];
}

function loadDotEnvIfPresent(): void {
  const seen = new Set<string>();
  for (const file of runtimeEnvFileCandidates()) {
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) continue;

    const parsed = parseDotEnvText(readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (Bun.env[key] === undefined) Bun.env[key] = value;
    }
    return;
  }
}

/** Current process environment through Bun's native runtime surface, with optional .env loading. */
export function runtimeEnv(): NodeJS.ProcessEnv {
  loadDotEnvIfPresent();
  return Bun.env;
}

export { parseDotEnvText };
