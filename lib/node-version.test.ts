// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { hasStableNodeSqlite, nodeSqliteUpgradePrompt, parseNodeVersion } from "./node-version.ts";

test("parseNodeVersion accepts process-style and plain versions", () => {
  expect(parseNodeVersion("v24.1.2")).toEqual({ major: 24, minor: 1, patch: 2 });
  expect(parseNodeVersion("23.4.0")).toEqual({ major: 23, minor: 4, patch: 0 });
});

test("hasStableNodeSqlite enforces Node 23.4 minimum", () => {
  expect(hasStableNodeSqlite("v22.22.3")).toBe(false);
  expect(hasStableNodeSqlite("v23.3.9")).toBe(false);
  expect(hasStableNodeSqlite("v23.4.0")).toBe(true);
  expect(hasStableNodeSqlite("v24.0.0")).toBe(true);
});

test("nodeSqliteUpgradePrompt asks for Node 24 LTS below minimum", () => {
  expect(nodeSqliteUpgradePrompt("v22.22.3")).toContain("Node 24 LTS");
  expect(nodeSqliteUpgradePrompt("v24.0.0")).toBeUndefined();
});
