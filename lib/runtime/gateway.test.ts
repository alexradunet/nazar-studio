// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { createEventBus, type InboundMessage } from "./events.ts";
import { createRuntimeGatewayBridge } from "./gateway.ts";
import { MODEL_DOWNLOAD_ALLOWED_MESSAGE, MODEL_DOWNLOAD_CONSENT_COMMAND, MODEL_DOWNLOAD_REQUIRED_MESSAGE } from "./model-download-consent.ts";

test("runtime gateway bridge publishes inbound messages with its source", async () => {
  const bus = createEventBus();
  const bridge = createRuntimeGatewayBridge({ bus }, "rest");
  const seen = new Promise<InboundMessage>((resolve) => {
    bus.on("inbound", resolve);
  });

  await bridge.sendInbound("client-1", "hello");

  await expect(seen).resolves.toEqual({ source: "rest", sourceId: "client-1", text: "hello" });
  bridge.close();
});

test("runtime gateway bridge buffers only matching outbound events", async () => {
  const bus = createEventBus();
  const bridge = createRuntimeGatewayBridge({ bus }, "rest");
  const pushed: string[] = [];
  bridge.onEvent((event) => {
    if (event.kind === "outbound") pushed.push(event.text);
  });

  await bus.publish("outbound", { source: "terminal", sourceId: "local", text: "ignore" });
  await bus.publish("outbound", { source: "rest", sourceId: "client-1", text: "answer" });
  await bus.publish("tool", { source: "rest", sourceId: "client-1", toolName: "vault_search" });
  await bus.publish("status", { source: "rest", sourceId: "client-2", text: "elsewhere" });

  expect(pushed).toEqual(["answer"]);
  expect(bridge.readEvents("client-1")).toEqual([
    { id: 1, sourceId: "client-1", kind: "outbound", text: "answer" },
    { id: 2, sourceId: "client-1", kind: "tool", toolName: "vault_search" },
  ]);
  expect(bridge.readEvents("client-1", 1)).toEqual([
    { id: 2, sourceId: "client-1", kind: "tool", toolName: "vault_search" },
  ]);
  expect(bridge.readEvents("client-2")).toEqual([
    { id: 3, sourceId: "client-2", kind: "status", text: "elsewhere" },
  ]);
  bridge.close();
});

test("runtime gateway bridge blocks local model prompts until download consent", async () => {
  const bus = createEventBus();
  const bridge = createRuntimeGatewayBridge({ bus }, "rest", { modelDownloadConsentRequired: true });
  const inbound: InboundMessage[] = [];
  bus.on("inbound", (event) => {
    inbound.push(event);
  });

  await bridge.sendInbound("client-1", "hello");
  expect(inbound).toEqual([]);
  expect(bridge.readEvents("client-1")).toEqual([
    { id: 1, sourceId: "client-1", kind: "status", text: MODEL_DOWNLOAD_REQUIRED_MESSAGE },
  ]);

  await bridge.sendInbound("client-1", MODEL_DOWNLOAD_CONSENT_COMMAND);
  expect(inbound).toEqual([]);
  expect(bridge.readEvents("client-1", 1)).toEqual([
    { id: 2, sourceId: "client-1", kind: "status", text: MODEL_DOWNLOAD_ALLOWED_MESSAGE },
  ]);

  await bridge.sendInbound("client-1", "hello");
  expect(inbound).toEqual([{ source: "rest", sourceId: "client-1", text: "hello" }]);

  await bridge.sendInbound("client-2", "hello");
  expect(inbound).toEqual([{ source: "rest", sourceId: "client-1", text: "hello" }]);
  expect(bridge.readEvents("client-2")).toEqual([
    { id: 3, sourceId: "client-2", kind: "status", text: MODEL_DOWNLOAD_REQUIRED_MESSAGE },
  ]);
  bridge.close();
});
