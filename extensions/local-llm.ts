// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * local-llm.ts — Nazar Pi extension: canonical local model runtime.
 *
 * This extension deliberately uses Mozilla llamafile directly. No native build path, no
 * systemd unit, no fallback runtime. The Pi terminal with the Nazar package loaded should have
 * one canonical local OpenAI compatible endpoint: http://127.0.0.1:8082/v1.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { dataDir as resolveDataDir } from "../lib/paths.ts";
import { llamafileProviderConfig } from "../lib/provider.ts";

const LLAMAFILE_VERSION = "0.10.3";
const LLAMAFILE_URL = `https://github.com/mozilla-ai/llamafile/releases/download/${LLAMAFILE_VERSION}/llamafile-${LLAMAFILE_VERSION}`;
const WHISPERFILE_URL = `https://github.com/mozilla-ai/llamafile/releases/download/${LLAMAFILE_VERSION}/whisperfile-${LLAMAFILE_VERSION}`;

const PROVIDER = "llamafile";
const DEFAULT_MODEL_ID = "qwen3-14b-q4";
const DEFAULT_MODEL_HF = "unsloth/Qwen3-14B-GGUF:Q4_K_M";
const DEFAULT_MODEL_FILE = "Qwen3-14B-Q4_K_M.gguf";
const MODEL_ID = process.env.NAZAR_MODEL_ID || process.env.NAZAR_PRIVATE_MODEL || DEFAULT_MODEL_ID;
const MODEL_HF = process.env.NAZAR_MODEL_HF || DEFAULT_MODEL_HF;
const MODEL_FILE = process.env.NAZAR_MODEL_FILE || DEFAULT_MODEL_FILE;
const MODEL_URL = process.env.NAZAR_MODEL_URL || `https://huggingface.co/unsloth/Qwen3-14B-GGUF/resolve/main/${MODEL_FILE}`;
const PORT = Number(process.env.NAZAR_LLM_PORT || "8082");
const HOST = "127.0.0.1";
const CTX = Number(process.env.NAZAR_LLM_CTX || "32768");
const WHISPER_MODEL_FILE = process.env.NAZAR_WHISPER_MODEL_FILE || "ggml-base.bin";
const WHISPER_MODEL_URL = process.env.NAZAR_WHISPER_MODEL_URL || `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILE}`;

function llmGpuDevice(): string {
  return process.env.NAZAR_LLM_DEVICE || "Vulkan0";
}

function llmGpuLayers(): string {
  return process.env.NAZAR_LLM_GPU_LAYERS || "99";
}

function vkVisibleDevices(): string {
  return process.env.NAZAR_LLM_VK_VISIBLE_DEVICES || process.env.GGML_VK_VISIBLE_DEVICES || "0";
}

function llmGpuEnabled(): boolean {
  const device = llmGpuDevice().trim().toLowerCase();
  const layers = llmGpuLayers().trim().toLowerCase();
  return Boolean(device) && device !== "none" && layers !== "0" && layers !== "none";
}

function dataDir(): string {
  return resolveDataDir();
}

/** Writable working dir for the runtime (replaces the old repo checkout dir). */
function workDir(): string {
  return dataDir();
}

function runtimePath(): string {
  return join(dataDir(), "runtimes", `llamafile-${LLAMAFILE_VERSION}`);
}

function whisperfilePath(): string {
  return join(dataDir(), "runtimes", `whisperfile-${LLAMAFILE_VERSION}`);
}

function llmModelPath(): string {
  return join(dataDir(), "models", "llm", MODEL_FILE);
}

function whisperModelPath(): string {
  return join(dataDir(), "models", "whisper", WHISPER_MODEL_FILE);
}

function logPath(): string {
  return join(dataDir(), "logs", "local-llm.log");
}

function pidPath(): string {
  return join(dataDir(), "run", "local-llm.pid");
}

/**
 * Local endpoint key file — lives in the writable DATA dir, never in the package or a repo
 * .env. The OpenAI-compatible llamafile server is bound to 127.0.0.1, so this key just keeps
 * other local processes from hitting it; it is generated once and reused.
 */
function keyPath(): string {
  return join(dataDir(), "run", "local-llm.key");
}

function shellQuote(s: string): string {
  return `'${String(s).replace(/'/g, `'"'"'`)}'`;
}

