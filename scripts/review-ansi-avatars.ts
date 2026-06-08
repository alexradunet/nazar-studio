// SPDX-License-Identifier: AGPL-3.0-or-later
// Print Nazar's native ANSI avatars at the review size.
import { visibleWidth } from "../lib/ui/ansi.ts";
import { renderNazarExpression, renderRoleAvatar, renderThinkingAvatar, renderToolPixelAvatar, renderUserTypingAvatar } from "../lib/ui/pixel-avatar.ts";
import { uiQuality, uiRenderer } from "../lib/ui/graphics-state.ts";

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

const args = process.argv.slice(2);
const maybeRows = Number(args[0]);
const rows = Number.isFinite(maybeRows) && maybeRows > 0 ? maybeRows : 11;
const rest = Number.isFinite(maybeRows) && maybeRows > 0 ? args.slice(1) : args;
const allFrames = rest.includes("--all-frames");
const frames = allFrames ? Array.from({ length: 9 }, (_, index) => index) : [0];

function printAvatar(label: string, lines: readonly { text: string }[] | undefined): void {
  if (!lines || lines.length === 0) {
    console.log(`## ${label} — MISSING\n`);
    process.exitCode = 1;
    return;
  }
  const text = lines.map((line) => line.text);
  const widths = text.map((line) => visibleWidth(line));
  console.log(`## ${label} — ${Math.max(...widths)}×${text.length}`);
  for (const line of text) console.log(line);
  console.log("\x1b[0m");
}

console.log(`Nazar ANSI avatar review — rows=${rows} quality=${uiQuality()} renderer=${uiRenderer()}`);
console.log("Tip: set NAZAR_UI_QUALITY=low|medium|high; pass --all-frames to inspect animation/expression frames.\n");

printAvatar("nazar", renderRoleAvatar("nazar", { rows })?.lines);
printAvatar("user", renderRoleAvatar("user", { rows })?.lines);
for (const frame of frames) printAvatar(`nazar-thinking-${frame}`, renderThinkingAvatar(frame, { rows })?.lines);
for (const frame of frames) printAvatar(`user-typing-${frame}`, renderUserTypingAvatar(frame, { rows })?.lines);
for (const frame of frames) printAvatar(`nazar-expression-${frame}`, renderNazarExpression(frame, { rows })?.lines);

const tools = ["read", "write", "edit", "bash", "open-websearch", "memory_search", "skill_write", "doctor", "terminal"];
for (const tool of tools) printAvatar(`tool-${tool}`, renderToolPixelAvatar(tool, "pending", 0, "", { rows })?.lines);
