// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { extractText, toMillis } from "./text.ts";

describe("extractText", () => {
  test("reads conversation and extended text (trimmed)", () => {
    expect(extractText({ conversation: " hi " })).toBe("hi");
    expect(extractText({ extendedTextMessage: { text: "hello" } })).toBe("hello");
  });

  test("reads captions and nested ephemeral / view-once", () => {
    expect(extractText({ imageMessage: { caption: "cap" } })).toBe("cap");
    expect(extractText({ ephemeralMessage: { message: { conversation: "eph" } } })).toBe("eph");
    expect(extractText({ viewOnceMessageV2: { message: { extendedTextMessage: { text: "v2" } } } })).toBe("v2");
  });

  test("returns empty for non-text or missing content", () => {
    expect(extractText(undefined)).toBe("");
    expect(extractText({})).toBe("");
    expect(extractText({ imageMessage: {} })).toBe("");
  });
});

describe("toMillis", () => {
  test("seconds → ms, passthrough ms, Long-like, fallback", () => {
    expect(toMillis(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toMillis({ toNumber: () => 1700 })).toBe(1_700_000);
    expect(typeof toMillis(undefined)).toBe("number");
  });
});
