// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, test } from "vitest";
import { WhatsAppGateway, type WhatsAppGatewayOptions } from "./whatsapp-gateway.ts";
import type { SocketFactory, WASocketLike } from "./socket.ts";
import type { GatewayStatus, InboundMessage } from "../types.ts";

class FakeSock implements WASocketLike {
  listeners: Record<string, ((arg: any) => void)[]> = {};
  sent: { jid: string; text: string }[] = [];
  presence: { presence: string; jid?: string }[] = [];
  reads: any[][] = [];
  ended = false;
  pairingArg?: string;

  ev = {
    on: (event: string, listener: (arg: any) => void) => {
      (this.listeners[event] ??= []).push(listener);
    },
  };

  emit(event: string, arg: any): void {
    for (const l of this.listeners[event] ?? []) l(arg);
  }

  async sendMessage(jid: string, content: { text: string }) {
    this.sent.push({ jid, text: content.text });
    return { key: { id: `wamid-${this.sent.length}` } };
  }
  async sendPresenceUpdate(presence: string, jid?: string) {
    this.presence.push({ presence, jid });
  }
  async readMessages(keys: any[]) {
    this.reads.push(keys);
  }
  async requestPairingCode(phoneNumber: string) {
    this.pairingArg = phoneNumber;
    return "ABCD-1234";
  }
  end() {
    this.ended = true;
  }
}

let live: WhatsAppGateway | undefined;
afterEach(async () => {
  await live?.disconnect();
  live = undefined;
});

function setup(opts: { registered?: boolean } & Partial<WhatsAppGatewayOptions> = {}) {
  const sock = new FakeSock();
  let savedCreds = 0;
  const logs: string[] = [];
  const factory: SocketFactory = async () => ({
    socket: sock,
    saveCreds: async () => {
      savedCreds++;
    },
    registered: opts.registered ?? false,
  });
  const gw = new WhatsAppGateway({
    sessionDir: "/tmp/nazar-test",
    reconnectDelayMs: 60_000,
    socketFactory: factory,
    log: (m) => logs.push(m),
    ...opts,
  });
  live = gw;
  return { sock, gw, logs, getSaved: () => savedCreds };
}

describe("WhatsAppGateway", () => {
  test("connect wires handlers and reports connecting", async () => {
    const { gw, sock } = setup();
    const statuses: GatewayStatus[] = [];
    gw.onStatus((s) => statuses.push(s));
    await gw.connect();
    expect(statuses).toContain("connecting");
    expect(Object.keys(sock.listeners).sort()).toEqual(["connection.update", "creds.update", "messages.upsert"]);
  });

  test("connection.update surfaces QR then connected", async () => {
    const { gw, sock } = setup();
    const qrs: string[] = [];
    const statuses: GatewayStatus[] = [];
    gw.onQr((q) => qrs.push(q));
    gw.onStatus((s) => statuses.push(s));
    await gw.connect();
    sock.emit("connection.update", { qr: "QR-PAYLOAD" });
    sock.emit("connection.update", { connection: "open" });
    expect(qrs).toEqual(["QR-PAYLOAD"]);
    expect(gw.status()).toBe("connected");
    expect(statuses).toContain("qr");
  });

  test("emits inbound for a text message from others; ignores own/broadcast/non-text", async () => {
    const { gw, sock } = setup();
    const inbox: InboundMessage[] = [];
    gw.onMessage((m) => inbox.push(m));
    await gw.connect();
    sock.emit("messages.upsert", {
      type: "notify",
      messages: [
        { key: { remoteJid: "40712345678@s.whatsapp.net", fromMe: false, id: "A" }, message: { conversation: "hi" }, pushName: "Alex", messageTimestamp: 1_700_000_000 },
        { key: { remoteJid: "40712345678@s.whatsapp.net", fromMe: true, id: "B" }, message: { conversation: "mine" } },
        { key: { remoteJid: "status@broadcast", fromMe: false, id: "C" }, message: { conversation: "status" } },
        { key: { remoteJid: "40712345678@s.whatsapp.net", fromMe: false, id: "D" }, message: { imageMessage: {} } },
      ],
    });
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      gatewayId: "whatsapp",
      chatId: "40712345678@s.whatsapp.net",
      senderId: "40712345678@s.whatsapp.net",
      senderName: "Alex",
      text: "hi",
      messageId: "A",
    });
    expect(inbox[0].timestamp).toBe(1_700_000_000_000);
  });

  test("ignores non-notify upserts (history sync)", async () => {
    const { gw, sock } = setup();
    const inbox: InboundMessage[] = [];
    gw.onMessage((m) => inbox.push(m));
    await gw.connect();
    sock.emit("messages.upsert", { type: "append", messages: [{ key: { remoteJid: "x@s.whatsapp.net" }, message: { conversation: "old" } }] });
    expect(inbox).toHaveLength(0);
  });

  test("send delivers text and returns the message id", async () => {
    const { gw, sock } = setup();
    await gw.connect();
    const res = await gw.send("40712345678@s.whatsapp.net", { kind: "answer", text: "pong" });
    expect(res.ok).toBe(true);
    expect(res.messageId).toBe("wamid-1");
    expect(sock.sent).toEqual([{ jid: "40712345678@s.whatsapp.net", text: "pong" }]);
  });

  test("send before connect fails gracefully", async () => {
    const { gw } = setup();
    const res = await gw.send("x@s.whatsapp.net", { kind: "answer", text: "hi" });
    expect(res.ok).toBe(false);
  });

  test("answers are markdown-converted before sending", async () => {
    const { gw, sock } = setup();
    await gw.connect();
    await gw.send("40712345678@s.whatsapp.net", { kind: "answer", text: "**bold** reply" });
    expect(sock.sent[0].text).toContain("*bold*");
    expect(sock.sent[0].text).not.toContain("**");
  });

  test("long answers are split into multiple sends", async () => {
    const { gw, sock } = setup();
    await gw.connect();
    await gw.send("40712345678@s.whatsapp.net", { kind: "answer", text: "word ".repeat(2000) });
    expect(sock.sent.length).toBeGreaterThan(1);
  });

  test("pairing mode requests a code when unregistered", async () => {
    const { gw, sock, logs } = setup({ registered: false, authMode: "pairing", pairingNumber: "+40 712 345 678" });
    await gw.connect();
    expect(sock.pairingArg).toBe("40712345678");
    expect(logs.some((l) => l.includes("pairing code: ABCD-1234"))).toBe(true);
  });

  test("logged-out close does not reconnect", async () => {
    const { gw, sock } = setup();
    await gw.connect();
    sock.emit("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } } });
    expect(gw.status()).toBe("disconnected");
  });

  test("non-fatal close schedules a reconnect (status connecting)", async () => {
    const { gw, sock } = setup();
    await gw.connect();
    sock.emit("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: 515 } } } });
    expect(gw.status()).toBe("connecting");
  });

  test("disconnect ends the socket and reports disconnected", async () => {
    const { gw, sock } = setup();
    await gw.connect();
    await gw.disconnect();
    expect(sock.ended).toBe(true);
    expect(gw.status()).toBe("disconnected");
    live = undefined; // already disconnected
  });
});
