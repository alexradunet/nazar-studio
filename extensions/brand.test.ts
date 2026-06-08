// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import brand from "./brand.ts";
import { __testing } from "../lib/ui/avatars.ts";

const originalRecentLimit = process.env.NAZAR_AVATAR_RECENT_LIMIT;

afterEach(() => {
  if (originalRecentLimit === undefined) delete process.env.NAZAR_AVATAR_RECENT_LIMIT;
  else process.env.NAZAR_AVATAR_RECENT_LIMIT = originalRecentLimit;
  __testing.seedAvatarPanelOrderFromSessionEntries([]);
});

test("brand seeds resumed session avatar order before the first UI render", async () => {
  process.env.NAZAR_AVATAR_RECENT_LIMIT = "1";
  __testing.seedAvatarPanelOrderFromSessionEntries([]);

  const handlers: Record<string, (event: unknown, ctx: unknown) => Promise<void> | void> = {};
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void> | void) {
      handlers[name] = handler;
    },
    registerCommand() {},
  } as any;

  brand(pi);

  const oldMessage = { role: "assistant", content: "old" };
  const recentMessage = { role: "assistant", content: "recent" };
  await handlers.session_start?.({ reason: "resume" }, {
    hasUI: false,
    sessionManager: {
      getBranch: () => [
        { type: "message", message: oldMessage },
        { type: "message", message: recentMessage },
      ],
    },
  });

  const oldKey = __testing.messagePanelKey("assistant", oldMessage)!;
  const recentKey = __testing.messagePanelKey("assistant", recentMessage)!;

  expect(__testing.shouldUseRichAvatarKey(oldKey)).toBe(false);
  expect(__testing.shouldUseRichAvatarKey(recentKey)).toBe(true);
});
