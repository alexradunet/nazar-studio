// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { MasterLock, normalizeId } from "./lock.ts";

describe("normalizeId", () => {
  test("strips JID host, device part, and non-digits", () => {
    expect(normalizeId("40712345678@chat.example")).toBe("40712345678");
    expect(normalizeId("40712345678@legacy.example")).toBe("40712345678");
    expect(normalizeId("40712345678:12@chat.example")).toBe("40712345678");
    expect(normalizeId("+40 712 345 678")).toBe("40712345678");
    expect(normalizeId(undefined)).toBe("");
    expect(normalizeId(null)).toBe("");
    expect(normalizeId("")).toBe("");
  });
});

describe("MasterLock", () => {
  test("authorizes only the configured owner, across formats", () => {
    const lock = new MasterLock("+40712345678");
    expect(lock.isConfigured()).toBe(true);
    expect(lock.ownerId).toBe("40712345678");
    expect(lock.isAuthorized("40712345678@chat.example")).toBe(true);
    expect(lock.isAuthorized("40712345678:3@chat.example")).toBe(true);
    expect(lock.isAuthorized("40799999999@chat.example")).toBe(false);
    expect(lock.isAuthorized("120363012345@group.example")).toBe(false);
  });

  test("authorizes configured aliases", () => {
    const lock = new MasterLock("+40712345678", ["207666014081169"]);
    expect(lock.isAuthorized("207666014081169@lid")).toBe(true);
    expect(lock.isAuthorized("40799999999@chat.example")).toBe(false);
  });

  test("an unconfigured lock authorizes nobody", () => {
    const lock = new MasterLock(undefined);
    expect(lock.isConfigured()).toBe(false);
    expect(lock.isAuthorized("40712345678@chat.example")).toBe(false);
  });
});
