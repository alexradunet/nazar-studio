// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import { __testing } from "./avatars.ts";
import { visibleWidth } from "./ansi.ts";

const originalRecentLimit = process.env.NAZAR_AVATAR_RECENT_LIMIT;

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

afterEach(() => {
  if (originalRecentLimit === undefined) delete process.env.NAZAR_AVATAR_RECENT_LIMIT;
  else process.env.NAZAR_AVATAR_RECENT_LIMIT = originalRecentLimit;
});

test("message panels keep body text rows copyable (no box glyphs)", () => {
  const panel = __testing.composeMessagePanel(["copyable text"], 80).map(stripAnsi);
  // Find the row that contains the body text. In the two-column layout it
  // shares a row with the portrait column (avatar half-blocks on the left,
  // body text on the right). What matters is that the body text appears
  // unadorned by border-drawing glyphs (┏┓┗┛┃═╔╗╚╝ etc.).
  const textLine = panel.find((l) => l.includes("copyable text")) ?? "";
  expect(textLine).toContain("copyable text");
  // No box-drawing chars anywhere — half-blocks ▀/▄/█ in the avatar column
  // are sprite pixels, not decorative borders.
  expect(textLine).not.toMatch(/[║│╔╗╚╝╭╮╰╯┏┓┗┛═]/);
});

test("two-column layout: body text shares row with portrait, panel ends with blank gap", () => {
  const panel = __testing.composeMessagePanel(["answer"], 64).map(stripAnsi);
  // Find the row that contains "answer". In the two-column layout it appears
  // inside the panel rows (alongside the avatar), NOT below a separate portrait.
  const answerIndex = panel.findIndex((l) => l.includes("answer"));
  expect(answerIndex).toBeGreaterThanOrEqual(0);
  // After the last panel row, there is a blank-gap row (separator between
  // consecutive panels). That blank row has length = panel width.
  expect(panel.at(-1)?.trim()).toBe("");
  // The last non-blank row should not be a ━ rule (the rule is retired in
  // the two-column layout).
  const lastNonBlank = [...panel].reverse().find((l) => l.trim().length > 0) ?? "";
  expect(lastNonBlank).not.toMatch(/^━+$/);
});

test("message panels can show the role/tool name inside the nameplate band", () => {
  const panel = __testing.composeMessagePanel(["answer"], 64, "Nazar").map(stripAnsi);
  expect(panel.join("\n")).toContain("Nazar");
  expect(panel.join("\n")).not.toContain("[ Nazar ]");
});

test("nameplate band appears at the top of the right column (panel row 0)", () => {
  const panel = __testing.composeMessagePanel(["answer"], 64, "NAZAR").map(stripAnsi);
  // Row 0 is the nameplate row; it carries the title and no border chars.
  expect(panel[0]).toContain("NAZAR");
  expect(panel[0]).not.toMatch(/[┏┓┗┛┃━┳┻]/);
});

test("every emitted row fits within the requested panel width (pi-tui width assertion)", () => {
  // Regression for the crash: pi-tui asserts that every rendered line must
  // fit within the terminal width. The two-column composer used to overflow
  // when the body text was wider than the body column. Now Pi pre-wraps to
  // the body width and the composer truncates as a safety net.
  const cases = [
    { lines: ["short"], width: 80, title: "Nazar" },
    { lines: ["x".repeat(500)], width: 80, title: "Nazar" },
    { lines: ["x".repeat(500)], width: 209, title: "Nazar" },
    { lines: Array(50).fill("y".repeat(300)), width: 120, title: "Tool · construct" },
    { lines: ["normal line"], width: 30, title: "VeryLongTitleThatDoesNotFitWidth" },
  ];
  for (const tc of cases) {
    const panel = __testing.composeMessagePanel(tc.lines, tc.width, tc.title);
    for (let i = 0; i < panel.length; i++) {
      const w = visibleWidth(panel[i]);
      if (w > tc.width) {
        throw new Error(`row ${i} is ${w} > ${tc.width} (case: title="${tc.title}", body chars=${tc.lines.join("").length})`);
      }
    }
  }
});

test("Pi-padded body lines do not get a stray '...' ellipsis appended", async () => {
  // Regression: when Pi padded body text to exactly the wrap width (a width
  // we computed from bodyColumnWidth), the safety-net truncation in
  // paintBodyRow was off-by-one and added "..." on every row. The fix is
  // that bodyColumnWidth reserves the 1-cell leading inset itself, so the
  // composer's body cell exactly fits Pi's padded output.
  const { bodyColumnWidth } = await import("./turn-composer.ts");
  const { renderRoleAvatar } = await import("./pixel-avatar.ts");
  const avatarW = renderRoleAvatar("nazar", { backend: "ansi" })!.width;
  for (const w of [80, 100, 120, 209]) {
    const wrapW = bodyColumnWidth(w, avatarW);
    // Simulate a Pi-padded line at exactly the wrap width — what Pi actually
    // emits for any full-width content. This should fit cleanly, no ellipsis.
    const line = "x".repeat(wrapW);
    const panel = __testing.composeMessagePanel([line], w, "T").map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    const stray = panel.filter((r) => r.includes("..."));
    expect(stray, `panel width ${w} (wrap ${wrapW}) produced ${stray.length} rows with "..."`).toHaveLength(0);
  }
});

