// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";
import { installGateway } from "./install.ts";
import { GatewayManager } from "./manager.ts";
import { MasterLock } from "./lock.ts";
import { FakeGateway } from "./fake-gateway.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OWNER_JID = "40712345678@s.whatsapp.net";

function fakePi() {
  const handlers = new Map<string, (event: any, ctx: any) => unknown>();
  const sent: { text: string; options: any }[] = [];
  const pi = {
    on: (event: string, handler: (event: any, ctx: any) => unknown) => {
      handlers.set(event, handler);
    },
    sendUserMessage: (text: string, options?: any) => {
      sent.push({ text, options });
    },
    log: (_message: string) => {},
  };
  return { pi: pi as unknown as ExtensionAPI, handlers, sent };
}

function build() {
  const { pi, handlers, sent } = fakePi();
  const gateway = new FakeGateway();
  const manager = new GatewayManager({
    lock: new MasterLock("40712345678"),
    inject: (text, options) => pi.sendUserMessage(text, options),
    send: (chatId, message) => gateway.send(chatId, message),
  });
  installGateway(pi, gateway, manager);
  return { pi, handlers, sent, gateway, manager };
}

describe("installGateway wiring", () => {
  test("connects on session_start, disconnects on session_shutdown", async () => {
    const { handlers, gateway } = build();
    await handlers.get("session_start")?.({}, {});
    expect(gateway.status()).toBe("connected");
    await handlers.get("session_shutdown")?.({}, {});
    expect(gateway.status()).toBe("disconnected");
  });

  test("inbound message is injected; the assistant reply is sent back", async () => {
    const { handlers, sent, gateway } = build();
    await handlers.get("session_start")?.({}, {});

    gateway.emit({ senderId: OWNER_JID, chatId: OWNER_JID, text: "ping" });
    expect(sent).toHaveLength(1);
    expect(sent[0].options.deliverAs).toBe("followUp");
    const prompt = sent[0].text;

    await handlers.get("before_agent_start")?.({ prompt }, {});
    await handlers.get("message_end")?.({ message: { role: "assistant", content: [{ type: "text", text: "pong" }] } }, {});
    await handlers.get("agent_end")?.({}, {});

    expect(gateway.sent.some((s) => s.message.kind === "answer" && s.message.text === "pong")).toBe(true);
  });

  test("non-assistant message_end is ignored", async () => {
    const { handlers, gateway } = build();
    await handlers.get("session_start")?.({}, {});
    gateway.emit({ senderId: OWNER_JID, chatId: OWNER_JID, text: "hi" });
    gateway.sent.length = 0;
    await handlers.get("before_agent_start")?.({ prompt: "Message from … unmatched" }, {});
    await handlers.get("message_end")?.({ message: { role: "user", content: [{ type: "text", text: "x" }] } }, {});
    expect(gateway.sent).toHaveLength(0);
  });

  test("/abort from the owner calls ctx.abort()", async () => {
    const { handlers, gateway } = build();
    const ctx = { abort: vi.fn(), compact: vi.fn() };
    await handlers.get("session_start")?.({}, ctx);
    gateway.emit({ senderId: OWNER_JID, chatId: OWNER_JID, text: "/abort" });
    expect(ctx.abort).toHaveBeenCalledOnce();
  });

  test("ignores unauthorized senders", async () => {
    const { handlers, sent, gateway } = build();
    await handlers.get("session_start")?.({}, {});
    gateway.emit({ senderId: "40799999999@s.whatsapp.net", chatId: "40799999999@s.whatsapp.net", text: "hi" });
    expect(sent).toHaveLength(0);
  });
});
