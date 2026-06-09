// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGatewayController } from "./install.ts";
import { FakeGateway } from "./fake-gateway.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const OWNER = "40712345678";
const OWNER_JID = `${OWNER}@s.whatsapp.net`;

let dir: string;

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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nazar-ctl-"));
  process.env.NAZAR_WHATSAPP_CONFIG = join(dir, "config.json");
  process.env.NAZAR_WHATSAPP_SESSION_DIR = join(dir, "session");
  delete process.env.NAZAR_GATEWAY;
  delete process.env.NAZAR_WHATSAPP_OWNER;
});
afterEach(() => {
  delete process.env.NAZAR_WHATSAPP_CONFIG;
  delete process.env.NAZAR_WHATSAPP_SESSION_DIR;
  rmSync(dir, { recursive: true, force: true });
});

function build() {
  const { pi, handlers, sent } = fakePi();
  const gateway = new FakeGateway();
  const controller = createGatewayController(pi, { createGateway: () => gateway, log: () => {} });
  return { pi, handlers, sent, gateway, controller };
}

describe("gateway controller", () => {
  test("registerLifecycle subscribes to the Pi lifecycle", () => {
    const { handlers, controller } = build();
    controller.registerLifecycle();
    for (const e of ["session_start", "before_agent_start", "message_end", "agent_end", "tool_execution_start", "session_shutdown"]) {
      expect(handlers.has(e)).toBe(true);
    }
  });

  test("not configured until an owner is set", () => {
    const { controller } = build();
    expect(controller.getConfig().configured).toBe(false);
    controller.saveConfig({ gateway: "whatsapp", owner: OWNER });
    expect(controller.getConfig().configured).toBe(true);
  });

  test("connect links the gateway; inbound is injected; assistant reply is sent back", async () => {
    const { controller, handlers, sent, gateway } = build();
    controller.registerLifecycle();
    controller.saveConfig({ gateway: "whatsapp", owner: OWNER });
    await controller.connect();
    expect(controller.isConnected()).toBe(true);

    gateway.emit({ senderId: OWNER_JID, chatId: OWNER_JID, text: "ping" });
    expect(sent).toHaveLength(1);
    const prompt = sent[0].text;

    await handlers.get("before_agent_start")?.({ prompt }, {});
    await handlers.get("message_end")?.({ message: { role: "assistant", content: [{ type: "text", text: "pong" }] } }, {});
    await handlers.get("agent_end")?.({}, {});

    expect(gateway.sent.some((s) => s.message.kind === "answer" && s.message.text === "pong")).toBe(true);
  });

  test("ignores messages from non-owner senders", async () => {
    const { controller, sent, gateway } = build();
    controller.saveConfig({ gateway: "whatsapp", owner: OWNER });
    await controller.connect();
    gateway.emit({ senderId: "40799999999@s.whatsapp.net", chatId: "40799999999@s.whatsapp.net", text: "hi" });
    expect(sent).toHaveLength(0);
  });

  test("/abort from the owner calls ctx.abort()", async () => {
    const { controller, handlers, gateway } = build();
    controller.registerLifecycle();
    const ctx = { abort: vi.fn(), compact: vi.fn(), ui: {} };
    await handlers.get("session_start")?.({}, ctx);
    controller.saveConfig({ gateway: "whatsapp", owner: OWNER });
    await controller.connect();
    gateway.emit({ senderId: OWNER_JID, chatId: OWNER_JID, text: "/abort" });
    expect(ctx.abort).toHaveBeenCalledOnce();
  });

  test("QR events open a Pi overlay popup", async () => {
    const { controller, handlers, gateway } = build();
    controller.registerLifecycle();
    controller.saveConfig({ gateway: "whatsapp", owner: OWNER });

    let rendered: string[] = [];
    const custom = vi.fn((factory: any, options: any) => {
      options?.onHandle?.({ requestRender: vi.fn(), focus: vi.fn() });
      const component = factory(undefined, undefined, undefined, () => {});
      rendered = component.render(58);
      return new Promise<void>(() => {});
    });

    await handlers.get("session_start")?.({}, { hasUI: true, ui: { custom, setStatus: vi.fn() } });
    await controller.connect();
    gateway.emitQr("test-qr-payload");

    await vi.waitFor(() => expect(custom).toHaveBeenCalledOnce());
    expect(rendered.join("\n")).toContain("WhatsApp link QR");
  });

  test("disconnect tears down the gateway", async () => {
    const { controller, gateway } = build();
    controller.saveConfig({ gateway: "whatsapp", owner: OWNER });
    await controller.connect();
    await controller.disconnect();
    expect(controller.isConnected()).toBe(false);
    expect(gateway.status()).toBe("disconnected");
  });

  test("logoff deletes the linked-device session dir", async () => {
    const { controller } = build();
    controller.saveConfig({ gateway: "whatsapp", owner: OWNER });
    const sessionDir = controller.getConfig().sessionDir;
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "creds.json"), "{}");
    await controller.logoff();
    expect(existsSync(sessionDir)).toBe(false);
  });

  test("auto-connects on session_start when linked and autoConnect is on", async () => {
    const { controller, handlers, gateway } = build();
    controller.registerLifecycle();
    controller.saveConfig({ gateway: "whatsapp", owner: OWNER, autoConnect: true });
    const sessionDir = controller.getConfig().sessionDir;
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "creds.json"), "{}"); // simulate a prior link
    await handlers.get("session_start")?.({}, { ui: {} });
    expect(controller.isConnected()).toBe(true);
    expect(gateway.status()).toBe("connected");
  });
});
