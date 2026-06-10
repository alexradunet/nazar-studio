// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { createEventBus } from "./events.ts";

test("runtime event bus publishes inbound messages to subscribers", async () => {
  const bus = createEventBus();
  const seen: string[] = [];

  bus.on("inbound", (event) => {
    seen.push(`${event.source}:${event.sourceId}:${event.text}`);
  });

  await bus.publish("inbound", { source: "terminal", sourceId: "local", text: "hello" });

  expect(seen).toEqual(["terminal:local:hello"]);
});

test("runtime event bus publishes runtime session state", async () => {
  const bus = createEventBus();
  const seen: string[] = [];

  bus.on("state", (event) => {
    seen.push(`${event.conversation}:${event.branchTitle ?? ""}:${event.streaming}`);
  });

  await bus.publish("state", { conversation: "branch", branchTitle: "taxes", streaming: true });

  expect(seen).toEqual(["branch:taxes:true"]);
});

test("runtime event bus unsubscribe stops later events", async () => {
  const bus = createEventBus();
  let count = 0;
  const off = bus.on("tool", () => {
    count += 1;
  });

  await bus.publish("tool", { source: "terminal", sourceId: "local", toolName: "vault_search" });
  off();
  await bus.publish("tool", { source: "terminal", sourceId: "local", toolName: "vault_search" });

  expect(count).toBe(1);
});
