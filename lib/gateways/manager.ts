// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/manager.ts — transport-agnostic gateway routing.
 *
 * The future Balaur runtime adapter should wire runtime events and gateway
 * callbacks to these methods. Responsibilities:
 *
 *  - enforce the master lock on inbound messages;
 *  - recognise control commands (/abort, /compact, /status);
 *  - inject authorised messages into the runtime via the injector with
 *    deliverAs: "followUp" — so local and remote input stay serialized;
 *  - track which turn originated from the gateway and route that turn's output
 *    back to the chat as COMPACT status: a typing indicator while working, the
 *    answer(s), and a short "done" note only when a turn produced no answer
 *    (so an answered turn isn't followed by a redundant ping). Optional,
 *    throttled per-tool pings can be enabled for noisier visibility.
 *
 * Turn-origin tracking: when we inject a message we remember its exact text.
 * The runtime adapter hands us the turn's prompt; if it matches a pending
 * injected text the turn is gateway-originated (route its output), otherwise
 * it's a local turn (stays quiet unless mirrorLocal).
 */
import type { InboundMessage, OutboundMessage, SendResult } from "./types.ts";
import type { MasterLock } from "./lock.ts";

export type TurnOrigin = "gateway" | "local";
export type GatewayCommand = "abort" | "compact" | "status";

export type InboundOutcome =
  | { action: "inject"; text: string }
  | { action: "ignore"; reason: "unauthorized" | "empty" }
  | { action: "command"; command: GatewayCommand; chatId: string };

/** Injects a prompt into Balaur's runtime queue. */
export type Injector = (text: string, options: { deliverAs: "followUp" | "steer" }) => void;
/** Sends an outbound message (wired to gateway.send). */
export type Sender = (chatId: string, message: OutboundMessage) => Promise<SendResult> | void;
/** Sets a typing/paused presence (wired to gateway.sendPresence). */
export type PresenceSink = (chatId: string, state: "composing" | "paused") => void;

export interface GatewayManagerOptions {
  lock: MasterLock;
  inject: Injector;
  send: Sender;
  /** Typing-indicator sink — the "working" signal. Optional. */
  presence?: PresenceSink;
  /** Echo local-terminal turns to the chat too (default false). */
  mirrorLocal?: boolean;
  /** Build the prompt injected into Pi from an inbound message. */
  formatInbound?: (message: InboundMessage) => string;
  /** Note sent only when a routed turn produced no answer (default "✓ done"). */
  doneNote?: string;
  /** Send throttled per-tool activity pings (default false). */
  toolPings?: boolean;
  /** Minimum gap between tool pings in ms (default 4000). */
  toolPingThrottleMs?: number;
  log?: (message: string) => void;
}

function defaultFormatInbound(message: InboundMessage): string {
  const who = message.senderName?.trim();
  // A readable header so the model knows the turn came from a remote chat; the
  // exact string is also what handleTurnStart matches to detect origin.
  return who ? `Message from ${who}:\n${message.text}` : message.text;
}

export class GatewayManager {
  private readonly opts: GatewayManagerOptions;
  private lastChatId: string | undefined;
  private currentOrigin: TurnOrigin | null = null;
  private answeredThisTurn = false;
  private lastToolPingAt = 0;
  /** Texts injected from the gateway, awaiting their before_agent_start. */
  private readonly pendingInjected: string[] = [];

  constructor(opts: GatewayManagerOptions) {
    this.opts = opts;
  }

  /** Where replies route (the last authorised chat); undefined until first msg. */
  get replyChatId(): string | undefined {
    return this.lastChatId;
  }

  private parseCommand(text: string): GatewayCommand | undefined {
    const t = text.trim().toLowerCase();
    if (t === "/abort" || t.startsWith("/abort ")) return "abort";
    if (t === "/compact" || t.startsWith("/compact ")) return "compact";
    if (t === "/status" || t.startsWith("/status ")) return "status";
    return undefined;
  }

  /** Call for every inbound transport message. */
  handleInbound(message: InboundMessage): InboundOutcome {
    if (!this.opts.lock.isAuthorized(message.senderId)) {
      this.opts.log?.(`[gateway] ignored message from unauthorized sender ${message.senderId}`);
      return { action: "ignore", reason: "unauthorized" };
    }
    this.lastChatId = message.chatId;

    const command = this.parseCommand(message.text);
    if (command) return { action: "command", command, chatId: message.chatId };

    if (!message.text.trim()) return { action: "ignore", reason: "empty" };

    const format = this.opts.formatInbound ?? defaultFormatInbound;
    const text = format(message);
    this.pendingInjected.push(text);
    this.opts.inject(text, { deliverAs: "followUp" });
    return { action: "inject", text };
  }

  /** Call on before_agent_start; `prompt` is the turn's user prompt if known. */
  handleTurnStart(prompt?: string): void {
    let origin: TurnOrigin = "local";
    if (prompt !== undefined) {
      const idx = this.pendingInjected.indexOf(prompt);
      if (idx >= 0) {
        this.pendingInjected.splice(idx, 1);
        origin = "gateway";
      }
    } else if (this.pendingInjected.length > 0) {
      this.pendingInjected.shift();
      origin = "gateway";
    }
    this.currentOrigin = origin;
    this.answeredThisTurn = false;
    this.lastToolPingAt = 0;
    if (this.shouldRoute()) this.signalPresence("composing"); // "working" = typing
  }

  /** Call on each assistant message_end with the joined text content. */
  handleAssistantMessage(text: string): void {
    if (!this.shouldRoute()) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    this.answeredThisTurn = true;
    this.dispatch({ kind: "answer", text: trimmed });
  }

  /** Call on tool_execution_start; sends a throttled ping when enabled. */
  handleToolActivity(toolName?: string): void {
    if (!this.shouldRoute() || !this.opts.toolPings) return;
    const now = Date.now();
    const throttle = this.opts.toolPingThrottleMs ?? 4000;
    if (now - this.lastToolPingAt < throttle) return;
    this.lastToolPingAt = now;
    this.dispatch({ kind: "status", text: toolName ? `running ${toolName}…` : "working…" });
  }

  /** Call on agent_end. */
  handleTurnEnd(): void {
    if (this.shouldRoute()) {
      this.signalPresence("paused");
      if (!this.answeredThisTurn) {
        this.dispatch({ kind: "status", text: this.opts.doneNote ?? "✓ done" });
      }
    }
    this.currentOrigin = null;
  }

  private shouldRoute(): boolean {
    if (!this.lastChatId) return false;
    return this.currentOrigin === "gateway" || this.opts.mirrorLocal === true;
  }

  private signalPresence(state: "composing" | "paused"): void {
    const chatId = this.lastChatId;
    if (chatId) this.opts.presence?.(chatId, state);
  }

  private dispatch(message: OutboundMessage): void {
    const chatId = this.lastChatId;
    if (!chatId) return;
    try {
      const result = this.opts.send(chatId, message);
      if (result && typeof (result as Promise<SendResult>).then === "function") {
        (result as Promise<SendResult>).then(
          (res) => {
            if (res && !res.ok) this.opts.log?.(`[gateway] send failed: ${res.error ?? "unknown"}`);
          },
          (err) => this.opts.log?.(`[gateway] send rejected: ${String(err)}`),
        );
      }
    } catch (err) {
      this.opts.log?.(`[gateway] send threw: ${String(err)}`);
    }
  }
}