test("avatar field background keeps the avatar box fixed instead of stretching to long bodies", async () => {
  const { composeMessagePanel } = await import("./turn-composer.ts");
  const { panelStyle } = await import("./panel-style.ts");
  const portraitField = [1, 2, 3] as const;
  const style = { ...panelStyle("user"), portraitField };
  const avatar = {
    height: 2,
    width: 4,
    background: portraitField,
    content: () => ({ text: "xx" }),
  };

  const panel = composeMessagePanel(
    Array(8).fill("long body row"),
    avatar,
    avatar.width,
    80,
    0,
    "CICO",
    style,
  );
  const portraitBg = "\x1b[48;2;1;2;3m";

  expect(panel[0]).not.toContain(portraitBg);
  expect(panel.filter((row) => row.includes(portraitBg))).toHaveLength(avatar.height);
});

test("right-align layout places the avatar on the right of the body", async () => {
  // The user-message render flips the avatar to the right of the panel
  // (chat-style: them on the left, you on the right). We exercise the
  // composer directly with align: "right" and assert that the column
  // containing avatar half-block glyphs appears AFTER the body text.
  const { composeMessagePanel } = await import("./turn-composer.ts");
  const { renderRoleAvatar, emptyAvatarLine } = await import("./pixel-avatar.ts");
  const { panelStyle } = await import("./panel-style.ts");

  const av = renderRoleAvatar("user", { backend: "ansi" })!;
  const cell = {
    height: av.height,
    width: av.width,
    background: av.background,
    content: (i: number) => av.lines[i] ?? emptyAvatarLine(av.background),
  };
  const panel = composeMessagePanel(
    ["hello world"],
    cell,
    cell.width,
    80,
    0,
    "CICO",
    panelStyle("user"),
    { align: "right" },
  ).map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));

  // Find the row that contains the body text.
  const bodyRow = panel.find((r) => r.includes("hello world")) ?? "";
  const bodyIdx = bodyRow.indexOf("hello world");
  expect(bodyIdx).toBeGreaterThan(0);

  // In the right-align layout, any half-block sprite glyphs (▀/▄/█) live
  // strictly to the RIGHT of the body text column. Pick a row containing
  // avatar pixels and check the glyph position.
  const halfBlock = /[▀▄█▌▐]/;
  const avatarRow = panel.find((r) => halfBlock.test(r)) ?? "";
  const avatarPos = avatarRow.search(halfBlock);
  expect(avatarPos).toBeGreaterThan(bodyIdx);
});

test("body text rows are free of box-drawing decoration", () => {
  const panel = __testing.composeMessagePanel(["test content"], 64, "Nazar").map(stripAnsi);
  // Every row may contain ▀/▄/█ sprite pixels in the avatar column, but no
  // box-drawing glyphs anywhere (the bottom rule is retired in two-column).
  for (const line of panel) {
    expect(line).not.toMatch(/[┏┓┗┛┃┳┻╔╗╚╝╠╣╦╩║═]/);
  }
});

test("partial tool results count as running", () => {
  expect(__testing.toolStatus({ result: { details: "streaming" }, isPartial: true })).toBe("running");
});

test("rich avatars are limited to recent panels unless active", () => {
  process.env.NAZAR_AVATAR_RECENT_LIMIT = "2";
  const first = {};
  const second = {};
  const third = {};

  expect(__testing.shouldUseRichAvatar(first)).toBe(true);
  expect(__testing.shouldUseRichAvatar(second)).toBe(true);
  expect(__testing.shouldUseRichAvatar(third)).toBe(true);

  expect(__testing.shouldUseRichAvatar(first)).toBe(false);
  expect(__testing.shouldUseRichAvatar(second)).toBe(true);
  expect(__testing.shouldUseRichAvatar(third)).toBe(true);
  expect(__testing.shouldUseRichAvatar(first, true)).toBe(true);
});

test("old role messages keep the Nazar nameplate but drop the avatar column", async () => {
  process.env.NAZAR_AVATAR_RECENT_LIMIT = "0";
  const { patchRpgAvatars } = await import("./avatars.ts");
  const { UserMessageComponent, AssistantMessageComponent, ToolExecutionComponent } = await import("@earendil-works/pi-coding-agent");
  const key = Symbol.for("nazar.rpgAvatarOriginals");
  const g = globalThis as any;
  const savedOriginals = g[key];
  const savedUserRender = UserMessageComponent.prototype.render;
  const savedAssistantRender = AssistantMessageComponent.prototype.render;
  const savedAssistantUpdateContent = AssistantMessageComponent.prototype.updateContent;
  const savedToolRender = ToolExecutionComponent.prototype.render;

  g[key] = {};
  UserMessageComponent.prototype.render = function fakeOriginal(width: number) {
    return [`plain message at ${width}`];
  };

  try {
    patchRpgAvatars();
    const rendered = UserMessageComponent.prototype.render.call({}, 80).map(stripAnsi).join("\n");

    expect(rendered).toContain("plain message at 75");
    expect(rendered).toContain("· you");
    expect(rendered).not.toBe("plain message at 80");
    expect(rendered).not.toContain("◆");
    expect(rendered).not.toMatch(/[▀▄█▌▐]/);
  } finally {
    UserMessageComponent.prototype.render = savedUserRender;
    AssistantMessageComponent.prototype.render = savedAssistantRender;
    AssistantMessageComponent.prototype.updateContent = savedAssistantUpdateContent;
    ToolExecutionComponent.prototype.render = savedToolRender;
    if (savedOriginals === undefined) delete g[key];
    else g[key] = savedOriginals;
  }
});

