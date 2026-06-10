// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { getVaultEntry, reindexVault, searchVault, vaultPath, writeVaultEntry } from "./vault.ts";

let temp: string | undefined;

afterEach(() => {
  if (temp) rmSync(temp, { recursive: true, force: true });
  temp = undefined;
  delete process.env.BALAUR_DATA_DIR;
});

function useTempDataDir(): void {
  temp = mkdtempSync(join(tmpdir(), "balaur-vault-"));
  process.env.BALAUR_DATA_DIR = temp;
}

test("writes Johnny Decimal vault entries and searches them", () => {
  useTempDataDir();
  const saved = writeVaultEntry({
    title: "Balaur vault decision",
    content: "Use Johnny Decimal for notes, AI notes, skills, and durable facts.",
    jd: "40.12",
    kind: "memory",
    tags: ["balaur"],
  });

  expect(saved.jd).toBe("40.12");
  expect(saved.path).toContain(join("vault", "40-49", "40.12"));
  expect(searchVault("Johnny Decimal", 3)[0]?.title).toBe("Balaur vault decision");
  expect(getVaultEntry("Balaur vault decision")).toContain("kind: memory");
});

test("reindexes vault markdown as source of truth", () => {
  useTempDataDir();
  writeVaultEntry({ title: "Reindex me", content: "needle", jd: "30.01" });

  expect(reindexVault()).toBe(1);
  expect(vaultPath()).toContain("vault");
  expect(searchVault("needle", 1)).toHaveLength(1);
});
