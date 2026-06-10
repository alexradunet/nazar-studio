// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { createEventBus, type InboundMessage } from "./events.ts";
import { createRuntimeGatewayBridge } from "./gateway.ts";

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
