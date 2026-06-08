// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { visibleWidth } from "./ansi.ts";
import { CHAFA_CACHE_PATH, chafaCacheKey, type ChafaCache } from "./chafa-render.ts";

const CANONICAL_ROWS = 13;
const CANONICAL_COLUMNS = 27;

test("Chafa avatar cache covers the canonical 27x13 identity frames", () => {
  const cache = JSON.parse(readFileSync(CHAFA_CACHE_PATH, "utf8")) as ChafaCache;
  const required = [
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

  for (const sheet of required) {
    const lines = cache[chafaCacheKey(sheet, 0, CANONICAL_ROWS)];
    expect(lines, sheet).toBeDefined();
    expect(lines).toHaveLength(CANONICAL_ROWS);
    expect(lines!.map((line) => visibleWidth(line))).toEqual(Array(CANONICAL_ROWS).fill(CANONICAL_COLUMNS));
    expect(lines!.join("\n")).toContain("\x1b[38;2;");
    expect(lines!.join("\n")).not.toContain("\x1b_G");
  }
});
