// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { GatewayManager } from "./manager.ts";
import { MasterLock } from "./lock.ts";
import { FakeGateway } from "./fake-gateway.ts";
import type { InboundMessage } from "./types.ts";

const OWNER = "40712345678";
const OWNER_JID = `${OWNER}@s.whatsapp.net`;

function inbound(text: string, over: Partial<InboundMessage> = {}): InboundMessage {
  return { gatewayId: "fake", chatId: OWNER_JID, senderId: OWNER_JID, text, timestamp: 1, ...over };
}

function setup(opts: { mirrorLocal?: boolean } = {}) {
  const gateway = new FakeGateway();
  const injected: { text: string; deliverAs: string }[] = [];
  const manager = new GatewayManager({
    lock: new MasterLock(OWNER),
    inject: (text, o) => injected.push({ text, deliverAs: o.deliverAs }),
    send: (chatId, message) => gateway.send(chatId, message),
    mirrorLocal: opts.mirrorLocal,
  });
  return { gateway, injected, manager };
}

describe("inbound handling + master lock", () => {
  test("authorized message is injected as followUp with a header", () => {
    const { manager, injected } = setup();
    const out = manager.handleInbound(inbound("hello", { senderName: "Alex" }));
    expect(out.action).toBe("inject");
    expect(injected).toHaveLength(1);
    expect(injected[0].deliverAs).toBe("followUp");
    expect(injected[0].text).toContain("hello");
    expect(injected[0].text).toContain("Alex");
  });

  test("unauthorized sender is ignored (no injection)", () => {
    const { manager, injected } = setup();
    const out = manager.handleInbound(inbound("hello", { senderId: "40799999999@s.whatsapp.net" }));
    expect(out).toEqual({ action: "ignore", reason: "unauthorized" });
    expect(injected).toHaveLength(0);
  });

  test("control commands are recognized, not injected", () => {
    const { manager, injected } = setup();
    expect(manager.handleInbound(inbound("/abort")).action).toBe("command");
    expect(manager.handleInbound(inbound("/compact")).action).toBe("command");
    expect(manager.handleInbound(inbound("/status")).action).toBe("command");
    expect(injected).toHaveLength(0);
  });
});

describe("turn origin routing", () => {
  test("gateway-originated turn routes working, answer, done to the chat", () => {
    const { manager, gateway, injected } = setup();
    manager.handleInbound(inbound("what is 2+2?"));
    const prompt = injected[0].text;

    manager.handleTurnStart(prompt); // before_agent_start
    manager.handleAssistantMessage("4"); // message_end (assistant)
    manager.handleTurnEnd(); // agent_end

    expect(gateway.sent.map((s) => s.message.kind)).toEqual(["status", "answer", "status"]);
    const answer = gateway.sent.find((s) => s.message.kind === "answer");
    expect(answer?.message.text).toBe("4");
    expect(answer?.chatId).toBe(OWNER_JID);
  });

  test("local turn stays quiet by default", () => {
    const { manager, gateway } = setup();
    manager.handleInbound(inbound("hi")); // establishes a reply target
    gateway.sent.length = 0;

    manager.handleTurnStart("a locally typed prompt"); // not a pending injected text
    manager.handleAssistantMessage("local answer");
    manager.handleTurnEnd();
    expect(gateway.sent).toHaveLength(0);
  });

  test("mirrorLocal echoes local turns too", () => {
    const { manager, gateway } = setup({ mirrorLocal: true });
    manager.handleInbound(inbound("hi"));
    gateway.sent.length = 0;

    manager.handleTurnStart("local prompt");
    manager.handleAssistantMessage("mirrored");
    manager.handleTurnEnd();
    expect(gateway.sent.some((s) => s.message.kind === "answer" && s.message.text === "mirrored")).toBe(true);
  });

  test("no reply target yet → nothing sent", () => {
    const { manager, gateway } = setup({ mirrorLocal: true });
    manager.handleTurnStart("x");
    manager.handleAssistantMessage("y");
    manager.handleTurnEnd();
    expect(gateway.sent).toHaveLength(0);
  });
});
