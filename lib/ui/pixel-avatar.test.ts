// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, expect, test } from "vitest";
import { getCellDimensions, resetCapabilitiesCache, setCapabilities, setCellDimensions } from "@earendil-works/pi-tui";
import { visibleWidth } from "./ansi.ts";
import { setGraphicsQuality } from "./graphics-state.ts";
import {
  avatarPixelAspect,
  renderAnsiAvatarFrame,
  renderRoleAvatar,
  renderThinkingAvatarFrame,
  renderToolAvatar,
  renderToolPixelAvatar,
  renderUserTypingAvatarFrame,
} from "./pixel-avatar.ts";

function plain(lines: string[]): string[] {
  return lines.map((line) => line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\x1b_G.*?\x1b\\/g, ""));
}

function expectTruecolor(text: string): void {
  expect(text).toMatch(/\x1b\[[0-9;]*[34]8;2;/);
}

const originalAvatarRows = process.env.NAZAR_AVATAR_ROWS;
const originalAvatarAspect = process.env.NAZAR_AVATAR_ASPECT;
const originalCellWidth = process.env.NAZAR_CELL_WIDTH_PX;
const originalCellHeight = process.env.NAZAR_CELL_HEIGHT_PX;
const originalToolRows = process.env.NAZAR_TOOL_ROWS;
const originalAnsiDetail = process.env.NAZAR_ANSI_DETAIL;
const originalGraphicsProtocol = process.env.NAZAR_GRAPHICS_PROTOCOL;
const originalTerm = process.env.TERM;
const originalTmux = process.env.TMUX;
const originalZellij = process.env.ZELLIJ;
const originalSty = process.env.STY;
const originalCellDimensions = getCellDimensions();

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  delete process.env.NAZAR_AVATAR_ROWS;
  delete process.env.NAZAR_AVATAR_ASPECT;
  delete process.env.NAZAR_CELL_WIDTH_PX;
  delete process.env.NAZAR_CELL_HEIGHT_PX;
  delete process.env.NAZAR_TOOL_ROWS;
  delete process.env.NAZAR_ANSI_DETAIL;
  delete process.env.NAZAR_GRAPHICS_PROTOCOL;
  process.env.TERM = "xterm-256color";
  delete process.env.TMUX;
  delete process.env.ZELLIJ;
  delete process.env.STY;
  setCellDimensions({ widthPx: 9, heightPx: 18 });
  setGraphicsQuality(undefined);
  setCapabilities({ images: null, trueColor: true, hyperlinks: false });
});

afterEach(() => {
  resetCapabilitiesCache();
  setCellDimensions(originalCellDimensions);
  restoreEnv("NAZAR_AVATAR_ROWS", originalAvatarRows);
  restoreEnv("NAZAR_AVATAR_ASPECT", originalAvatarAspect);
  restoreEnv("NAZAR_CELL_WIDTH_PX", originalCellWidth);
  restoreEnv("NAZAR_CELL_HEIGHT_PX", originalCellHeight);
  restoreEnv("NAZAR_TOOL_ROWS", originalToolRows);
  restoreEnv("NAZAR_ANSI_DETAIL", originalAnsiDetail);
  restoreEnv("NAZAR_GRAPHICS_PROTOCOL", originalGraphicsProtocol);
  restoreEnv("TERM", originalTerm);
  restoreEnv("TMUX", originalTmux);
  restoreEnv("ZELLIJ", originalZellij);
  restoreEnv("STY", originalSty);
  setGraphicsQuality(undefined);
});

test("role avatars render generated ANSI art", () => {
  process.env.NAZAR_AVATAR_ROWS = "9";
  const nazar = renderAnsiAvatarFrame("nazar");
  expect(nazar).toHaveLength(9);
  expect(nazar.map((line) => visibleWidth(line))).toEqual([19, 19, 19, 19, 19, 19, 19, 19, 19]);
  expectTruecolor(nazar.join("\n"));
  expectTruecolor(renderAnsiAvatarFrame("user").join("\n"));
});

test("ANSI animations expose stable wrapping frames", () => {
  expect(plain(renderThinkingAvatarFrame(9))).toEqual(plain(renderThinkingAvatarFrame(0)));
  expect(plain(renderUserTypingAvatarFrame(9))).toEqual(plain(renderUserTypingAvatarFrame(0)));
  expect(new Set(Array.from({ length: 4 }, (_, index) => renderThinkingAvatarFrame(index).join("\n"))).size).toBeGreaterThan(1);
});

test("avatar renderer derives cell width from terminal aspect ratio for near-square sprite framing", () => {
  process.env.NAZAR_AVATAR_ROWS = "9";
  setCellDimensions({ widthPx: 9, heightPx: 18 });
  let avatar = renderRoleAvatar("nazar")!;
  expect(avatar.backend).toBe("ansi");
  expect(avatar.width).toBe(19);
  expect(avatar.height).toBe(9);
  expect(avatarPixelAspect(avatar.width + 2, avatar.height + 2)).toBeGreaterThan(0.9);
  expect(avatarPixelAspect(avatar.width + 2, avatar.height + 2)).toBeLessThan(1.1);

  setCellDimensions({ widthPx: 8, heightPx: 19 });
  avatar = renderRoleAvatar("nazar")!;
  expect(avatar.width).toBe(23);
  expect(avatar.height).toBe(9);
  expect(avatarPixelAspect(avatar.width + 2, avatar.height + 2)).toBeGreaterThan(0.9);
  expect(avatarPixelAspect(avatar.width + 2, avatar.height + 2)).toBeLessThan(1.1);
});

