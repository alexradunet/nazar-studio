// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { formatRuntimeSessionState } from "./session-status.ts";

test("formats master and branch runtime state", () => {
  expect(formatRuntimeSessionState({ conversation: "master", streaming: false })).toBe("master · ready");
  expect(formatRuntimeSessionState({ conversation: "branch", branchTitle: "taxes", streaming: true })).toBe("branch: taxes · streaming…");
});
