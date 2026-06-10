// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { writeVaultEntry } from "../vault.ts";
import { discoverSkills, expandSkillCommand } from "./skills.ts";

let temp: string | undefined;

afterEach(() => {
  if (temp) rmSync(temp, { recursive: true, force: true });
  temp = undefined;
  delete process.env.BALAUR_DATA_DIR;
});

function useTempDataDir(): void {
  temp = mkdtempSync(join(tmpdir(), "balaur-skills-"));
  process.env.BALAUR_DATA_DIR = temp;
}

test("discovers skills stored as vault entries", () => {
  useTempDataDir();
  writeVaultEntry({
    title: "vault-skill",
    content: "Always answer in two bullets.",
    jd: "50.10",
    kind: "skill",
    whenToUse: "Use for terse answers.",
  });

  expect(discoverSkills().some((skill) => skill.name === "vault-skill")).toBe(true);
  expect(expandSkillCommand("/skill:vault-skill summarize")).toContain("Always answer in two bullets.");
});
