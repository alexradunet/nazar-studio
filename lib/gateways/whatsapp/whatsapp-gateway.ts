// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/whatsapp/whatsapp-gateway.ts — a Gateway over Baileys.
 *
 * Translates the WhatsApp/Baileys world into the transport-agnostic Gateway
 * contract: connection.update → status/QR, messages.upsert → InboundMessage,
 * send() → sock.sendMessage. The Baileys socket is created via an injectable
 * factory (default: createBaileysSocket) so this unit-tests against a fake
 * socket with no Baileys installed. Auth + reconnect policy live here; the
 * persisted multi-file session means you only link the device once.
 */
import type {
  Gateway,
  GatewayStatus,
  InboundMessage,
  MessageHandler,
  OutboundMessage,
  QrHandler,
  SendResult,
  StatusHandler,
} from "../types.ts";
import { createBaileysSocket, type SocketFactory, type WAMessageLike, type WASocketLike } from "./socket.ts";
import { extractText, toMillis } from "./text.ts";

/** Baileys DisconnectReason.loggedOut — the one close we must NOT auto-reconnect. */
const LOGGED_OUT = 401;

export interface WhatsAppGatewayOptions {
  /** Directory holding the persisted linked-device session (gitignored). */
  sessionDir: string;
  /** "qr" (default) shows a QR; "pairing" requests a code for pairingNumber. */
  authMode?: "qr" | "pairing";
  /** Nazar's own WhatsApp number, required only for pairing-code auth. */
  pairingNumber?: string;
  /** Injectable socket factory (tests pass a fake). */
  socketFactory?: SocketFactory;
  /** Delay before reconnecting after a non-fatal close (default 2000ms). */
  reconnectDelayMs?: number;
  log?: (message: string) => void;
}

export class WhatsAppGateway implements Gateway {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";

  private readonly opts: WhatsAppGatewayOptions;
  private readonly factory: SocketFactory;
  private socket?: WASocketLike;
  private state: GatewayStatus = "disconnected";
  private closing = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  private readonly messageHandlers: MessageHandler[] = [];
  private readonly statusHandlers: StatusHandler[] = [];
  private readonly qrHandlers: QrHandler[] = [];

  constructor(opts: WhatsAppGatewayOptions) {
    this.opts = opts;
    this.factory = opts.socketFactory ?? createBaileysSocket;
  }

  status(): GatewayStatus {
    return this.state;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onStatus(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  onQr(handler: QrHandler): void {
    this.qrHandlers.push(handler);
  }

  async connect(): Promise<void> {
    this.closing = false;
    await this.start();
  }

  private async start(): Promise<void> {
    this.setStatus("connecting");
    let result;
    try {
      result = await this.factory({ sessionDir: this.opts.sessionDir });
    } catch (err) {
      this.setStatus("error", String(err));
      throw err;
    }

    const { socket, saveCreds, registered } = result;
    this.socket = socket;

    socket.ev.on("creds.update", () => {
      void saveCreds();
    });
    socket.ev.on("connection.update", (update: any) => this.onConnectionUpdate(update));
    socket.ev.on("messages.upsert", (event: any) => this.onMessagesUpsert(event));

    if (
      this.opts.authMode === "pairing" &&
      !registered &&
      this.opts.pairingNumber &&
      typeof socket.requestPairingCode === "function"
    ) {
      try {
        const code = await socket.requestPairingCode(this.opts.pairingNumber.replace(/\D/g, ""));
        this.log(`pairing code: ${code} — WhatsApp → Linked Devices → Link with phone number.`);
      } catch (err) {
        this.log(`pairing code request failed: ${String(err)}`);
      }
    }
  }

  private onConnectionUpdate(update: any): void {
    const qr: string | undefined = update?.qr;
    if (qr) {
      this.setStatus("qr");
      for (const handler of this.qrHandlers) handler(qr);
    }

    const connection: string | undefined = update?.connection;
    if (connection === "connecting") {
      this.setStatus("connecting");
    } else if (connection === "open") {
      this.setStatus("connected");
    } else if (connection === "close") {
      const code: number | undefined = update?.lastDisconnect?.error?.output?.statusCode;
      if (code === LOGGED_OUT) {
        this.setStatus("disconnected", "logged out");
        this.log("logged out — delete the session dir to re-link the device.");
      } else if (!this.closing) {
        this.setStatus("connecting", "reconnecting");
        this.scheduleReconnect();
      } else {
        this.setStatus("disconnected");
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.closing) return;
    const delay = this.opts.reconnectDelayMs ?? 2000;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.closing) return;
      void this.start().catch((err) => this.log(`reconnect failed: ${String(err)}`));
    }, delay);
  }

  private onMessagesUpsert(event: any): void {
    if (event?.type !== "notify") return;
    const messages: WAMessageLike[] = Array.isArray(event.messages) ? event.messages : [];
    for (const m of messages) {
      if (!m?.message || m.key?.fromMe) continue;
      const remoteJid = m.key?.remoteJid;
      if (!remoteJid || remoteJid === "status@broadcast") continue;
      const text = extractText(m.message);
      if (!text) continue; // PR3 can add media; v1 relays text only
      const inbound: InboundMessage = {
        gatewayId: this.id,
        chatId: remoteJid,
        senderId: m.key?.participant || remoteJid,
        senderName: m.pushName || undefined,
        text,
        timestamp: toMillis(m.messageTimestamp),
        messageId: m.key?.id || undefined,
        raw: m,
      };
      for (const handler of this.messageHandlers) handler(inbound);
    }
  }

  async send(chatId: string, message: OutboundMessage): Promise<SendResult> {
    if (!this.socket) return { ok: false, error: "not connected" };
    try {
      const result = await this.socket.sendMessage(chatId, { text: message.text });
      return { ok: true, messageId: result?.key?.id ?? undefined };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async sendPresence(chatId: string, presence: "composing" | "paused"): Promise<void> {
    try {
      await this.socket?.sendPresenceUpdate(presence, chatId);
    } catch {
      /* best effort */
    }
  }

  async markRead(chatId: string, messageId: string): Promise<void> {
    try {
      await this.socket?.readMessages([{ remoteJid: chatId, id: messageId, fromMe: false }]);
    } catch {
      /* best effort */
    }
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    try {
      this.socket?.end?.(undefined);
    } catch {
      /* ignore */
    }
    this.socket = undefined;
    this.setStatus("disconnected");
  }

  private setStatus(status: GatewayStatus, detail?: string): void {
    this.state = status;
    for (const handler of this.statusHandlers) handler(status, detail);
  }

  private log(message: string): void {
    this.opts.log?.(`[whatsapp] ${message}`);
  }
}
