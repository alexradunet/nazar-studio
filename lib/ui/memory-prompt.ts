// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar-styled review prompt for proactive memory capture.
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { panelStyle, type PanelStyle } from "./panel-style.ts";
import { nameplateRow, paintBgStrip } from "./turn-composer.ts";

export type MemoryProposalPreview = {
  title: string;
  content: string;
  type?: string;
  whenToUse?: string;
  tags?: string[];
  outcome?: "success" | "failure";
};

export type MemoryPromptOption = {
  label: string;
  description?: string;
};

type PromptConfig = {
  question: string;
  proposal: MemoryProposalPreview;
  options: MemoryPromptOption[];
  heading?: string;
  meta?: string;
};

type PromptOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

const PAD_X = 2;
const CONTENT_LINE_LIMIT = 8;

export function previewText(value: unknown, max = 700): string {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function previewLine(value: unknown, fallback = "", max = 120): string {
  return previewText(String(value ?? fallback).replace(/\s+/g, " "), max);
}

export function formatMemoryPreview(p: MemoryProposalPreview, heading = "Proposed memory"): string {
  const tags = (p.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean);
  const lines = [
    `${heading}:`,
    `Page: [[${previewLine(p.title, "untitled")}]]`,
    `Folder: ${previewLine(p.type, "notes")}`,
  ];
  if (p.whenToUse?.trim()) lines.push(`When to use: ${previewLine(p.whenToUse)}`);
  if (tags.length) lines.push(`Tags: ${previewLine(tags.join(", "))}`);
  if (p.outcome) lines.push(`Outcome: ${p.outcome}`);
  lines.push("Content:", previewText(p.content));
  return lines.join("\n");
}

export function memoryDialogTitle(question: string, p: MemoryProposalPreview, heading?: string): string {
  return `${question}\n\n${formatMemoryPreview(p, heading)}`;
}

function promptBodyWidth(width: number): number {
  return Math.max(36, Math.min(96, Math.max(8, width - PAD_X * 2)));
}

function renderRow(text: string, width: number, style: PanelStyle): string {
  const bodyWidth = promptBodyWidth(width);
  const budget = Math.max(1, bodyWidth - 1);
  const fitted = truncateToWidth(text, budget, "…");
  return `${" ".repeat(PAD_X)}${paintBgStrip(` ${fitted}`, style.background, bodyWidth)}`;
}

function renderBlank(width: number, style: PanelStyle): string {
  return renderRow("", width, style);
}

function wrapLines(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of String(text ?? "").replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      out.push("");
      continue;
    }
    out.push(...wrapTextWithAnsi(line, Math.max(8, width)));
  }
  return out.length ? out : ["—"];
}

function cappedContentLines(content: string, width: number, style: PanelStyle): string[] {
  const lines = wrapLines(previewText(content), width);
  if (lines.length <= CONTENT_LINE_LIMIT) return lines.map((line) => style.paint.text(line));
  return [
    ...lines.slice(0, CONTENT_LINE_LIMIT - 1).map((line) => style.paint.text(line)),
    style.paint.muted("…"),
  ];
}

function optionDescription(label: string): string | undefined {
  if (label === "Save") return "write this page";
  if (label === "Edit…") return "adjust title/content first";
  if (label === "Skip") return "do not save";
  if (label === "Update the existing note") return "replace the current page";
  if (label === "Save as a new note") return "keep both notes separate";
  if (label.startsWith("Merge into ")) return "append to that page";
  return undefined;
}

function metadataLines(p: MemoryProposalPreview, style: PanelStyle): string[] {
  const tags = (p.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean);
  const lines = [
    `${style.paint.muted("Page")} ${style.paint.accent(`[[${previewLine(p.title, "untitled")}]]`)}`,
    `${style.paint.muted("Folder")} ${style.paint.text(previewLine(p.type, "notes"))}`,
  ];
  if (p.whenToUse?.trim()) lines.push(`${style.paint.muted("When")} ${style.paint.text(previewLine(p.whenToUse))}`);
  if (tags.length) lines.push(`${style.paint.muted("Tags")} ${style.paint.text(previewLine(tags.join(", ")))}`);
  if (p.outcome) lines.push(`${style.paint.muted("Outcome")} ${style.paint.text(p.outcome)}`);
  return lines;
}

