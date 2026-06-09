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

function setup(opts: { mirrorLocal?: boolean; toolPings?: boolean } = {}) {
  const gateway = new FakeGateway();
  const injected: { text: string; deliverAs: string }[] = [];
  const presence: { chatId: string; state: string }[] = [];
  const manager = new GatewayManager({
    lock: new MasterLock(OWNER),
    inject: (text, o) => injected.push({ text, deliverAs: o.deliverAs }),
    send: (chatId, message) => gateway.send(chatId, message),
    presence: (chatId, state) => presence.push({ chatId, state }),
    mirrorLocal: opts.mirrorLocal,
    toolPings: opts.toolPings,
  });
  return { gateway, injected, presence, manager };
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

describe("turn origin routing + compact status", () => {
  test("gateway turn: typing on start, answer routed, no done note when answered", () => {
    const { manager, gateway, presence, injected } = setup();
    manager.handleInbound(inbound("2+2?"));
    manager.handleTurnStart(injected[0].text);
    manager.handleAssistantMessage("4");
    manager.handleTurnEnd();
    expect(presence.map((p) => p.state)).toEqual(["composing", "paused"]);
    expect(gateway.sent.map((s) => s.message.kind)).toEqual(["answer"]);
    expect(gateway.sent[0].message.text).toBe("4");
    expect(gateway.sent[0].chatId).toBe(OWNER_JID);
  });

  test("no-answer turn sends a compact done note", () => {
    const { manager, gateway, presence, injected } = setup();
    manager.handleInbound(inbound("do a thing"));
    manager.handleTurnStart(injected[0].text);
    manager.handleTurnEnd();
    expect(presence.map((p) => p.state)).toEqual(["composing", "paused"]);
    expect(gateway.sent.map((s) => s.message.kind)).toEqual(["status"]);
  });

  test("local turn stays quiet by default (no presence, no send)", () => {
    const { manager, gateway, presence } = setup();
    manager.handleInbound(inbound("hi")); // establishes a reply target
    gateway.sent.length = 0;
    presence.length = 0;
    manager.handleTurnStart("a locally typed prompt");
    manager.handleAssistantMessage("local answer");
    manager.handleTurnEnd();
    expect(gateway.sent).toHaveLength(0);
    expect(presence).toHaveLength(0);
  });

  test("mirrorLocal echoes local turns", () => {
    const { manager, gateway } = setup({ mirrorLocal: true });
    manager.handleInbound(inbound("hi"));
    gateway.sent.length = 0;
    manager.handleTurnStart("local prompt");
    manager.handleAssistantMessage("mirrored");
    manager.handleTurnEnd();
    expect(gateway.sent.some((s) => s.message.kind === "answer" && s.message.text === "mirrored")).toBe(true);
  });

  test("no reply target yet → nothing sent or signalled", () => {
    const { manager, gateway, presence } = setup({ mirrorLocal: true });
    manager.handleTurnStart("x");
    manager.handleAssistantMessage("y");
    manager.handleTurnEnd();
    expect(gateway.sent).toHaveLength(0);
    expect(presence).toHaveLength(0);
  });
});

describe("tool pings", () => {
  test("throttled: only the first of rapid tool activities is sent", () => {
    const { manager, gateway, injected } = setup({ toolPings: true });
    manager.handleInbound(inbound("go"));
    manager.handleTurnStart(injected[0].text);
    manager.handleToolActivity("edit");
    manager.handleToolActivity("read");
    expect(gateway.sent.filter((s) => s.message.kind === "status")).toHaveLength(1);
    manager.handleTurnEnd();
  });

  test("off by default", () => {
    const { manager, gateway, injected } = setup();
    manager.handleInbound(inbound("go"));
    manager.handleTurnStart(injected[0].text);
    manager.handleToolActivity("edit");
    expect(gateway.sent.filter((s) => s.message.kind === "status")).toHaveLength(0);
    manager.handleTurnEnd();
  });
});