test("avatar renderer can calibrate cell dimensions for the live terminal font", () => {
  process.env.NAZAR_AVATAR_ROWS = "9";
  process.env.NAZAR_CELL_WIDTH_PX = "9";
  process.env.NAZAR_CELL_HEIGHT_PX = "17";
  const avatar = renderRoleAvatar("nazar")!;
  expect(avatar.width).toBe(18);
  expect(avatar.height).toBe(9);
  expect(getCellDimensions()).toEqual({ widthPx: 9, heightPx: 17 });
  expect(avatarPixelAspect(avatar.width + 2, avatar.height + 2)).toBeCloseTo(1, 1);
});

test("renderer always uses ANSI character art", () => {
  setCapabilities({ images: null, trueColor: true, hyperlinks: true });
  const avatar = renderRoleAvatar("nazar")!;
  expect(avatar.backend).toBe("ansi");
  expect(avatar.lines[0]?.text).not.toContain("\u{10eeee}");
  expect(avatar.lines[0]?.text).not.toContain("\x1b_G");
});

test("default user avatar renders the soul sheet as ANSI", () => {
  const avatar = renderRoleAvatar("user")!;
  expect(avatar.backend).toBe("ansi");
  expectTruecolor(avatar.lines.map((l) => l.text).join("\n"));
});

test("graphics quality never changes the portable backend", () => {
  for (const quality of ["basic", "hd"] as const) {
    setGraphicsQuality(quality);
    setCapabilities({ images: null, trueColor: true, hyperlinks: true });
    const avatar = renderRoleAvatar("nazar")!;
    expect(avatar.backend).toBe("ansi");
    expect(avatar.lines[0]?.text).not.toContain("\x1b_G");
  }
});

test("explicit ANSI option keeps portable output", () => {
  setCapabilities({ images: null, trueColor: true, hyperlinks: true });
  const avatar = renderRoleAvatar("nazar", { backend: "ansi" })!;
  expect(avatar.backend).toBe("ansi");
  expect(avatar.lines[0]?.text).not.toContain("\x1b_G");
});

test("default avatar output uses the canonical 27x13 Chafa cache", () => {
  process.env.NAZAR_ANSI_DETAIL = "full-block";
  const frame = renderAnsiAvatarFrame("nazar");
  expect(frame).toHaveLength(13);
  expect(frame.map((line) => visibleWidth(line))).toEqual(Array(13).fill(27));
  expectTruecolor(frame.join("\n"));
  expect(frame.join("\n")).not.toContain("\x1b_G");
});

test("tool avatars are full-size generated ANSI icons matching role-avatar dimensions", () => {
  // Tool avatars render at the same size as role (user/nazar) avatars so the
  // avatar column is symmetric across all panel kinds — Nazar / Cico / Bash
  // / Read / etc all share one consistent left/right gutter width.
  const read = renderToolAvatar("read", "pending", 0);
  const ansiRows = read.length;
  expect(ansiRows).toBeGreaterThanOrEqual(5);
  const widths = read.map((line) => visibleWidth(line));
  expect(new Set(widths).size).toBe(1); // all rows the same width
  expectTruecolor(read.join("\n"));

  const bash = renderToolAvatar("bash", "pending", 0, '{"command":"git status"}');
  expect(bash).toHaveLength(ansiRows);
  expect(bash.map((line) => visibleWidth(line))).toEqual(widths);
  expectTruecolor(bash.join("\n"));
  // Visual distinction is preserved through the generated coloured output.
  expect(bash.join("\n")).not.toEqual(read.join("\n"));

  const ok = renderToolPixelAvatar("memory_search", "ok", 0, "", { backend: "ansi" });
  const err = renderToolPixelAvatar("memory_search", "error", 0, "", { backend: "ansi" });
  expect(ok?.backend).toBe("ansi");
  expect(err?.backend).toBe("ansi");
  expect(ok?.lines.map((line) => line.text).join("\n")).not.toContain("\x1b_G");
  expect(err?.lines.map((line) => line.text).join("\n")).not.toContain("\x1b_G");
});

test("tool avatars animate only while running", () => {
  const done0 = renderToolPixelAvatar("bash", "ok", 0, "", { backend: "ansi" });
  const done5 = renderToolPixelAvatar("bash", "ok", 5, "", { backend: "ansi" });
  expect(done0?.lines[1]?.text).toBe(done5?.lines[1]?.text);

  const running0 = renderToolPixelAvatar("bash", "running", 0, "", { backend: "ansi" });
  const running5 = renderToolPixelAvatar("bash", "running", 5, "", { backend: "ansi" });
  expect(running0?.lines[1]?.text).not.toBe(running5?.lines[1]?.text);
});
