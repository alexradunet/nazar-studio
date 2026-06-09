// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import localLlm from "./local-llm.ts";

// The provider path generates a local key file under the data dir — keep it in tmp.
beforeEach(() => { process.env.NAZAR_DATA_DIR = mkdtempSync(join(tmpdir(), "nazar-llm-")); });

test("local-llm registers the runtime command, tools, and the llamafile provider", () => {
  const tools: any[] = [];
  const commands: Record<string, any> = {};
  const providers: string[] = [];
  const pi = {
    registerTool: (t: any) => tools.push(t),
    registerCommand: (n: string, d: any) => { commands[n] = d; },
    registerProvider: (name: string) => providers.push(name),
    on() {},
    log() {},
  } as any;

  localLlm(pi);

  expect(commands["local-llm"]).toBeDefined();
  expect(tools.map((t) => t.name).sort()).toEqual(["local_llm_status", "whisperfile_transcribe"]);
  expect(providers).toContain("llamafile");
});

test("local-llm still registers its tools when the host has no registerProvider", () => {
  const tools: any[] = [];
  const commands: Record<string, any> = {};
  const pi = {
    registerTool: (t: any) => tools.push(t),
    registerCommand: (n: string, d: any) => { commands[n] = d; },
    on() {},
    log() {},
  } as any;

  localLlm(pi);

  expect(commands["local-llm"]).toBeDefined();
  expect(tools).toHaveLength(2);
});
