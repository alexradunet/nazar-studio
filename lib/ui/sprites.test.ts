// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import { avatarMode, roleNameplate, spriteFor } from "./sprites.ts";

const originalAvatarMode = process.env.NAZAR_AVATAR_MODE;
const originalUserName = process.env.NAZAR_USER_NAME;

afterEach(() => {
  if (originalAvatarMode === undefined) delete process.env.NAZAR_AVATAR_MODE;
  else process.env.NAZAR_AVATAR_MODE = originalAvatarMode;

  if (originalUserName === undefined) delete process.env.NAZAR_USER_NAME;
  else process.env.NAZAR_USER_NAME = originalUserName;
});

test("avatar mode is always avatar; legacy text values are ignored", () => {
  delete process.env.NAZAR_AVATAR_MODE;
  expect(avatarMode()).toBe("avatar");

  process.env.NAZAR_AVATAR_MODE = "badge";
  expect(avatarMode()).toBe("avatar");

  process.env.NAZAR_AVATAR_MODE = "text";
  expect(avatarMode()).toBe("avatar");
});

test("visible panel titles are simple names without role prefixes", () => {
  process.env.NAZAR_USER_NAME = "alex";
  expect(roleNameplate("user")).toBe("alex");
  expect(roleNameplate("nazar", "thinking")).toBe("Nazar");
});

test("sprite mnemonics remain role/activity scoped", () => {
  expect(spriteFor("user")).toBe("@");
  expect(spriteFor("nazar", "thinking")).toBe("?");
});
