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

const originalAvatarRows = process.env.NAZAR_AVATAR_ROWS;
const originalAvatarAspect = process.env.NAZAR_AVATAR_ASPECT;
const originalCellWidth = process.env.NAZAR_CELL_WIDTH_PX;
const originalCellHeight = process.env.NAZAR_CELL_HEIGHT_PX;
const originalToolRows = process.env.NAZAR_TOOL_ROWS;
const originalAnsiDetail = process.env.NAZAR_ANSI_DETAIL;
const originalGraphicsProtocol = process.env.NAZAR_GRAPHICS_PROTOCOL;
const originalTerm = process.env.TERM;
const originalKittyWindowId = process.env.KITTY_WINDOW_ID;
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
  delete process.env.KITTY_WINDOW_ID;
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
  restoreEnv("KITTY_WINDOW_ID", originalKittyWindowId);
  restoreEnv("TMUX", originalTmux);
  restoreEnv("ZELLIJ", originalZellij);
  restoreEnv("STY", originalSty);
  setGraphicsQuality(undefined);
});

test("role avatars render generated ANSI art", () => {
  const nazar = renderAnsiAvatarFrame("nazar");
  expect(nazar).toHaveLength(9);
  expect(nazar.map((line) => visibleWidth(line))).toEqual([19, 19, 19, 19, 19, 19, 19, 19, 19]);
  expect(nazar.join("\n")).toContain("\x1b[48;2;");
  expect(renderAnsiAvatarFrame("user").join("\n")).toContain("\x1b[48;2;");
});

test("ANSI animations expose stable wrapping frames", () => {
  expect(plain(renderThinkingAvatarFrame(9))).toEqual(plain(renderThinkingAvatarFrame(0)));
  expect(plain(renderUserTypingAvatarFrame(9))).toEqual(plain(renderUserTypingAvatarFrame(0)));
  expect(new Set(Array.from({ length: 4 }, (_, index) => renderThinkingAvatarFrame(index).join("\n"))).size).toBeGreaterThan(1);
});

test("avatar renderer derives cell width from terminal aspect ratio for near-square sprite framing", () => {
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
  process.env.NAZAR_CELL_WIDTH_PX = "9";
  process.env.NAZAR_CELL_HEIGHT_PX = "17";
  const avatar = renderRoleAvatar("nazar")!;
  expect(avatar.width).toBe(18);
  expect(avatar.height).toBe(9);
  expect(getCellDimensions()).toEqual({ widthPx: 9, heightPx: 17 });
  expect(avatarPixelAspect(avatar.width + 2, avatar.height + 2)).toBeCloseTo(1, 1);
});

test("auto quality selects Kitty placeholder cells when supported", () => {
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const avatar = renderRoleAvatar("nazar")!;
  expect(avatar.backend).toBe("kitty-placeholder");
  expect(avatar.lines[0]?.text).toContain("\u{10eeee}");
});

test("default user avatar renders the soul sheet in HD mode", () => {
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const avatar = renderRoleAvatar("user", { backend: "kitty" })!;
  expect(avatar.backend).toBe("kitty-placeholder");
  expect(avatar.lines[0]?.text).toContain("\u{10eeee}");
});

test("basic quality stays on ANSI even when Kitty is supported", () => {
  setGraphicsQuality("basic");
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const avatar = renderRoleAvatar("nazar")!;
  expect(avatar.backend).toBe("ansi");
  expect(avatar.lines[0]?.text).not.toContain("\x1b_G");
});

test("HD quality selects Kitty placeholder cells when supported", () => {
  setGraphicsQuality("hd");
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const avatar = renderRoleAvatar("nazar")!;
  expect(avatar.backend).toBe("kitty-placeholder");
  expect(avatar.lines[0]?.text).toContain("\u{10eeee}");
});

test("explicit Kitty backend uses Kitty placeholder cells", () => {
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const avatar = renderRoleAvatar("nazar", { backend: "kitty" })!;
  expect(avatar.backend).toBe("kitty-placeholder");
  expect(avatar.lines[0]?.text).toContain("\x1b_Ga=T,f=32");
  expect(avatar.lines[0]?.text).toContain("U=1");
  expect(avatar.lines[0]?.text).toContain("\u{10eeee}");
  expect(avatar.lines[0]?.virtualWidth).toBe(avatar.width);
  expect(avatar.lines).toHaveLength(9);
});

test("explicit ANSI option ignores image capabilities", () => {
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const avatar = renderRoleAvatar("nazar", { backend: "ansi" })!;
  expect(avatar.backend).toBe("ansi");
  expect(avatar.lines[0]?.text).not.toContain("\x1b_G");
});

test("forced Kitty falls back to ANSI when unsupported", () => {
  setCapabilities({ images: null, trueColor: true, hyperlinks: true });
  const avatar = renderRoleAvatar("nazar", { backend: "kitty" })!;
  expect(avatar.backend).toBe("ansi");
});

test("ANSI detail is always half-block", () => {
  process.env.NAZAR_ANSI_DETAIL = "full-block";
  const frame = renderAnsiAvatarFrame("nazar");
  expect(frame.join("\n")).toContain("▀");
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
  expect(read.join("\n")).toContain("\x1b[48;2;");

  const bash = renderToolAvatar("bash", "pending", 0, '{"command":"git status"}');
  expect(bash).toHaveLength(ansiRows);
  expect(bash.map((line) => visibleWidth(line))).toEqual(widths);
  expect(bash.join("\n")).toContain("\x1b[48;2;");
  // Globe-on-pedestal sprites share the same half-block silhouette at 8×6 cells;
  // visual distinction is preserved through colour (the full coloured output differs).
  expect(bash.join("\n")).not.toEqual(read.join("\n"));

  const ok = renderToolPixelAvatar("memory_search", "ok", 0, "", { backend: "ansi" });
  const err = renderToolPixelAvatar("memory_search", "error", 0, "", { backend: "ansi" });
  expect(ok?.background).toBeUndefined();
  expect(err?.background).toBeUndefined();
  expect(ok?.lines.map((line) => line.background).every((b) => b === undefined)).toBe(true);
  expect(err?.lines.map((line) => line.background).every((b) => b === undefined)).toBe(true);
});

test("tool avatars animate only while running", () => {
  const done0 = renderToolPixelAvatar("bash", "ok", 0, "", { backend: "ansi" });
  const done5 = renderToolPixelAvatar("bash", "ok", 5, "", { backend: "ansi" });
  expect(done0?.lines[1]?.text).toBe(done5?.lines[1]?.text);

  const running0 = renderToolPixelAvatar("bash", "running", 0, "", { backend: "ansi" });
  const running5 = renderToolPixelAvatar("bash", "running", 5, "", { backend: "ansi" });
  expect(running0?.lines[1]?.text).not.toBe(running5?.lines[1]?.text);
});
