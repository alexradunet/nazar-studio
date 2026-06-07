// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar branding for the terminal TUI (avatar + design). No-ops cleanly when Pi is running
// without UI. Installed as a Pi package via `pi install npm:pi-nazar-studio`, so package/extension
// management is the host `pi` CLI's native job — this extension no longer shells out to a
// vendored bin/pi wrapper.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { uiCapabilitySummary } from "../lib/ui/design.ts";
import { setGraphicsQuality, type GraphicsQuality } from "../lib/ui/graphics-state.ts";
import { beginActiveAssistantAvatar, patchRpgAvatars, settleActiveAssistantAvatar } from "../lib/ui/avatars.ts";
import { renderChapterDivider, renderStitchLine } from "../lib/ui/divider.ts";
import { editorFactory } from "../lib/ui/editor.ts";
import { footerFactory } from "../lib/ui/footer.ts";
import { headerFactory } from "../lib/ui/header.ts";
import { panelStyle } from "../lib/ui/panel-style.ts";
import { recordSessionStart } from "../lib/ui/session-info.ts";
import { setActiveTool, setNazarMood } from "../lib/ui/nazar-mood.ts";
import { showThinkingWidget, hideThinkingWidget } from "../lib/ui/working.ts";
import { compact, visibleWidth } from "../lib/ui/ansi.ts";

function applyNazarUI(pi: ExtensionAPI, ctx: ExtensionContext, onTui?: (tui: any) => void) {
  if (!ctx?.hasUI) return; // no terminal UI to brand
  try { ctx.ui.setTitle?.("Nazar"); } catch { /* ignore */ }
  try { ctx.ui.setHeader?.(headerFactory); } catch { /* ignore */ }
  try { ctx.ui.setWidget?.("nazar", undefined); } catch { /* clear old widget on /reload */ }
  try { ctx.ui.setWidget?.("nazar-thinking", undefined); } catch { /* remove legacy thinking widget */ }
  try { ctx.ui.setFooter?.(footerFactory(pi, ctx, onTui)); } catch { /* ignore */ }
  // Pass pi + ctx so the editor's nameplate meta can pull live runtime
  // info (model · git · tools · ctx). When pi/ctx are unavailable the
  // editor falls back to an empty meta — graceful degradation.
  try { ctx.ui.setEditorComponent?.(editorFactory(pi, ctx)); } catch { /* keep Pi's default editor */ }
  try { ctx.ui.setToolsExpanded?.(false); } catch { /* less visual noise by default */ }
}

