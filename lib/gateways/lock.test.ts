// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { MasterLock, normalizeId } from "./lock.ts";

describe("normalizeId", () => {
  test("strips JID host, device part, and non-digits", () => {
    expect(normalizeId("40712345678@s.whatsapp.net")).toBe("40712345678");
    expect(normalizeId("40712345678@c.us")).toBe("40712345678");
    expect(normalizeId("40712345678:12@s.whatsapp.net")).toBe("40712345678");
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
    expect(lock.isAuthorized("40712345678@s.whatsapp.net")).toBe(true);
    expect(lock.isAuthorized("40712345678:3@s.whatsapp.net")).toBe(true);
    expect(lock.isAuthorized("40799999999@s.whatsapp.net")).toBe(false);
    // Group JIDs reduce to the group id's digits and never match a phone owner.
    expect(lock.isAuthorized("120363012345@g.us")).toBe(false);
  });

  test("an unconfigured lock authorizes nobody", () => {
    const lock = new MasterLock(undefined);
    expect(lock.isConfigured()).toBe(false);
    expect(lock.isAuthorized("40712345678@s.whatsapp.net")).toBe(false);
  });
});
