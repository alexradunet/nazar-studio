// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import {
  appendBranchMessage,
  appendMasterMessage,
  createBranch,
  loadConversation,
  loadMasterMessages,
  mergeBranchSummary,
} from "./conversation-store.ts";

let temp: string | undefined;

afterEach(() => {
  if (temp) rmSync(temp, { recursive: true, force: true });
  temp = undefined;
  delete process.env.BALAUR_DATA_DIR;
});

function useTempDataDir(): void {
  temp = mkdtempSync(join(tmpdir(), "balaur-conversation-"));
  process.env.BALAUR_DATA_DIR = temp;
}

test("master conversation appends and loads messages", () => {
  useTempDataDir();
  appendMasterMessage({ role: "user", content: "hello", timestamp: 1 });

  expect(loadMasterMessages()).toEqual([{ role: "user", content: "hello", timestamp: 1 }]);
});

test("branch can be compacted and merged into master", () => {
  useTempDataDir();
  const branch = createBranch("plan week");
  appendBranchMessage(branch, { role: "user", content: "gym monday", timestamp: 1 });

  expect(existsSync(branch.path)).toBe(true);
  expect(loadConversation(branch.path)).toHaveLength(1);

  const merged = mergeBranchSummary({ branch, summary: "User decided to go to gym Monday." });

  expect(merged.role).toBe("user");
  const [message] = loadMasterMessages();
  expect(message?.role).toBe("user");
  if (message?.role !== "user") throw new Error("expected merged user summary");
  expect(message.content).toContain("User decided to go to gym Monday.");
});
