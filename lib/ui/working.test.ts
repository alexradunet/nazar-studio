// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import { resetCapabilitiesCache, setCapabilities } from "@earendil-works/pi-tui";
import { extractThinkingPreview, renderThinkingPanel, ThinkingWidget, workingIndicator } from "./working.ts";

const originalAvatarMode = process.env.NAZAR_AVATAR_MODE;
const originalTmux = process.env.TMUX;
const originalZellij = process.env.ZELLIJ;
const originalSty = process.env.STY;

function plain(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function expectLeftPadding(text: string): void {
  const firstLine = plain(text).split("\n")[0] ?? "";
  expect(firstLine.startsWith(" ")).toBe(true);
}

afterEach(() => {
  if (originalAvatarMode === undefined) delete process.env.NAZAR_AVATAR_MODE;
  else process.env.NAZAR_AVATAR_MODE = originalAvatarMode;
  restoreEnv("TMUX", originalTmux);
  restoreEnv("ZELLIJ", originalZellij);
  restoreEnv("STY", originalSty);
  resetCapabilitiesCache();
});

test("thinking widget renders ANSI avatar even when image protocol is available", () => {
  delete process.env.TMUX;
  delete process.env.ZELLIJ;
  delete process.env.STY;
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const widget = new ThinkingWidget({ requestRender() {} });
  try {
    const lines = widget.render(80);
    const frame = lines.join("\n");
    expect(frame).not.toContain("\x1b_G");
    expect(frame).toContain("\x1b[48;2;");
    expect(plain(frame)).toContain("B A L A U R");
    expect(plain(frame)).not.toContain("[ Nazar ]");
    expectLeftPadding(frame);
    expect(lines.at(-1)).toBe("");
  } finally {
    widget.dispose();
  }
});

test("thinking panel renders ANSI avatar when image rendering is unsupported", () => {
  setCapabilities({ images: null, trueColor: true, hyperlinks: false });
  const rawFrame = renderThinkingPanel(0);
  const frame = plain(rawFrame);
  expect(frame).toContain("B A L A U R");
  expect(frame).not.toContain("[ Nazar ]");
  expect(rawFrame).toContain("\x1b[48;2;");
  expectLeftPadding(rawFrame);
});

test("thinking panel stays ANSI for Loader/Text fallback", () => {
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const rawFrame = renderThinkingPanel(0, { loaderSafe: true });
  const frame = plain(rawFrame);
  expect(frame).not.toContain("[ Nazar ]");
  expect(rawFrame).toContain("\x1b[48;2;");
  expectLeftPadding(rawFrame);
});

test("legacy badge/both modes are ignored; the avatar remains on", () => {
  for (const mode of ["badge", "both"]) {
    process.env.NAZAR_AVATAR_MODE = mode;
      const frame = plain(renderThinkingPanel(0));
    expect(frame).toContain("B A L A U R");
    expect(frame).not.toContain("[ Nazar ]");
  }
});

test("thinking panel shows a live preview in the text pane", () => {
  const frame = plain(renderThinkingPanel(0, { preview: "Inspecting the stream and planning the smallest UI change." }));
  expect(frame).toContain("Inspecting the stream");
  expect(frame).toContain("smallest UI");
  expect(frame).toContain("change.");
});

test("thinking preview extraction keeps only the tail", () => {
  const preview = extractThinkingPreview({
    content: [{ type: "thinking", thinking: `${"older reasoning ".repeat(100)} latest useful thought` }],
  });
  expect(preview.startsWith("…")).toBe(true);
  expect(preview).toContain("latest useful thought");
  expect(preview.length).toBeLessThanOrEqual(901);
});

test("thinking preview extraction never exposes redacted payloads", () => {
  const preview = extractThinkingPreview({
    content: [{ type: "thinking", redacted: true, thinkingSignature: "opaque-provider-token" }],
  });
  expect(preview).toBe("Thinking redacted by provider.");
});

test("built-in working indicator remains Loader/Text-safe", () => {
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const frame = workingIndicator().frames[0] ?? "";
  expect(frame).not.toContain("\x1b_G");
  expect(frame).toContain("\x1b[48;2;");
});
