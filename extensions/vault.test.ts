// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import vault from "./vault.ts";

function fakePi() {
  const tools: any[] = [];
  return { pi: { registerTool: (t: any) => tools.push(t) } as any, tools };
}

test("vault extension registers the journal/diet/sport append tools", () => {
  const { pi, tools } = fakePi();
  vault(pi);
  expect(tools.map((t) => t.name).sort()).toEqual(["diet_add", "journal_add", "sport_add"]);
  for (const t of tools) {
    expect(typeof t.execute).toBe("function");
    expect(t.parameters).toBeDefined();
  }
});
