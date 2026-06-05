// SPDX-License-Identifier: AGPL-3.0-or-later
// Compact working state: no sentence; render Nazar-owned thinking panels.
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { compact, padVisible, visibleWidth } from "./ansi.ts";
import { paintPanelBorderPart, panelHorizontal, panelLabeledTop, panelRule, panelStyle, type PanelStyle } from "./panel-style.ts";
import {
  centerAvatarLine,
  emptyAvatarLine,
  renderThinkingAvatar,
} from "./pixel-avatar.ts";
import { roleNameplate } from "./sprites.ts";

const THINKING_WIDGET_KEY = "nazar-thinking";
const THINKING_INTERVAL_MS = 180;
const THINKING_LEFT_PADDING = 1;
const THINKING_PREVIEW_MAX_CHARS = 900;

let currentThinkingPreview = "";

function thought(text: string): string {
  return panelStyle("thinking", "running").paint.muted(text);
}

function muted(text: string): string {
  return panelStyle("thinking", "running").paint.muted(text);
}

function panelWidths(_avatarInnerWidth: number): { width: number; previewWidth: number } {
  // The TUI/widget path renders full-width lines. Keep the panel inside the
  // terminal width so the differential renderer never has to wrap it. Preview
  // text owns its own rows; the avatar is decorative and rendered above.
  const width = Math.max(32, (process.stdout.columns || 80) - THINKING_LEFT_PADDING);
  return { width, previewWidth: width };
}

function spacedUpper(text: string): string {
  return text.toUpperCase().split("").join(" ");
}

function paintBg(text: string, background: readonly [number, number, number] | undefined, width = visibleWidth(text)): string {
  const padded = `${text}${" ".repeat(Math.max(0, width - visibleWidth(text)))}`;
  if (!background) return padded;
  const [r, g, b] = background;
  return `\x1b[48;2;${r};${g};${b}m${padded}\x1b[49m`;
}

function labeledHeaderTop(innerWidth: number, label: string, style: PanelStyle): string {
  return panelLabeledTop(style, innerWidth, label);
}

const HEADER_SIDE_PADDING = 5;

function headerLeftColumn(panelWidth: number, boxWidth: number): number {
  return Math.max(0, panelWidth - boxWidth - HEADER_SIDE_PADDING);
}

function positionedHeaderTop(box: string, boxWidth: number, panelWidth: number): string {
  return `${" ".repeat(headerLeftColumn(panelWidth, boxWidth))}${box}`;
}

function connectedHeaderBottom(innerWidth: number, boxWidth: number, panelWidth: number, style: PanelStyle, background?: readonly [number, number, number]): string {
  const g = style.glyphs;
  const leftWidth = headerLeftColumn(panelWidth, boxWidth);
  const rightWidth = Math.max(0, panelWidth - boxWidth - leftWidth);
  return `${panelHorizontal(style, leftWidth, "base")}${paintPanelBorderPart(style, "join", g.bottomRight)}${paintBg("", background, innerWidth)}${paintPanelBorderPart(style, "join", g.bottomLeft)}${panelHorizontal(style, rightWidth, "base")}`;
}

function withLeftPadding(lines: string[]): string {
  const prefix = " ".repeat(THINKING_LEFT_PADDING);
  return lines.map((line) => `${prefix}${line}`).join("\n");
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
  const content = Array.isArray((message as any)?.content) ? (message as any).content : [];
  const thinkingParts = content.filter((part: any) => part?.type === "thinking");
  const visible = thinkingParts
    .filter((part: any) => !part?.redacted && typeof part?.thinking === "string" && part.thinking.trim())
    .map((part: any) => part.thinking);

  if (visible.length > 0) return tailThinkingText(visible.join("\n\n"));
  if (thinkingParts.some((part: any) => part?.redacted)) return "Thinking redacted by provider.";
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

export function updateThinkingPreviewFromMessage(message: unknown): boolean {
  setThinkingPreview(extractThinkingPreview(message));
  return hasThinkingPreview();
}

export function renderThinkingPanel(
  frameIndex: number,
  options: { loaderSafe?: boolean; mode?: unknown; preview?: string } = {},
): string {
  const avatar = renderThinkingAvatar(frameIndex, options.loaderSafe ? { backend: "ansi" } : {})!;
  const style = panelStyle("thinking", "running", { frame: frameIndex });
  const titlePaint = style.paint.title;

  const avatarWidth = avatar.width;
  const avatarInnerWidth = avatarWidth;
  const avatarContentWidth = avatarWidth;
  const { width: panelWidth, previewWidth } = panelWidths(avatarInnerWidth);
  const g = style.glyphs;
  const avatarRows = avatar.lines.length;
  const label = titlePaint(spacedUpper(roleNameplate("nazar", "thinking")));
  const titleWidth = visibleWidth(` ${label} `);
  const innerWidth = Math.max(avatarInnerWidth, titleWidth + 2);
  const boxWidth = innerWidth + 2;
  const boxLeftColumn = headerLeftColumn(panelWidth, boxWidth);
  const previewLines = previewTextLines(options.preview ?? currentThinkingPreview, previewWidth, avatarRows, frameIndex);
  const lines = [positionedHeaderTop(labeledHeaderTop(innerWidth, label, style), boxWidth, panelWidth)];
  lines.push(`${" ".repeat(boxLeftColumn)}${paintPanelBorderPart(style, "vertical", g.leftVertical)}${paintBg("", avatar.background, innerWidth)}${paintPanelBorderPart(style, "vertical", g.rightVertical)}`);

  const avatarStartColumn = THINKING_LEFT_PADDING + boxLeftColumn + 2;
  for (let index = 0; index < avatarRows; index++) {
    const avatarLine = avatar.lines[index] ?? emptyAvatarLine(avatar.background);
    lines.push(`${" ".repeat(boxLeftColumn)}${paintPanelBorderPart(style, "vertical", g.leftVertical)}${centerAvatarLine(avatarLine, innerWidth, avatarStartColumn)}${paintPanelBorderPart(style, "vertical", g.rightVertical)}`);
  }
  lines.push(connectedHeaderBottom(innerWidth, boxWidth, panelWidth, style, avatar.background));
  lines.push(...previewLines.map((line) => paintBg(line, avatar.background, previewWidth)));
  lines.push(panelRule(style, panelWidth));
  if (style.supports.shadow) lines.push(style.paint.shadow(style.glyphs.shadow.repeat(panelWidth)));
  return withLeftPadding(lines);
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

export function workingMessage(): string {
  return "";
}

export function setWorkingMessage(ctx: ExtensionContext, _turnIndex = 0) {
  if (!ctx?.hasUI) return;
  try { ctx.ui.setWorkingMessage?.(workingMessage()); } catch { /* ignore */ }
}
