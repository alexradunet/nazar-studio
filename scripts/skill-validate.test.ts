// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moduleDir } from "../lib/paths.ts";

const SV = join(moduleDir(import.meta.url), "skill-validate.ts");

/** Run the validator via the current Node (Node 23.4+ runs TypeScript natively). */
function runValidator(target: string): number {
  try {
    execFileSync(process.execPath, [SV, target], { stdio: "pipe" });
    return 0;
  } catch (e) {
    const status = (e as { status?: number }).status;
    return typeof status === "number" ? status : 1;
  }
}

function check(src: string): number {
  const f = join(mkdtempSync(join(tmpdir(), "sk-")), "skill.ts");
  writeFileSync(f, src);
  return runValidator(f);
}

const cap = "// @capability: reads=[vault]\n";

test("rejects eval()", () => { expect(check(`// @capability: x\nexport default () => eval("1")`)).toBe(1); });
test("rejects child_process", () => { expect(check(`// @capability: x\nimport cp from "node:child_process"; export default () => cp`)).toBe(1); });
test("rejects subprocess (Bun.spawn)", () => { expect(check(`// @capability: x\nexport default () => Bun.spawn(["ls"])`)).toBe(1); });
test("rejects raw process.env (secrets)", () => { expect(check(`// @capability: x\nexport default () => process.env.SECRET`)).toBe(1); });
test("rejects missing @capability header", () => { expect(check(`export default () => 42`)).toBe(1); });
test("accepts a clean, declared skill", () => { expect(check(`${cap}export default () => ({ ok: true })`)).toBe(0); });
test("missing file -> exit 2", () => { expect(runValidator("/no/such/file.ts")).toBe(2); });