test("Kitty image APC sequences pass through the composer verbatim", async () => {
  // Regression: in-message images (and HD avatar APC transmission rows)
  // were showing as raw Kitty placeholder chars because the APC image data
  // got sandwiched inside bg-paint wrappers and corrupted. The composer
  // must extract APC sequences and emit them BEFORE the bg-paint frame,
  // so the terminal stores the image first and then matches placeholders.
  const { paintBgStrip, extractImageSequences } = await import("./turn-composer.ts");
  const fakeBase64 = "ZmFrZS1pbWFnZS1ieXRlcy1mb3ItdGVzdGluZw==";
  const apc = `\x1b_Ga=T,f=100,c=4,r=2,i=12345,U=1;${fakeBase64}\x1b\\`;
  // Realistic shape: APC + placeholder row + fg reset
  const placeholderRow = `${apc}\x1b[38;2;0;48;57m\u{10eeee}\u{10eeee}\u{10eeee}\u{10eeee}\x1b[39m`;
  const out = paintBgStrip(placeholderRow, [16, 34, 31] as any, 8);
  // The APC sequence must appear in the output, fully intact, before any
  // bg-paint wrapping. Once Kitty stores the image, placeholder cells can
  // match by ID — but only if the APC reached the terminal uncorrupted.
  expect(out).toContain(apc);
  // The APC should come BEFORE the bg-open code (so image transmission
  // isn't subjected to colour-frame manipulation).
  const apcIdx = out.indexOf(apc);
  const bgOpenIdx = out.indexOf("\x1b[48;2;16;34;31m");
  expect(apcIdx).toBeGreaterThanOrEqual(0);
  expect(bgOpenIdx).toBeGreaterThan(apcIdx);
  // extractImageSequences pulls the APC out and leaves the rest clean.
  const { apc: extracted, rest } = extractImageSequences(placeholderRow);
  expect(extracted).toBe(apc);
  expect(rest).not.toContain("\x1b_G");
});

test("bg-reset holes (\\x1b[49m) in body text are sealed instead of tearing the panel", async () => {
  // Regression: pi-tui's editor body can emit \x1b[49m mid-line. The old
  // paintBgStrip wrapped the strip as bgOpen ... bgClose without rewriting
  // internal bg-resets, so the painted bg got torn into segments — a
  // visible "black gap" appeared behind typed text. The fix rewrites every
  // internal \x1b[49m back to the panel's bg-open.
  const { paintBgStrip } = await import("./turn-composer.ts");
  const torn = `hello\x1b[49m world`;
  const out = paintBgStrip(torn, [16, 34, 31] as any, 20);
  // The strip is wrapped: bgOpen + content + bgClose. The bgClose at the
  // very end is intentional (the only \x1b[49m we keep). Every prior
  // \x1b[49m has been rewritten to a fresh bgOpen.
  const closeMatches = out.match(/\x1b\[49m/g) ?? [];
  expect(closeMatches.length).toBe(1);
});

test("inverse-video flag from pi-tui's cursor (\\x1b[7m...\\x1b[0m) is closed cleanly", async () => {
  // Regression: pi-tui's editor renders the cursor as `\x1b[7m{char}\x1b[0m`
  // — inverse video ON, then a full SGR reset. The previous \x1b[0m rewrite
  // only re-opened the bg and reset fg; reverse-video stayed STUCK ON for
  // every cell after the cursor, painting a bright bar where the panel
  // ambient should be (the bg color started rendering as the fg color due
  // to the swap). The fix explicitly turns off every renderable attribute
  // in the rewrite, including 27 (reverse off).
  const { paintBgStrip } = await import("./turn-composer.ts");
  const cursor = `> \x1b[7m \x1b[0m`; // editor body with an inverse-cursor space
  const out = paintBgStrip(cursor, [57, 76, 84] as any, 40);
  // The full-reset \x1b[0m must be rewritten to a sequence that includes 27
  // (reverse off), not silently dropped.
  expect(out).toMatch(/\x1b\[(?:[0-9;]*;)?27(?:;[0-9;]*)?m/);
  // And the bg must be re-applied right after the attribute clear, so the
  // strip stays uniformly painted past the cursor.
  expect(out).toContain("\x1b[48;2;57;76;84m");
  // The strip should still end with exactly one bg-close (the outer wrap).
  expect((out.match(/\x1b\[49m/g) ?? []).length).toBe(1);
});
