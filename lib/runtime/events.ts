// SPDX-License-Identifier: AGPL-3.0-or-later
export type RuntimeSource = string;

export interface InboundMessage {
  source: RuntimeSource;
  sourceId: string;
  text: string;
}

export interface OutboundMessage {
  source: RuntimeSource;
  sourceId: string;
  text: string;
}

export interface ToolNotice {
  source: RuntimeSource;
  sourceId: string;
  toolName: string;
}

export interface StatusNotice {
  source: RuntimeSource;
  sourceId: string;
  text: string;
}

export interface RuntimeSessionState {
  conversation: "master" | "branch";
  branchTitle?: string;
  streaming: boolean;
}

export type RuntimeEvent = InboundMessage | OutboundMessage | ToolNotice | StatusNotice | RuntimeSessionState;

type Handler<T extends RuntimeEvent> = (event: T) => void | Promise<void>;

type EventName = "inbound" | "outbound" | "tool" | "status" | "state";

type EventMap = {
  inbound: InboundMessage;
  outbound: OutboundMessage;
  tool: ToolNotice;
  status: StatusNotice;
  state: RuntimeSessionState;
};

export function createEventBus() {
  const handlers: { [K in EventName]: Set<Handler<EventMap[K]>> } = {
    inbound: new Set(),
    outbound: new Set(),
    tool: new Set(),
    status: new Set(),
    state: new Set(),
  };

  return {
    on<K extends EventName>(name: K, handler: Handler<EventMap[K]>): () => void {
      handlers[name].add(handler);
      return () => handlers[name].delete(handler);
    },

    async publish<K extends EventName>(name: K, event: EventMap[K]): Promise<void> {
      for (const handler of handlers[name]) await handler(event);
    },
  };
}
