// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { markdownToWhatsApp, toWhatsAppChunks } from "./format.ts";

describe("markdownToWhatsApp", () => {
  test("headings and bold become WhatsApp bold", () => {
    expect(markdownToWhatsApp("# Title")).toBe("*Title*");
    expect(markdownToWhatsApp("**strong**")).toBe("*strong*");
    expect(markdownToWhatsApp("__strong__")).toBe("*strong*");
  });

  test("links flatten to text (url)", () => {
    expect(markdownToWhatsApp("see [docs](https://example.com)")).toBe("see docs (https://example.com)");
  });

  test("leaves plain text and single emphasis alone", () => {
    expect(markdownToWhatsApp("plain *one* two")).toBe("plain *one* two");
  });
});

describe("toWhatsAppChunks", () => {
  test("converts then returns a single chunk for short text", () => {
    expect(toWhatsAppChunks("**hi**")).toEqual(["*hi*"]);
  });

  test("splits long answers into multiple messages", () => {
    const chunks = toWhatsAppChunks("word ".repeat(2000));
    expect(chunks.length).toBeGreaterThan(1);
  });
});
