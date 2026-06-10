#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRuntimeGatewayBridge } from "../lib/runtime/gateway.ts";
import { createBalaurRuntime } from "../lib/runtime/session-runner.ts";

declare const Bun: {
  serve(options: {
    hostname: string;
    port: number;
    fetch(request: Request): Response | Promise<Response>;
  }): { url: URL; stop(closeActiveConnections?: boolean): void };
};

const MAX_BODY_BYTES = 64 * 1024;

function envPort(): number {
  const raw = process.env.BALAUR_API_PORT;
  if (!raw) return 8787;
  const port = Number.parseInt(raw, 10);
  return Number.isFinite(port) ? port : 8787;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("request body too large");
  return JSON.parse(text) as unknown;
}

function asMessage(input: unknown): { clientId: string; text: string } | undefined {
  if (!input || typeof input !== "object") return undefined;
  const body = input as { clientId?: unknown; text?: unknown };
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!clientId || !text) return undefined;
  return { clientId, text };
}

const runtime = await createBalaurRuntime({
  onStartupStatus: (text) => { console.error(`[startup] ${text}`); },
});
const bridge = createRuntimeGatewayBridge(runtime, "rest");
const host = process.env.BALAUR_API_HOST ?? "127.0.0.1";
const port = envPort();

const server = Bun.serve({
  hostname: host,
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, { ok: true });
    }

    if (request.method === "POST" && url.pathname === "/api/messages") {
      try {
        const message = asMessage(await readJson(request));
        if (!message) return json(400, { ok: false, error: "clientId and text are required" });
        void bridge.sendInbound(message.clientId, message.text).catch((error: unknown) => {
          console.error(`[rest-api] inbound failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        return json(202, { ok: true });
      } catch (error) {
        return json(400, { ok: false, error: error instanceof Error ? error.message : "invalid request" });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      const clientId = url.searchParams.get("clientId")?.trim();
      const after = Number.parseInt(url.searchParams.get("after") ?? "0", 10);
      if (!clientId) return json(400, { ok: false, error: "clientId is required" });
      return json(200, { ok: true, events: bridge.readEvents(clientId, Number.isFinite(after) ? after : 0) });
    }

    return json(404, { ok: false, error: "not found" });
  },
});

console.log(`Balaur REST API listening at ${server.url}`);
console.log("POST /api/messages { clientId, text } · GET /api/events?clientId=...&after=...");
console.log("Press Ctrl-C to stop.");

async function shutdown(): Promise<void> {
  bridge.close();
  runtime.close();
  server.stop(true);
}

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
