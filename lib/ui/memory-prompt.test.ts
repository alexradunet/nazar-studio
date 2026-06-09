// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderMemoryPromptLines } from "./memory-prompt.ts";

function plain(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

test("memory prompt renders as a bounded Nazar panel with the proposed page", () => {
  const width = 72;
  const lines = renderMemoryPromptLines({
    question: "Remember this?",
    proposal: {
      title: "Coffee order",
      content: "oat flat white, no sugar",
      type: "notes",
      tags: ["preference"],
    },
    options: [{ label: "Save" }, { label: "Edit…" }, { label: "Skip" }],
  }, width, 1);
  const text = plain(lines.join("\n"));

  expect(text).toContain("Nazar · memory");
  expect(text).toContain("Page [[Coffee order]]");
  expect(text).toContain("Folder notes");
  expect(text).toContain("oat flat white, no sugar");
  expect(text).toContain("› Edit…");
  expect(text).toContain("↑↓ choose · Enter confirm · Esc skip");
  for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
});

test("memory prompt caps long content previews", () => {
  const lines = renderMemoryPromptLines({
    question: "Remember this?",
    proposal: { title: "Long", content: Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n") },
    options: [{ label: "Save" }, { label: "Skip" }],
  }, 64, 0);
  const text = plain(lines.join("\n"));

  expect(text).toContain("line 0");
  expect(text).toContain("…");
  for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(64);
});
