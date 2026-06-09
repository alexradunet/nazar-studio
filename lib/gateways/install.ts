// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/install.ts — the gateway controller.
 *
 * Registers Pi's lifecycle handlers ONCE and supports runtime connect /
 * disconnect / reconfigure, so the whole gateway can be set up and driven from
 * inside Pi via the /nazar-whatsapp command (no env files required). Lifecycle
 * events delegate to the currently-active manager (which is null while
 * disconnected), and a freshly-created gateway's callbacks are wired through
 * stable controller methods so reconfiguring never double-subscribes.
 *
 * The Baileys socket factory is injectable (`deps.createGateway`) for tests.
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { Gateway, GatewayStatus, InboundMessage } from "./types.ts";
import { GatewayManager } from "./manager.ts";
import { MasterLock } from "./lock.ts";
import { createGateway as defaultCreateGateway, type CreateGatewayDeps } from "./factory.ts";
import type { GatewayConfig } from "./config.ts";
import { resolveEffectiveConfig, saveStoredConfig, type EffectiveConfig, type StoredConfig } from "./config-store.ts";
import { renderQrAscii } from "./qr.ts";

interface CtxLike {
  abort?: () => void;
  compact?: () => void;
  ui?: {
    notify?: (message: string, level?: string) => void;
    setStatus?: (key: string, text: string | undefined) => void;
    custom?: <T>(
      factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (value: T) => void) => Component,
      options?: unknown,
    ) => Promise<T>;
  };
}

export interface GatewayController {
  registerLifecycle(): void;
  getConfig(): EffectiveConfig;
  saveConfig(patch: StoredConfig): EffectiveConfig;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  logoff(): Promise<void>;
  isConnected(): boolean;
  statusText(): string;
}

export interface GatewayControllerDeps {
  log?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
  createGateway?: (config: GatewayConfig, deps: CreateGatewayDeps) => Gateway | undefined;
}

function piLog(pi: ExtensionAPI, message: string): void {
  (pi as unknown as { log?: (message: string) => void }).log?.(message);
}

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

interface QrOverlay extends Component {
  setQr(ascii: string): void;
  close(): void;
}

function fitLine(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

function createQrOverlay(initialQr: string, onClose: () => void): QrOverlay {
  let qr = initialQr;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    onClose();
  };

  return {
    setQr(ascii: string) {
      qr = ascii;
    },
    close,
    render(width: number): string[] {
      const inner = Math.max(24, width - 2);
      const body = [
        "WhatsApp link QR",
        "",
        "Phone: WhatsApp → Linked Devices → Link a device",
        "Scan this code. It refreshes automatically.",
        "Press q or Esc to close this popup.",
        "",
        ...qr.split("\n"),
      ];
      return [
        `┌${"─".repeat(inner)}┐`,
        ...body.map((line) => `│${fitLine(line, inner)}│`),
        `└${"─".repeat(inner)}┘`,
      ];
    },
    handleInput(data: string): void {
      if (data === "q" || data === "\u001b" || data === "\u0003") close();
    },
    invalidate(): void {
      // No cached render state.
    },
  };
}

