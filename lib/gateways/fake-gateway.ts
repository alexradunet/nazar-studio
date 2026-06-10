// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/fake-gateway.ts — an in-memory Gateway for tests and a wiring smoke
 * (BALAUR_GATEWAY=fake). It records outbound messages and lets callers inject
 * inbound ones via emit(). It never touches the network.
 */
import type {
  Gateway,
  GatewayStatus,
  InboundMessage,
  MessageHandler,
  OutboundMessage,
  SendResult,
  StatusHandler,
} from "./types.ts";

export interface RecordedSend {
  chatId: string;
  message: OutboundMessage;
}

export class FakeGateway implements Gateway {
  readonly id = "fake";
  readonly label = "Fake";
  readonly sent: RecordedSend[] = [];

  private state: GatewayStatus = "disconnected";
  private readonly messageHandlers: MessageHandler[] = [];
  private readonly statusHandlers: StatusHandler[] = [];

  status(): GatewayStatus {
    return this.state;
  }

  async connect(): Promise<void> {
    this.setStatus("connected");
  }

  async disconnect(): Promise<void> {
    this.setStatus("disconnected");
  }

  async send(chatId: string, message: OutboundMessage): Promise<SendResult> {
    this.sent.push({ chatId, message });
    return { ok: true, messageId: `fake-${this.sent.length}` };
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onStatus(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  // --- test / dev helpers (not part of the Gateway contract) ---

  setStatus(status: GatewayStatus, detail?: string): void {
    this.state = status;
    for (const handler of this.statusHandlers) handler(status, detail);
  }

  /** Simulate an inbound message; fills sensible defaults. */
  emit(message: Partial<InboundMessage> & { text: string; senderId: string }): InboundMessage {
    const full: InboundMessage = {
      gatewayId: this.id,
      chatId: message.chatId ?? message.senderId,
      senderId: message.senderId,
      senderName: message.senderName,
      text: message.text,
      timestamp: message.timestamp ?? Date.now(),
      messageId: message.messageId,
      raw: message.raw,
    };
    for (const handler of this.messageHandlers) handler(full);
    return full;
  }

  lastSent(): RecordedSend | undefined {
    return this.sent[this.sent.length - 1];
  }
}
