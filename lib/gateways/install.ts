// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/install.ts — wire a Gateway + GatewayManager into Pi's lifecycle.
 *
 * Kept separate from the extension entry so it can be unit-tested with a fake
 * `pi`. The mapping is intentionally thin: Pi events → manager methods, gateway
 * inbound → manager, manager output → gateway, gateway QR/status → Pi's UI. All
 * policy lives in the manager.
 *
 * Pi 0.78.x surface used here (verified against the installed type defs):
 *   - pi.on("session_start" | "before_agent_start" | "message_end" |
 *           "agent_end" | "session_shutdown", handler)
 *   - pi.sendUserMessage(text, { deliverAs }) — via the manager's injector
 *   - ctx.abort() / ctx.compact() — for chat-control commands
 *   - ctx.ui.notify() / ctx.ui.setStatus() — for QR + connection status
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Gateway } from "./types.ts";
import { GatewayManager } from "./manager.ts";
import { renderQrAscii } from "./qr.ts";

export interface InstalledGateway {
  gateway: Gateway;
  manager: GatewayManager;
  dispose: () => Promise<void>;
}

interface CtxLike {
  abort?: () => void;
  compact?: () => void;
  ui?: {
    notify?: (message: string, level?: string) => void;
    setStatus?: (key: string, text: string | undefined) => void;
  };
}

/** `pi.log` is not on the typed surface; mirror the codebase's cast pattern. */
function piLog(pi: ExtensionAPI, message: string): void {
  (pi as unknown as { log?: (message: string) => void }).log?.(message);
}

/** Join the text blocks of an assistant message into a single string. */
function assistantText(message: unknown): string {
  const m = message as { content?: unknown; text?: unknown };
  if (Array.isArray(m?.content)) {
    return m.content
      .filter((c: { type?: string; text?: unknown }) => c?.type === "text" && typeof c.text === "string")
      .map((c: { text: string }) => c.text)
      .join("\n");
  }
  return typeof m?.text === "string" ? m.text : "";
}

export function installGateway(
  pi: ExtensionAPI,
  gateway: Gateway,
  manager: GatewayManager,
): InstalledGateway {
  // Captured from the latest lifecycle event so chat-commands and UI surfacing
  // can act on the live session (ctx.abort / ctx.compact / ctx.ui).
  let ctxRef: CtxLike | undefined;

  gateway.onMessage((message) => {
    const outcome = manager.handleInbound(message);
    if (outcome.action !== "command") return;
    try {
      if (outcome.command === "abort") {
        ctxRef?.abort?.();
      } else if (outcome.command === "compact") {
        ctxRef?.compact?.();
      } else if (outcome.command === "status") {
        void gateway.send(outcome.chatId, { kind: "status", text: `Status: ${gateway.label} ${gateway.status()}` });
      }
    } catch (err) {
      piLog(pi, `[gateway] command "${outcome.command}" failed: ${String(err)}`);
    }
  });

  gateway.onStatus((status) => {
    ctxRef?.ui?.setStatus?.("gateway", `${gateway.label}: ${status}`);
  });

  gateway.onQr((qr) => {
    void (async () => {
      const ascii = await renderQrAscii(qr);
      const text = `Link ${gateway.label}: open WhatsApp → Linked Devices → Link a device, then scan:\n\n${ascii}`;
      if (ctxRef?.ui?.notify) ctxRef.ui.notify(text, "info");
      else piLog(pi, text);
    })();
  });

  pi.on("session_start", async (_event: any, ctx: any) => {
    ctxRef = ctx;
    try {
      await gateway.connect();
    } catch (err) {
      piLog(pi, `[gateway] connect failed: ${String(err)}`);
    }
  });

  pi.on("before_agent_start", async (event: any, ctx: any) => {
    ctxRef = ctx;
    manager.handleTurnStart(typeof event?.prompt === "string" ? event.prompt : undefined);
  });

  pi.on("message_end", async (event: any) => {
    if (event?.message?.role !== "assistant") return;
    manager.handleAssistantMessage(assistantText(event.message));
  });

  pi.on("agent_end", async () => {
    manager.handleTurnEnd();
  });

  pi.on("tool_execution_start", async (event: any) => {
    manager.handleToolActivity(event?.toolName);
  });

  pi.on("session_shutdown", async () => {
    try {
      await gateway.disconnect();
    } catch (err) {
      piLog(pi, `[gateway] disconnect failed: ${String(err)}`);
    }
  });

  return {
    gateway,
    manager,
    dispose: async () => {
      await gateway.disconnect();
    },
  };
}
