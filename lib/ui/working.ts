// SPDX-License-Identifier: AGPL-3.0-or-later
// Compact working state: no sentence; render Nazar-owned thinking panels.
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { compact, padVisible, visibleWidth } from "./ansi.ts";
import { panelStyle } from "./panel-style.ts";
import type { MessageContentPart, RenderableMessage } from "./pi-surface.ts";
import {
  emptyAvatarLine,
  renderNazarExpression,
  renderThinkingAvatar,
} from "./pixel-avatar.ts";
import { getNazarMood, nazarMoodFrame } from "./nazar-mood.ts";
import { roleNameplate } from "./sprites.ts";
import { bodyColumnWidth, composeMessagePanel } from "./turn-composer.ts";

const BOLD_ON = "\x1b[1m";
const BOLD_OFF = "\x1b[22m";

const THINKING_WIDGET_KEY = "nazar-thinking";
const THINKING_INTERVAL_MS = 180;
const THINKING_PREVIEW_MAX_CHARS = 900;

let currentThinkingPreview = "";

function thought(text: string): string {
  return panelStyle("thinking", "running").paint.muted(text);
}

function muted(text: string): string {
  return panelStyle("thinking", "running").paint.muted(text);
}

function stripControl(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function normalizeThinkingText(text: string): string {
  return stripControl(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tailThinkingText(text: string): string {
  const clean = normalizeThinkingText(text);
  if (clean.length <= THINKING_PREVIEW_MAX_CHARS) return clean;
  const tail = clean.slice(-THINKING_PREVIEW_MAX_CHARS);
  const boundary = tail.search(/\s/);
  const clipped = boundary >= 0 ? tail.slice(boundary + 1).trimStart() : tail;
  return `…${clipped}`;
}

function wrapPlain(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (visibleWidth(candidate) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = visibleWidth(word) > width ? compact(word, width) : word;
  }

  if (line) lines.push(line);
  return lines;
}

function previewTextLines(preview: string, width: number, rows: number, frameIndex: number): string[] {
  const safeWidth = Math.max(1, width);
  const clean = tailThinkingText(preview);
  if (!clean) {
    const dots = ".".repeat(frameIndex % 4);
    return [muted(padVisible(compact(`Thinking${dots}`, safeWidth), safeWidth))];
  }

  const wrapped = wrapPlain(clean, safeWidth);
  const clipped = wrapped.length > rows ? wrapped.slice(-rows) : wrapped;
  if (wrapped.length > rows && clipped.length > 0 && !clipped[0]!.startsWith("…")) {
    clipped[0] = compact(`… ${clipped[0]}`, safeWidth);
  }

  return clipped.map((line) => thought(padVisible(compact(line, safeWidth), safeWidth)));
}

export function extractThinkingPreview(message: unknown): string {
  const raw = (message as RenderableMessage)?.content;
  const content: MessageContentPart[] = Array.isArray(raw) ? raw : [];
  const thinkingParts = content.filter((part) => part?.type === "thinking");
  const visible = thinkingParts
    .filter((part) => !part?.redacted && typeof part?.thinking === "string" && part.thinking.trim())
    .map((part) => part.thinking);

  if (visible.length > 0) return tailThinkingText(visible.join("\n\n"));
  if (thinkingParts.some((part) => part?.redacted)) return "Thinking redacted by provider.";
  return "";
}

export function setThinkingPreview(text = ""): void {
  currentThinkingPreview = tailThinkingText(text);
}

export function clearThinkingPreview(): void {
  currentThinkingPreview = "";
}

export function hasThinkingPreview(): boolean {
  return currentThinkingPreview.trim().length > 0;
}

export function renderThinkingPanel(
  frameIndex: number,
  options: { loaderSafe?: boolean; mode?: unknown; preview?: string } = {},
): string {
  // While Nazar works, his face reflects his mood: a calm contemplative loop by
  // default, or a held expression (focused while a tool runs, concerned on error).
  const backend = options.loaderSafe ? { backend: "ansi" as const } : {};
  const mood = getNazarMood();
  const avatar = (mood === "thinking" || mood === "neutral")
    ? renderThinkingAvatar(frameIndex, backend)!
    : renderNazarExpression(nazarMoodFrame(), backend)!;
  const style = panelStyle("thinking", "running", { frame: frameIndex });
  const width = Math.max(32, process.stdout.columns || 80);

  // Title mirrors the assistant panel convention: ✦ NAME · descriptor.
  // The role descriptor here is "weighing the matter" — a quiet Basm flourish
  // for the thinking state (mythic seasoning per the identity guide).
  const name = roleNameplate("nazar", "thinking").toUpperCase();
  const title = `${style.paint.title(`✦ ${BOLD_ON}${name}${BOLD_OFF}`)} ${style.paint.muted("· weighing the matter")}`;

  // Preview text wraps into the body column. previewTextLines targets a row
  // count matched to the avatar height so the panel renders as a balanced
  // two-column block, not a tall body next to a short portrait.
  const previewWidth = bodyColumnWidth(width, avatar.width);
  const previewLines = previewTextLines(
    options.preview ?? currentThinkingPreview,
    previewWidth,
    avatar.height,
    frameIndex,
  );

  const cell = {
    height: avatar.height,
    width: avatar.width,
    background: avatar.background,
    content: (i: number) => avatar.lines[i] ?? emptyAvatarLine(avatar.background),
  };

  // bottomGap: 0 — the ThinkingWidget wrapper adds its own trailing blank
  // line so the panel never feels glued to the input editor below it.
  const panel = composeMessagePanel(
    previewLines, cell, cell.width, width, 0,
    title, style,
    { align: "right", bottomGap: 0 },
  );

  return panel.join("\n");
}

export class ThinkingWidget implements Component {
  private readonly startMs = Date.now();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly tui: Pick<TUI, "requestRender">) {
    this.timer = setInterval(() => {
      try { this.tui.requestRender?.(); } catch { /* ignore */ }
    }, THINKING_INTERVAL_MS);
  }

  render(_width: number): string[] {
    const frame = Math.floor((Date.now() - this.startMs) / THINKING_INTERVAL_MS);
    // Pi's above-editor widget container adds a spacer before widgets, but not
    // after them. Keep one blank line between the thinking panel and the input
    // editor so the panel never feels glued to the prompt while streaming.
    return [...renderThinkingPanel(frame, { preview: currentThinkingPreview }).split("\n"), ""];
  }

  invalidate(): void {
    // No cache: each render reflects current terminal width, backend, and frame.
  }

  dispose(): void {
    clearInterval(this.timer);
  }
}

export function thinkingWidgetFactory(tui: TUI): Component & { dispose?(): void } {
  return new ThinkingWidget(tui);
}

export function showThinkingWidget(ctx: ExtensionContext): void {
  if (!ctx?.hasUI) return;
  try { ctx.ui.setWorkingVisible?.(false); } catch { /* use Nazar widget, not Pi loader */ }
  try { ctx.ui.setWidget?.(THINKING_WIDGET_KEY, thinkingWidgetFactory, { placement: "aboveEditor" }); } catch { /* ignore */ }
}

export function hideThinkingWidget(ctx: ExtensionContext): void {
  if (!ctx?.hasUI) return;
  try { ctx.ui.setWidget?.(THINKING_WIDGET_KEY, undefined); } catch { /* ignore */ }
  try { ctx.ui.setWorkingVisible?.(false); } catch { /* keep built-in loader hidden */ }
}

export function workingIndicator() {
  // Built-in Loader/Text fallback only; force ANSI because Loader/Text hosts may
  // measure by string width and do not understand image-placement escapes.
  return {
    frames: Array.from({ length: 9 }, (_, frame) => renderThinkingPanel(frame, { loaderSafe: true })),
    intervalMs: THINKING_INTERVAL_MS,
  };
}
