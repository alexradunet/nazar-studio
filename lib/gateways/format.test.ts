// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { chunkText, stripAnsi } from "./format.ts";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

describe("stripAnsi", () => {
  test("removes CSI colour codes and preserves text (incl. capitals)", () => {
    const colored = `${ESC}[31mRED Alert${ESC}[0m DONE`;
    expect(stripAnsi(colored)).toBe("RED Alert DONE");
  });

  test("removes OSC hyperlinks", () => {
    const link = `${ESC}]8;;https://example.com${BEL}label${ESC}]8;;${BEL}`;
    expect(stripAnsi(link)).toBe("label");
  });

  test("leaves plain text untouched", () => {
    expect(stripAnsi("Hello, World! ABC xyz")).toBe("Hello, World! ABC xyz");
  });
});

describe("chunkText", () => {
  test("returns a single chunk when within the limit", () => {
    expect(chunkText("short", 100)).toEqual(["short"]);
  });

  test("splits long text into bounded chunks on boundaries", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const chunks = chunkText(text, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(40);
    expect(chunks.join("\n").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
  });

  test("empty input returns an empty array", () => {
    expect(chunkText("", 10)).toEqual([]);
  });
});