export default function (pi: ExtensionAPI) {
  patchRpgAvatars();

  let renderTui: any;
  let uiCtx: ExtensionContext | undefined;
  const activeToolAnimations = new Set<string>();
  let toolAnimationTicker: ReturnType<typeof setInterval> | undefined;

  function startToolAnimationTicker() {
    if (toolAnimationTicker || !renderTui) return;
    toolAnimationTicker = setInterval(() => {
      try { renderTui?.requestRender?.(); } catch { /* ignore */ }
    }, 180);
  }

  function stopToolAnimationTicker() {
    if (!toolAnimationTicker) return;
    clearInterval(toolAnimationTicker);
    toolAnimationTicker = undefined;
  }

  function trackToolAnimation(id: unknown) {
    if (typeof id !== "string" || !id) return;
    activeToolAnimations.add(id);
    startToolAnimationTicker();
  }

  function untrackToolAnimation(id: unknown) {
    if (typeof id === "string") activeToolAnimations.delete(id);
    if (activeToolAnimations.size === 0) stopToolAnimationTicker();
  }


  // Whether any tool errored during the current agent turn — decides Nazar's
  // resting expression when the turn ends (pleased vs. concerned).
  let turnHadError = false;
  const setMood = (mood: Parameters<typeof setNazarMood>[0]) => {
    setNazarMood(mood);
    try { renderTui?.requestRender?.(); } catch { /* ignore */ }
  };

  pi.on("session_start", async (_event: unknown, ctx: any) => {
    uiCtx = ctx;
    setNazarMood("neutral");
    applyNazarUI(pi, ctx, (tui) => { renderTui = tui; });
    // First render can happen before all rich-avatar state has fully settled.
    // Force one extra paint tick so post-load avatar-cap pruning applies
    // immediately (when the history buffer is already rendered).
    setTimeout(() => {
      try { renderTui?.requestRender?.(); } catch { /* ignore */ }
    }, 0);
  });

  // Pi resets workingVisible = true before every agent run (interactive-mode.ts
  // line ~1850). Our setWorkingVisible(false) call inside applyNazarUI runs once
  // at session_start, but Pi re-enables the default "Working..." indicator on
  // each subsequent agent invocation. before_agent_start fires right before Pi
  // shows the loader, so we suppress it here reliably every turn.
  pi.on("before_agent_start", async (_event: unknown, ctx: any) => {
    uiCtx = ctx;
    try { ctx?.ui?.setWorkingVisible?.(false); } catch { /* ignore */ }
    turnHadError = false;
    setActiveTool(null);
    beginActiveAssistantAvatar();
    setMood("thinking");
    // Mount Nazar's animated thinking panel. The widget owns a 180ms timer that
    // drives the calm eye-orb loop while he works (mood "thinking"/"neutral"),
    // and holds a mood expression while a tool runs. Removed again on agent_end.
    try { showThinkingWidget(ctx); } catch { /* ignore */ }
  });

  pi.on("model_select", async (_event: unknown, _ctx: any) => {
    try { renderTui?.requestRender?.(); } catch { /* ignore */ }
  });

  pi.on("message_update", async (event: any) => {
    if (event?.message?.role === "assistant" && Array.isArray(event.message.content)) {
      for (const part of event.message.content) {
        if (part?.type === "toolCall") trackToolAnimation(part.id);
      }
      try { renderTui?.requestRender?.(); } catch { /* ignore */ }
    }
  });

  pi.on("tool_execution_start", async (event: any) => {
    trackToolAnimation(event?.toolCallId);
    setActiveTool(event?.toolName ?? null);
    setMood("focused");
  });

  pi.on("tool_execution_end", async (event: any) => {
    untrackToolAnimation(event?.toolCallId);
    setActiveTool(null);
    if (event?.isError) {
      turnHadError = true;
      setMood("concerned");
    } else {
      setMood("focused");
    }
  });

  pi.on("agent_end", async (_event: unknown) => {
    activeToolAnimations.clear();
    stopToolAnimationTicker();
    setActiveTool(null);
    settleActiveAssistantAvatar();
    setMood(turnHadError ? "concerned" : "pleased");
    if (uiCtx) { try { hideThinkingWidget(uiCtx); } catch { /* ignore */ } }
  });

  pi.on("session_shutdown", async (_event: unknown) => {
    activeToolAnimations.clear();
    stopToolAnimationTicker();
  });

  pi.registerCommand("nazar-ui", {
    description: "Show Nazar's terminal graphics backend status.",
    handler: async (args: string, ctx: any) => {
      const requested = args.trim().split(/\s+/).filter(Boolean)[0]?.toLowerCase();
      const validInputs = new Set(["", "basic", "hd", "auto", "ansi", "kitty", "status", "show", "help", "--help"]);

      if (requested && !validInputs.has(requested)) {
        try { ctx.ui.notify("Usage: /nazar-ui [basic|hd|auto|status].", "error"); } catch { /* ignore */ }
        return;
      }

      if (requested === "basic" || requested === "ansi") setGraphicsQuality("basic");
      if (requested === "hd" || requested === "kitty") setGraphicsQuality("hd");
      if (requested === "auto") setGraphicsQuality("auto");

      const mode = (requested === "basic" || requested === "ansi" || requested === "hd" || requested === "kitty" || requested === "auto")
        ? `Set Nazar UI to ${requested === "ansi" ? "basic" : requested === "kitty" ? "hd" : requested as GraphicsQuality}. `
        : "";
      const note = `${mode}Look: basic=ANSI cell avatars, hd=Kitty placeholder cell avatars. ${uiCapabilitySummary()}`;
      try { ctx.ui.notify(note, "info"); } catch { /* ignore */ }
      try { renderTui?.requestRender?.(); } catch { /* ignore */ }
    },
  });


  pi.registerCommand("nazar", {
    description: "About Nazar",
    handler: async (_args: string, ctx: any) => {
      const msg =
        "Nazar — your personal wise companion, installed as a Pi package. Local-first by default; " +
        "frontier models only when deliberately switched. Memory and life-tracking stay in your " +
        "Markdown vault. Manage the package with the host CLI: pi list · pi update npm:pi-nazar-studio, " +
        "then /reload.";
      try { ctx.ui.notify(msg, "info"); } catch { /* ignore */ }
    },
  });

  // /nazar-style — live style-guide: renders every panel, component, and
  // state so you can inspect the visual language in one shot and quickly
  // catch regressions. Output is injected as a custom notification block.
  pi.registerCommand("nazar-style", {
    description: "Show the Nazar terminal style guide — every panel, divider, and tool state.",
    handler: async (_args: string, ctx: any) => {
      const BOLD_ON = "\x1b[1m";
      const BOLD_OFF = "\x1b[22m";
      const width = Math.max(60, (process.stdout.columns ?? 80) - 4);

      function section(title: string): string {
        const s = panelStyle("system");
        return renderChapterDivider({ width, label: title, style: s });
      }
      function row(label: string, value: string): string {
        const s = panelStyle("system");
        const lv = `${BOLD_ON}${label}${BOLD_OFF}`;
        const pad = Math.max(1, width - visibleWidth(label) - visibleWidth(value));
        return `${s.paint.muted(lv)}${" ".repeat(pad)}${value}`;
      }
      function stitch(): string {
        return renderStitchLine({ width, style: panelStyle("system") });
      }

      const roles = ["user", "assistant", "tool", "thinking", "system"] as const;
      const states = ["idle", "running", "ok", "error", "warning"] as const;

      const lines: string[] = [];

      lines.push(section("role palettes"));
      for (const role of roles) {
        const s = panelStyle(role);
        const plaque = compact(`${s.paint.title(`✦ ${role.toUpperCase()}`)} ${s.paint.muted("· sample")}`, width - 2);
        const nameplate = `\x1b[48;2;${s.nameplateBg.join(";")}m ${plaque}${" ".repeat(Math.max(0, width - 2 - visibleWidth(plaque)))} \x1b[49m`;
        lines.push(nameplate);
      }

      lines.push(stitch());
      lines.push(section("tool states"));
      for (const st of states) {
        const s = panelStyle("tool", st);
        const accent = s.supports.pulse ? s.paint.pulse : s.paint.accent;
        lines.push(row(`tool / ${st}`, accent(`● ${st}`)));
      }

      lines.push(stitch());
      lines.push(section("chapter dividers"));
      const divStyles = ["assistant", "thinking", "system"] as const;
      const divLabels = ["session opened · 23:45", "context compacted", "branch summary"] as const;
      for (let i = 0; i < divStyles.length; i++) {
        lines.push(renderChapterDivider({ width, label: divLabels[i], style: panelStyle(divStyles[i]) }));
      }

      lines.push(stitch());
      lines.push(section("stitch lines"));
      for (const role of ["assistant", "user", "system"] as const) {
        lines.push(renderStitchLine({ width, style: panelStyle(role) }));
      }

      lines.push(stitch());
      lines.push(section("graphics + capabilities"));
      lines.push(row("backend", uiCapabilitySummary()));

      const guide = lines.join("\n");
      try { ctx.ui.notify(guide, "info"); } catch { /* ignore */ }
    },
  });
}
