#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createInterface } from "node:readline/promises";
import { render } from "ink";
import { createBalaurRuntime, type BalaurRuntime } from "../lib/runtime/session-runner.ts";
import { BalaurStartupApp } from "./tui/BalaurStartupApp.tsx";

async function send(runtime: BalaurRuntime, text: string): Promise<void> {
  runtime.bus.on("outbound", (event) => { Bun.stdout.write(event.text); });
  runtime.bus.on("tool", (event) => { Bun.stderr.write(`\n[tool:${event.toolName}]\n`); });
  runtime.bus.on("status", (event) => { Bun.stderr.write(`\n[status] ${event.text}\n`); });
  await runtime.bus.publish("inbound", { source: "terminal", sourceId: "local", text });
  Bun.stdout.write("\n");
}

async function runPlainInteractive(runtime: BalaurRuntime): Promise<void> {
  runtime.bus.on("outbound", (event) => { Bun.stdout.write(event.text); });
  runtime.bus.on("tool", (event) => { Bun.stderr.write(`\n[tool:${event.toolName}]\n`); });
  runtime.bus.on("status", (event) => { Bun.stderr.write(`\n[status] ${event.text}\n`); });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("Balaur chat. Type /exit to leave.");
    while (true) {
      const line = (await rl.question("› ")).trim();
      if (!line) continue;
      if (line === "/exit" || line === "/quit") break;
      await runtime.bus.publish("inbound", { source: "terminal", sourceId: "local", text: line });
      Bun.stdout.write("\n");
    }
  } finally {
    rl.close();
  }
}

const prompt = Bun.argv.slice(2).join(" ").trim();
const headless = Boolean(prompt) || !process.stdin.isTTY;
let runtime: BalaurRuntime | undefined;

try {
  if (headless) {
    runtime = await createBalaurRuntime({
      onStartupStatus: (text) => { Bun.stderr.write(`[startup] ${text}\n`); },
    });
  }

  if (prompt && runtime) {
    await send(runtime, prompt);
  } else if (!process.stdin.isTTY && runtime) {
    await runPlainInteractive(runtime);
  } else {
    const app = render(<BalaurStartupApp onRuntime={(created) => { runtime = created; }} />);
    await app.waitUntilExit();
  }
} finally {
  runtime?.close();
}