export function renderMemoryPromptLines(config: PromptConfig, width: number, selectedIndex = 0): string[] {
  const style = panelStyle("assistant", "active");
  const safeWidth = Math.max(44, Math.floor(width));
  const bodyWidth = promptBodyWidth(safeWidth);
  const contentWidth = Math.max(8, bodyWidth - 1);
  const selected = Math.max(0, Math.min(selectedIndex, Math.max(0, config.options.length - 1)));
  const title = style.paint.title("✦ Nazar · memory");
  const meta = style.paint.muted(config.meta ?? "review before saving");
  const lines: string[] = [
    `${" ".repeat(PAD_X)}${nameplateRow(title, bodyWidth, style, meta)}`,
    renderBlank(safeWidth, style),
    renderRow(style.paint.accent(config.question), safeWidth, style),
  ];

  const heading = config.heading ?? "Proposed memory";
  lines.push(renderRow(style.paint.muted(heading), safeWidth, style));
  for (const line of metadataLines(config.proposal, style)) lines.push(renderRow(line, safeWidth, style));
  lines.push(renderBlank(safeWidth, style));
  lines.push(renderRow(style.paint.muted("Content"), safeWidth, style));
  for (const line of cappedContentLines(config.proposal.content, contentWidth, style)) lines.push(renderRow(line, safeWidth, style));
  lines.push(renderBlank(safeWidth, style));
  lines.push(renderRow(style.paint.muted("Actions"), safeWidth, style));

  config.options.forEach((option, index) => {
    const active = index === selected;
    const marker = active ? "›" : " ";
    const label = active ? style.paint.accent(option.label) : style.paint.text(option.label);
    const desc = option.description ?? optionDescription(option.label);
    const suffix = desc ? style.paint.muted(` — ${desc}`) : "";
    lines.push(renderRow(`${marker} ${label}${suffix}`, safeWidth, style));
  });

  lines.push(renderBlank(safeWidth, style));
  lines.push(renderRow(style.paint.muted("↑↓ choose · Enter confirm · Esc skip"), safeWidth, style));
  return lines.map((line) => visibleWidth(line) <= safeWidth ? line : truncateToWidth(line, safeWidth, ""));
}

export async function promptMemoryChoice(ctx: ExtensionContext, config: PromptConfig, opts: PromptOptions = {}): Promise<string | undefined> {
  if (typeof ctx?.ui?.custom === "function") {
    try {
      return await ctx.ui.custom((tui, _theme, _keybindings, done: (choice: string | undefined) => void) => {
        let selected = 0;
        let settled = false;
        let timeout: NodeJS.Timeout | undefined;
        const finish = (choice: string | undefined) => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          opts.signal?.removeEventListener?.("abort", onAbort);
          done(choice);
        };
        const onAbort = () => finish(undefined);
        if (opts.signal?.aborted) queueMicrotask(onAbort);
        else opts.signal?.addEventListener?.("abort", onAbort, { once: true });
        if (opts.timeoutMs && opts.timeoutMs > 0) timeout = setTimeout(onAbort, opts.timeoutMs);

        return {
          render: (width: number) => renderMemoryPromptLines(config, width, selected),
          invalidate() {},
          handleInput(data: string) {
            if (matchesKey(data, Key.up)) selected = Math.max(0, selected - 1);
            else if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) selected = Math.min(config.options.length - 1, selected + 1);
            else if (matchesKey(data, Key.enter)) return finish(config.options[selected]?.label);
            else if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c")) return finish(undefined);
            tui?.requestRender?.();
          },
        };
      }, {
        overlay: true,
        overlayOptions: {
          width: "72%",
          minWidth: 56,
          maxHeight: "80%",
          anchor: "center",
          margin: 1,
        },
      });
    } catch {
      // Older/non-TUI hosts may expose custom() but reject overlays. Fall through to select().
    }
  }

  if (typeof ctx?.ui?.select !== "function") return undefined;
  return await ctx.ui.select(
    memoryDialogTitle(config.question, config.proposal, config.heading),
    config.options.map((option) => option.label),
    { timeout: opts.timeoutMs, signal: opts.signal },
  );
}