export function createGatewayController(pi: ExtensionAPI, deps: GatewayControllerDeps = {}): GatewayController {
  const env = deps.env ?? process.env;
  const make = deps.createGateway ?? defaultCreateGateway;
  const log = (message: string) => (deps.log ? deps.log(message) : piLog(pi, message));

  let config: EffectiveConfig = resolveEffectiveConfig(env);
  let gateway: Gateway | undefined;
  let manager: GatewayManager | undefined;
  let ctxRef: CtxLike | undefined;
  let qrOverlay: QrOverlay | undefined;
  let qrOverlayHandle: { requestRender?: () => void; focus?: () => void } | undefined;

  const refreshConfig = (): EffectiveConfig => {
    config = resolveEffectiveConfig(env);
    return config;
  };

  const rebuildManager = (): void => {
    manager = new GatewayManager({
      lock: new MasterLock(config.owner),
      inject: (text, options) => pi.sendUserMessage(text, options),
      send: (chatId, message) => (gateway ? gateway.send(chatId, message) : undefined),
      presence: (chatId, state) => {
        void gateway?.sendPresence?.(chatId, state);
      },
      mirrorLocal: config.mirrorLocal,
      toolPings: config.toolPings,
      log,
    });
  };

  const onInbound = (message: InboundMessage): void => {
    const outcome = manager?.handleInbound(message);
    if (!outcome || outcome.action !== "command") return;
    try {
      if (outcome.command === "abort") ctxRef?.abort?.();
      else if (outcome.command === "compact") ctxRef?.compact?.();
      else if (outcome.command === "status" && gateway) {
        void gateway.send(outcome.chatId, { kind: "status", text: `Status: ${gateway.label} ${gateway.status()}` });
      }
    } catch (err) {
      log(`command "${outcome.command}" failed: ${String(err)}`);
    }
  };

  const closeQrOverlay = (): void => {
    qrOverlay?.close();
    qrOverlay = undefined;
    qrOverlayHandle = undefined;
  };

  const showQrOverlay = (ascii: string): boolean => {
    const custom = ctxRef?.ui?.custom;
    if (!custom) return false;
    if (qrOverlay) {
      qrOverlay.setQr(ascii);
      qrOverlayHandle?.requestRender?.();
      qrOverlayHandle?.focus?.();
      return true;
    }

    void custom<void>(
      (_tui, _theme, _keybindings, done) => {
        qrOverlay = createQrOverlay(ascii, () => {
          qrOverlay = undefined;
          qrOverlayHandle = undefined;
          done();
        });
        return qrOverlay;
      },
      {
        overlay: true,
        overlayOptions: { anchor: "center", width: 58, maxHeight: "90%", margin: 1 },
        onHandle: (handle: { requestRender?: () => void; focus?: () => void }) => {
          qrOverlayHandle = handle;
          handle.focus?.();
        },
      },
    ).catch((err) => log(`QR popup failed: ${String(err)}`));
    return true;
  };

  const onStatus = (status: GatewayStatus): void => {
    ctxRef?.ui?.setStatus?.("gateway", `WhatsApp: ${status}`);
    if (status === "connected" || status === "disconnected" || status === "error") closeQrOverlay();
  };

  const onQr = (qr: string): void => {
    void (async () => {
      const ascii = await renderQrAscii(qr);
      const text = `Link WhatsApp: open WhatsApp → Linked Devices → Link a device, then scan:\n\n${ascii}`;
      log(text);
      if (!showQrOverlay(ascii)) ctxRef?.ui?.notify?.(text, "info");
    })();
  };

  const toGatewayConfig = (): GatewayConfig => ({
    enabled: true,
    gateway: config.gateway || "whatsapp",
    owner: config.owner,
    mirrorLocal: config.mirrorLocal,
    sessionDir: config.sessionDir,
    authMode: config.authMode,
    pairingNumber: config.pairingNumber,
    toolPings: config.toolPings,
    autoConnect: config.autoConnect,
  });

  const controller: GatewayController = {
    registerLifecycle() {
      pi.on("session_start", async (_event: any, ctx: any) => {
        ctxRef = ctx;
        refreshConfig();
        if (config.configured && config.autoConnect && existsSync(join(config.sessionDir, "creds.json"))) {
          await controller.connect();
        } else if (config.configured) {
          ctxRef?.ui?.setStatus?.("gateway", "WhatsApp: configured");
        }
      });
      pi.on("before_agent_start", async (event: any, ctx: any) => {
        ctxRef = ctx;
        manager?.handleTurnStart(typeof event?.prompt === "string" ? event.prompt : undefined);
      });
      pi.on("message_end", async (event: any) => {
        if (event?.message?.role === "assistant") manager?.handleAssistantMessage(assistantText(event.message));
      });
      pi.on("agent_end", async () => {
        manager?.handleTurnEnd();
      });
      pi.on("tool_execution_start", async (event: any) => {
        manager?.handleToolActivity(event?.toolName);
      });
      pi.on("session_shutdown", async () => {
        await controller.disconnect();
      });
    },

    getConfig() {
      return config;
    },

    saveConfig(patch) {
      saveStoredConfig(patch);
      refreshConfig();
      if (gateway) rebuildManager();
      return config;
    },

    async connect() {
      refreshConfig();
      if (!config.configured) {
        ctxRef?.ui?.notify?.("Set your number first: /nazar-whatsapp → Set my number.", "error");
        return;
      }
      if (!gateway) {
        const gw = make(toGatewayConfig(), { log });
        if (!gw) {
          ctxRef?.ui?.notify?.("WhatsApp gateway unavailable — is the optional 'baileys' package installed?", "error");
          return;
        }
        gateway = gw;
        gw.onMessage(onInbound);
        gw.onStatus(onStatus);
        gw.onQr(onQr);
      }
      rebuildManager();
      try {
        await gateway.connect();
      } catch (err) {
        log(`connect failed: ${String(err)}`);
      }
    },

    async disconnect() {
      const gw = gateway;
      gateway = undefined;
      manager = undefined;
      if (gw) {
        try {
          await gw.disconnect();
        } catch (err) {
          log(`disconnect failed: ${String(err)}`);
        }
      }
    },

    async logoff() {
      await controller.disconnect();
      try {
        if (existsSync(config.sessionDir)) rmSync(config.sessionDir, { recursive: true, force: true });
      } catch (err) {
        log(`logoff cleanup failed: ${String(err)}`);
      }
    },

    isConnected() {
      return gateway?.status() === "connected";
    },

    statusText() {
      if (gateway) return `WhatsApp: ${gateway.status()}`;
      return config.configured ? "WhatsApp: configured (not connected)" : "WhatsApp: not configured";
    },
  };

  return controller;
}