function readKeyFile(): string | undefined {
  try {
    return readFileSync(keyPath(), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function ensureKey(): string {
  const existing = process.env.LLAMA_LOCAL_KEY || readKeyFile();
  if (existing) {
    process.env.LLAMA_LOCAL_KEY = existing;
    process.env.NAZAR_PRIVATE_PROVIDER = PROVIDER;
    process.env.NAZAR_PRIVATE_MODEL = MODEL_ID;
    return existing;
  }
  const key = randomBytes(16).toString("hex");
  mkdirSync(join(dataDir(), "run"), { recursive: true });
  writeFileSync(keyPath(), `${key}\n`, { mode: 0o600 });
  process.env.LLAMA_LOCAL_KEY = key;
  process.env.NAZAR_PRIVATE_PROVIDER ||= PROVIDER;
  process.env.NAZAR_PRIVATE_MODEL = MODEL_ID;
  return key;
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function savedPid(): number | undefined {
  try {
    const pid = Number(readFileSync(pidPath(), "utf8").trim());
    return Number.isFinite(pid) && pid > 1 ? pid : undefined;
  } catch {
    return undefined;
  }
}

async function health(): Promise<{ ok: boolean; status?: number; text?: string }> {
  const key = ensureKey();
  try {
    const res = await fetch(`http://${HOST}:${PORT}/health`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(1200),
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (error: any) {
    return { ok: false, text: error?.message || String(error) };
  }
}

function startBackground(): { started: boolean; pid?: number; message: string } {
  const pid = savedPid();
  if (pid && processAlive(pid)) return { started: false, pid, message: `already starting/running as pid ${pid}` };

  const key = ensureKey();
  mkdirSync(join(dataDir(), "runtimes"), { recursive: true });
  mkdirSync(join(dataDir(), "models", "llm"), { recursive: true });
  mkdirSync(join(dataDir(), "models", "whisper"), { recursive: true });
  mkdirSync(join(dataDir(), "logs"), { recursive: true });
  mkdirSync(join(dataDir(), "run"), { recursive: true });

  const lf = runtimePath();
  const wf = whisperfilePath();
  const lm = llmModelPath();
  const wm = whisperModelPath();
  const log = logPath();
  const gpuArgs = llmGpuEnabled()
    ? `  --device ${shellQuote(llmGpuDevice())} -ngl ${shellQuote(llmGpuLayers())} \\\n`
    : "";
  const script = `
set -euo pipefail
${llmGpuEnabled() ? `export GGML_VK_VISIBLE_DEVICES=${shellQuote(vkVisibleDevices())}\n` : ""}
mkdir -p ${shellQuote(join(dataDir(), "runtimes"))} ${shellQuote(join(dataDir(), "models", "llm"))} ${shellQuote(join(dataDir(), "models", "whisper"))} ${shellQuote(join(dataDir(), "logs"))} ${shellQuote(join(dataDir(), "run"))}
if [ ! -x ${shellQuote(lf)} ]; then
  echo "[local-llm] downloading llamafile ${LLAMAFILE_VERSION}" >> ${shellQuote(log)}
  curl -fL ${shellQuote(LLAMAFILE_URL)} -o ${shellQuote(lf)} >> ${shellQuote(log)} 2>&1
  chmod +x ${shellQuote(lf)}
fi
if [ ! -x ${shellQuote(wf)} ]; then
  echo "[local-llm] downloading whisperfile ${LLAMAFILE_VERSION}" >> ${shellQuote(log)}
  curl -fL ${shellQuote(WHISPERFILE_URL)} -o ${shellQuote(wf)} >> ${shellQuote(log)} 2>&1
  chmod +x ${shellQuote(wf)}
fi
if [ ! -s ${shellQuote(lm)} ]; then
  echo "[local-llm] downloading LLM model ${MODEL_FILE}" >> ${shellQuote(log)}
  curl -fL ${shellQuote(MODEL_URL)} -o ${shellQuote(lm)} >> ${shellQuote(log)} 2>&1
fi
if [ ! -s ${shellQuote(wm)} ]; then
  echo "[local-llm] downloading whisper model ${WHISPER_MODEL_FILE}" >> ${shellQuote(log)}
  curl -fL ${shellQuote(WHISPER_MODEL_URL)} -o ${shellQuote(wm)} >> ${shellQuote(log)} 2>&1
fi
echo "[local-llm] starting llamafile: ${MODEL_HF}" >> ${shellQuote(log)}
${llmGpuEnabled() ? `echo ${shellQuote(`[local-llm] GPU offload: device=${llmGpuDevice()} layers=${llmGpuLayers()} GGML_VK_VISIBLE_DEVICES=${vkVisibleDevices()}`)} >> ${shellQuote(log)}\n` : `echo ${shellQuote("[local-llm] GPU offload: disabled")} >> ${shellQuote(log)}\n`}exec ${shellQuote(lf)} --server \
  -m ${shellQuote(lm)} \
  -a ${shellQuote(MODEL_ID)} \
  --host ${shellQuote(HOST)} --port ${PORT} \
${gpuArgs}  -t ${process.env.NAZAR_LLM_THREADS || "12"} -tb ${process.env.NAZAR_LLM_THREADS_BATCH || "12"} \
  -np ${process.env.NAZAR_LLM_PARALLEL || "1"} \
  -c ${CTX} -b ${process.env.NAZAR_LLM_BATCH || "1024"} -ub ${process.env.NAZAR_LLM_UBATCH || "256"} \
  --cache-type-k q8_0 --cache-type-v q8_0 -fa on \
  --jinja --reasoning off --no-mmproj --cache-ram ${process.env.NAZAR_LLM_CACHE_RAM || "512"} \
  --api-key ${shellQuote(key)} >> ${shellQuote(log)} 2>&1
`;

  const child = spawn("bash", ["-lc", script], {
    cwd: workDir(),
    env: {
      ...process.env,
      LLAMA_LOCAL_KEY: key,
      ...(llmGpuEnabled() ? { GGML_VK_VISIBLE_DEVICES: vkVisibleDevices() } : {}),
    },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  writeFileSync(pidPath(), String(child.pid));
  return { started: true, pid: child.pid, message: `started llamafile bootstrap as pid ${child.pid}` };
}

async function statusText(): Promise<string> {
  const h = await health();
  const pid = savedPid();
  const live = pid ? processAlive(pid) : false;
  return [
    `Runtime: llamafile ${LLAMAFILE_VERSION}`,
    `Speech: whisperfile ${LLAMAFILE_VERSION} / ${WHISPER_MODEL_FILE}`,
    `Provider/model: ${PROVIDER} / ${MODEL_ID}`,
    `HF model: ${MODEL_HF}`,
    `GPU offload: ${llmGpuEnabled() ? `device=${llmGpuDevice()}, layers=${llmGpuLayers()}, GGML_VK_VISIBLE_DEVICES=${vkVisibleDevices()}` : "disabled"}`,
    `Endpoint: http://${HOST}:${PORT}/v1`,
    `Health: ${h.ok ? "ok" : "not ready"}${h.status ? ` (${h.status})` : ""}`,
    `PID: ${pid ?? "none"}${pid ? (live ? " (live)" : " (stale)") : ""}`,
    `llamafile: ${existsSync(runtimePath()) ? runtimePath() : "not downloaded"}`,
    `LLM model: ${existsSync(llmModelPath()) ? llmModelPath() : "not downloaded"}`,
    `whisperfile: ${existsSync(whisperfilePath()) ? whisperfilePath() : "not downloaded"}`,
    `whisper model: ${existsSync(whisperModelPath()) ? whisperModelPath() : "not downloaded"}`,
    `Log: ${logPath()}`,
  ].join("\n");
}

function transcribeAudio(path: string, language = "auto"): Promise<string> {
  return new Promise((resolve) => {
    if (!existsSync(whisperfilePath()) || !existsSync(whisperModelPath())) {
      startBackground();
      resolve(`whisperfile/model not ready yet. Started downloader; check ${logPath()}`);
      return;
    }
    execFile(whisperfilePath(), ["-m", whisperModelPath(), "-f", path, "-l", language, "-np", "-nt"], {
      cwd: workDir(),
      timeout: 30 * 60 * 1000,
      maxBuffer: 20 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const out = `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim();
      resolve(error ? `whisperfile failed: ${error.message}\n${out}` : out);
    });
  });
}

async function validateChat(): Promise<string> {
  const key = ensureKey();
  const res = await fetch(`http://${HOST}:${PORT}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_ID,
      messages: [{ role: "user", content: "Reply with exactly: local ok" }],
      temperature: 0,
      max_tokens: 16,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok) return `HTTP ${res.status}: ${text.slice(0, 1000)}`;
  try {
    const json: any = JSON.parse(text);
    return json?.choices?.[0]?.message?.content || text.slice(0, 1000);
  } catch {
    return text.slice(0, 1000);
  }
}

function log(pi: ExtensionAPI, message: string): void {
  (pi as unknown as { log?: (message: string) => void }).log?.(message);
}

export default function (pi: ExtensionAPI) {
  // Register the canonical local llamafile provider + models IN-PROCESS. This replaces the old
  // seed-pi-config.sh step that copied models.json into ~/.pi/agent, so `pi install npm:pi-nazar-studio`
  // is self-sufficient. Wrapped defensively: a Pi build without registerProvider still gets the
  // runtime-management commands below.
  try {
    const register = (pi as unknown as { registerProvider?: (name: string, config: unknown) => void }).registerProvider;
    if (typeof register === "function") {
      register.call(
        pi,
        PROVIDER,
        llamafileProviderConfig({ apiKey: ensureKey(), baseUrl: `http://${HOST}:${PORT}/v1`, modelId: MODEL_ID }),
      );
      log(pi, `[local-llm] registered provider ${PROVIDER} (models from models.json)`);
    } else {
      log(pi, "[local-llm] pi.registerProvider unavailable — skipping provider registration");
    }
  } catch (err) {
    log(pi, `[local-llm] provider registration failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  pi.on("session_start", async (_event: unknown, ctx: any) => {
    const h = await health();
    if (h.ok) return;
    const r = startBackground();
    try { ctx.ui?.notify?.(`Local LLM: ${r.message}. First run downloads llamafile + ${MODEL_HF}.`, "info"); } catch { /* ignore */ }
  });

  pi.registerCommand("local-llm", {
    description: "Manage Nazar's canonical local llamafile + whisperfile runtime: /local-llm [status|start|doctor|log|stop|transcribe <audio>].",
    handler: async (args: string, ctx: any) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const sub = parts[0] || "status";
      if (sub === "status") {
        try { ctx.ui?.notify?.(await statusText(), "info"); } catch { /* ignore */ }
        return;
      }
      if (sub === "start") {
        const r = startBackground();
        try { ctx.ui?.notify?.(`Local LLM: ${r.message}. Log: ${logPath()}`, "info"); } catch { /* ignore */ }
        return;
      }
      if (sub === "doctor") {
        if (!(await health()).ok) startBackground();
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline) {
          if ((await health()).ok) break;
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        const out = (await health()).ok ? await validateChat() : "not healthy after waiting; inspect log";
        try { ctx.ui?.notify?.(`Local LLM doctor: ${out}\n${await statusText()}`, out.includes("local ok") ? "info" : "error"); } catch { /* ignore */ }
        return;
      }
      if (sub === "transcribe") {
        const file = parts[1];
        if (!file) {
          try { ctx.ui?.notify?.("Usage: /local-llm transcribe <audio.wav|mp3|flac|ogg> [language|auto]", "error"); } catch { /* ignore */ }
          return;
        }
        const out = await transcribeAudio(file, parts[2] || "auto");
        try { ctx.ui?.notify?.(out.slice(-4000), out.startsWith("whisperfile failed") ? "error" : "info"); } catch { /* ignore */ }
        return;
      }
      if (sub === "log") {
        let text = "No log yet.";
        try { text = readFileSync(logPath(), "utf8").split("\n").slice(-80).join("\n"); } catch { /* ignore */ }
        try { ctx.ui?.notify?.(text.slice(-4000), "info"); } catch { /* ignore */ }
        return;
      }
      if (sub === "stop") {
        const pid = savedPid();
        if (pid && processAlive(pid)) process.kill(pid, "SIGTERM");
        try { ctx.ui?.notify?.(pid ? `Stopped local llamafile pid ${pid}.` : "No saved local-llm pid.", "info"); } catch { /* ignore */ }
        return;
      }
      try { ctx.ui?.notify?.("Usage: /local-llm [status|start|doctor|log|stop|transcribe <audio>]", "error"); } catch { /* ignore */ }
    },
  });

  pi.registerTool({
    name: "whisperfile_transcribe",
    label: "transcribe audio",
    description: "Transcribe a local audio file using Nazar's canonical Mozilla whisperfile runtime. Supports wav, mp3, flac, ogg.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to a local audio file." }),
      language: Type.Optional(Type.String({ description: "Spoken language code, or auto. Default: auto." })),
    }),
    async execute(_id: string, p: { path: string; language?: string }) {
      const text = await transcribeAudio(p.path, p.language || "auto");
      return { content: [{ type: "text", text }], details: { path: p.path } };
    },
  });

  pi.registerTool({
    name: "local_llm_status",
    label: "local llm status",
    description: "Check Nazar's canonical local llamafile runtime status.",
    parameters: Type.Object({}),
    async execute() {
      return { content: [{ type: "text", text: await statusText() }], details: {} };
    },
  });

  log(pi, `[local-llm] canonical runtime registered: ${PROVIDER}/${MODEL_ID} via llamafile`);
}
