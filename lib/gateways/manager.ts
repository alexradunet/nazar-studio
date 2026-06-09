// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/manager.ts — bridges a Gateway to Pi's agent loop.
 *
 * Transport-agnostic AND Pi-agnostic (so it unit-tests without either): the
 * extension wires the real pi.* events and gateway callbacks to these methods
 * (see install.ts). Responsibilities:
 *
 *  - enforce the master lock on inbound messages;
 *  - recognise control commands (/abort, /compact, /status);
 *  - inject authorised messages into Pi via the injector with
 *    deliverAs: "followUp" — so Pi's own turn machinery serialises local +
 *    remote input. That is the whole "dual control, turns queued" behaviour;
 *    we do NOT reimplement a busy-queue here;
 *  - track which turn originated from the gateway and route that turn's
 *    assistant replies (plus a compact working/done status) back to the chat.
 *
 * Turn-origin tracking: when we inject a message we remember its exact text.
 * before_agent_start hands us the turn's prompt; if it matches a pending
 * injected text the turn is gateway-originated (route its output), otherwise
 * it's a local turn (stays quiet unless mirrorLocal). Matching the exact text
 * is robust against interleaving of local and remote turns.
 */
import type { InboundMessage, OutboundMessage, SendResult } from "./types.ts";
import type { MasterLock } from "./lock.ts";

export type TurnOrigin = "gateway" | "local";
export type GatewayCommand = "abort" | "compact" | "status";

export type InboundOutcome =
  | { action: "inject"; text: string }
  | { action: "ignore"; reason: "unauthorized" | "empty" }
  | { action: "command"; command: GatewayCommand; chatId: string };

/** Injects a prompt into Pi (wired to pi.sendUserMessage). */
export type Injector = (text: string, options: { deliverAs: "followUp" | "steer" }) => void;
/** Sends an outbound message (wired to gateway.send). */
export type Sender = (chatId: string, message: OutboundMessage) => Promise<SendResult> | void;

export interface GatewayManagerOptions {
  lock: MasterLock;
  inject: Injector;
  send: Sender;
  /** Echo local-terminal turns to the chat too (default false). */
  mirrorLocal?: boolean;
  /** Build the prompt injected into Pi from an inbound message. */
  formatInbound?: (message: InboundMessage) => string;
  /** Compact per-turn status text; return undefined to suppress that ping. */
  statusText?: (phase: "working" | "done") => string | undefined;
  log?: (message: string) => void;
}

const DEFAULT_STATUS: Record<"working" | "done", string | undefined> = {
  working: "⚙️ Working…",
  done: "✓ Done",
};

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
    // Authorised: remember where to route replies.
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
      // Prompt text unavailable: best-effort FIFO fallback.
      this.pendingInjected.shift();
      origin = "gateway";
    }
    this.currentOrigin = origin;
    if (this.shouldRoute()) this.sendStatus("working");
  }

  /** Call on each assistant message_end with the joined text content. */
  handleAssistantMessage(text: string): void {
    if (!this.shouldRoute()) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    this.dispatch({ kind: "answer", text: trimmed });
  }

  /** Call on agent_end. */
  handleTurnEnd(): void {
    if (this.shouldRoute()) this.sendStatus("done");
    this.currentOrigin = null;
  }

  private shouldRoute(): boolean {
    if (!this.lastChatId) return false;
    return this.currentOrigin === "gateway" || this.opts.mirrorLocal === true;
  }

  private sendStatus(phase: "working" | "done"): void {
    const text = this.opts.statusText ? this.opts.statusText(phase) : DEFAULT_STATUS[phase];
    if (!text) return;
    this.dispatch({ kind: "status", text });
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
