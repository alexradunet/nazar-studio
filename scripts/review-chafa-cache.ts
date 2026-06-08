// SPDX-License-Identifier: AGPL-3.0-or-later
// Print cached Chafa avatars at the real terminal review size.
import { readFileSync } from "node:fs";
import { CHAFA_CACHE_PATH, chafaCacheKey, type ChafaCache } from "../lib/ui/chafa-render.ts";
import { visibleWidth } from "../lib/ui/ansi.ts";

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

const args = process.argv.slice(2);
const maybeRows = Number(args[0]);
const rows = Number.isFinite(maybeRows) && maybeRows > 0 ? maybeRows : 13;
const rest = Number.isFinite(maybeRows) && maybeRows > 0 ? args.slice(1) : args;
const allFrames = rest.includes("--all-frames");
const sheets = rest.filter((arg) => !arg.startsWith("--"));
const reviewSheets = sheets.length > 0 ? sheets : [
  "nazar",
  "soul",
  "nazar-expr",
  "eye-read",
  "eye-write",
  "eye-edit",
  "eye-bash",
  "eye-search",
  "eye-memory",
  "eye-skill",
  "eye-health",
  "eye-terminal",
];

const cache = JSON.parse(readFileSync(CHAFA_CACHE_PATH, "utf8")) as ChafaCache;
const frames = allFrames ? Array.from({ length: 9 }, (_, index) => index) : [0];

console.log(`Nazar Chafa avatar review — ${rows * 2 + 1}×${rows} cells`);
console.log(`cache: ${CHAFA_CACHE_PATH}`);
console.log("Tip: pass --all-frames to inspect animation/expression frames.\n");

let missing = 0;
for (const sheet of reviewSheets) {
  for (const frame of frames) {
    const key = chafaCacheKey(sheet, frame, rows);
    const lines = cache[key];
    if (!lines) {
      missing++;
      console.log(`## ${key} — MISSING\n`);
      continue;
    }

    const widths = lines.map((line) => visibleWidth(line));
    console.log(`## ${key} — ${Math.max(...widths)}×${lines.length}`);
    for (const line of lines) console.log(line);
    console.log("\x1b[0m");
  }
}

if (missing > 0) process.exitCode = 1;
