// SPDX-License-Identifier: AGPL-3.0-or-later
import type { createEventBus, RuntimeSource } from "./events.ts";
import { MODEL_DOWNLOAD_ALLOWED_MESSAGE, MODEL_DOWNLOAD_CONSENT_COMMAND, MODEL_DOWNLOAD_REQUIRED_MESSAGE } from "./model-download-consent.ts";

export type GatewayOutputPayload =
  | { sourceId: string; kind: "outbound"; text: string }
  | { sourceId: string; kind: "status"; text: string }
  | { sourceId: string; kind: "tool"; toolName: string };

export type GatewayOutputEvent = GatewayOutputPayload & { id: number };

export interface RuntimeGatewayBridge {
  readonly source: RuntimeSource;
  sendInbound(sourceId: string, text: string): Promise<void>;
  readEvents(sourceId: string, afterId?: number): GatewayOutputEvent[];
  onEvent(handler: (event: GatewayOutputEvent) => void): () => void;
  close(): void;
}

export interface RuntimeGatewayOptions {
  maxEventsPerClient?: number;
  modelDownloadConsentRequired?: boolean;
}

export interface RuntimeGatewayHost {
  bus: ReturnType<typeof createEventBus>;
}

function trimQueue(queue: GatewayOutputEvent[], max: number): void {
  if (queue.length > max) queue.splice(0, queue.length - max);
}

export function createRuntimeGatewayBridge(
  runtime: RuntimeGatewayHost,
  source: RuntimeSource,
  options: RuntimeGatewayOptions = {},
): RuntimeGatewayBridge {
  const maxEvents = options.maxEventsPerClient ?? 200;
  const queues = new Map<string, GatewayOutputEvent[]>();
  const handlers = new Set<(event: GatewayOutputEvent) => void>();
  const modelDownloadAllowed = new Set<string>();
  let nextId = 1;

  const push = (event: GatewayOutputPayload): void => {
    const full = { ...event, id: nextId++ };
    const queue = queues.get(full.sourceId) ?? [];
    queue.push(full);
    trimQueue(queue, maxEvents);
    queues.set(full.sourceId, queue);
    for (const handler of handlers) handler(full);
  };

  const offOutbound = runtime.bus.on("outbound", (event) => {
    if (event.source === source) push({ sourceId: event.sourceId, kind: "outbound", text: event.text });
  });
  const offStatus = runtime.bus.on("status", (event) => {
    if (event.source === source) push({ sourceId: event.sourceId, kind: "status", text: event.text });
  });
  const offTool = runtime.bus.on("tool", (event) => {
    if (event.source === source) push({ sourceId: event.sourceId, kind: "tool", toolName: event.toolName });
  });

  return {
    source,

    async sendInbound(sourceId: string, text: string): Promise<void> {
      const trimmed = text.trim();
      if (options.modelDownloadConsentRequired && trimmed === MODEL_DOWNLOAD_CONSENT_COMMAND) {
        modelDownloadAllowed.add(sourceId);
        push({ sourceId, kind: "status", text: MODEL_DOWNLOAD_ALLOWED_MESSAGE });
        return;
      }

      if (options.modelDownloadConsentRequired && !modelDownloadAllowed.has(sourceId)) {
        push({ sourceId, kind: "status", text: MODEL_DOWNLOAD_REQUIRED_MESSAGE });
        return;
      }

      await runtime.bus.publish("inbound", { source, sourceId, text });
    },

    readEvents(sourceId: string, afterId = 0): GatewayOutputEvent[] {
      return (queues.get(sourceId) ?? []).filter((event) => event.id > afterId);
    },

    onEvent(handler: (event: GatewayOutputEvent) => void): () => void {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    close(): void {
      offOutbound();
      offStatus();
      offTool();
      handlers.clear();
      queues.clear();
    },
  };
}
