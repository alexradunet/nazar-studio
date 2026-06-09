// SPDX-License-Identifier: AGPL-3.0-or-later
// Pi-coupling guard. lib/ui/avatars.ts monkeypatches private render methods on
// Pi's built-in message/tool components. If a Pi upgrade renames or drops any of
// them, this test fails loudly at CI — instead of the TUI silently breaking at
// runtime. Keep in sync with patchRpgAvatars() in lib/ui/avatars.ts.
import { expect, test } from "vitest";
import {
  AssistantMessageComponent,
  BranchSummaryMessageComponent,
  CompactionSummaryMessageComponent,
  SkillInvocationMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";

test("Pi exposes the role/tool component render surface Nazar patches", () => {
  for (const Component of [UserMessageComponent, AssistantMessageComponent, ToolExecutionComponent]) {
    expect(typeof Component?.prototype?.render).toBe("function");
    expect(typeof Component?.prototype?.invalidate).toBe("function");
  }
  // Only the assistant component's streaming content is intercepted.
  expect(typeof AssistantMessageComponent.prototype.updateContent).toBe("function");
});

test("Pi exposes the custom-message components Nazar decorates with chapter dividers", () => {
  for (const Component of [
    CompactionSummaryMessageComponent,
    BranchSummaryMessageComponent,
    SkillInvocationMessageComponent,
  ]) {
    expect(typeof Component?.prototype?.render).toBe("function");
  }
});
