// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/types.ts — the messaging-gateway abstraction.
 *
 * A Gateway is a thin transport that bridges an external chat app to Balaur. It
 * deliberately knows nothing about the agent runtime: it only emits inbound messages and accepts outbound
 * ones. The GatewayManager (manager.ts) owns all policy (master lock, routing,
 * status). Keeping this surface tiny is what lets a second gateway slot in
 * without touching the core.
 */

/** Stable identifier for a transport, e.g. "fake" or a future adapter id. */
export type GatewayId = string;

/** Connection lifecycle a gateway moves through. */
export type GatewayStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** A message received from the remote chat app. */
export interface InboundMessage {
  gatewayId: GatewayId;
  /** Conversation id to reply to. For 1:1 == senderId. */
  chatId: string;
  /** Identity of the sender; checked against the lock. */
  senderId: string;
  /** Human-friendly display name, when the transport provides one. */
  senderName?: string;
  text: string;
  /** Epoch ms when the message was sent/received. */
  timestamp: number;
  /** Transport message id (for reactions/read receipts), when available. */
  messageId?: string;
  /** Raw transport payload, for transport-specific handling. */
  raw?: unknown;
}

/** Kind of outbound payload — lets the transport style answers vs. status. */
export type OutboundKind = "answer" | "status" | "error" | "notice";

/** A message to send back to the remote chat app. */
export interface OutboundMessage {
  kind: OutboundKind;
  text: string;
}

/** Result of an outbound send. */
export interface SendResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

export type MessageHandler = (message: InboundMessage) => void;
export type StatusHandler = (status: GatewayStatus, detail?: string) => void;

/**
 * The transport contract. Implementations are constructed lazily and only when
 * the gateway is enabled, so heavy transport dependencies are never loaded for
 * users who don't opt in.
 */
export interface Gateway {
  readonly id: GatewayId;
  /** Display label for status lines. */
  readonly label: string;

  status(): GatewayStatus;

  /** Start the client and (re)authenticate. Resolves once usable or rejects. */
  connect(): Promise<void>;
  /** Tear down the client. Safe to call when already disconnected. */
  disconnect(): Promise<void>;

  /** Send a message to a conversation. */
  send(chatId: string, message: OutboundMessage): Promise<SendResult>;

  onMessage(handler: MessageHandler): void;
  onStatus(handler: StatusHandler): void;

  /** Optional UX niceties; transports that lack them simply omit them. */
  sendPresence?(chatId: string, state: "composing" | "paused"): Promise<void> | void;
  markRead?(chatId: string, messageId: string): Promise<void> | void;
}
