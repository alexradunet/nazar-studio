#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { createRequire } from "node:module";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "../../..");
const require = createRequire(import.meta.url);

function setupConfigPath() {
  if (process.env.NAZAR_CONFIG_DIR?.trim()) return join(resolve(process.env.NAZAR_CONFIG_DIR.trim()), "setup.json");
  if (platform() === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "nazar", "setup.json");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "nazar", "setup.json");
}

function setupVoiceModelDir() {
  try {
    if (!existsSync(setupConfigPath())) return undefined;
    const config = JSON.parse(readFileSync(setupConfigPath(), "utf8"));
    return typeof config?.voice?.modelDir === "string" ? config.voice.modelDir : undefined;
  } catch {
    return undefined;
  }
}

const modelRoot = process.env.PI_VOICE_MODEL_DIR || setupVoiceModelDir() || resolve(projectRoot, "memory/state/voice-models");

const downloads = [
  {
    name: "kokoro-en-v0_19",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2",
    dir: join(modelRoot, "kokoro-en-v0_19"),
  },
  {
    name: "sherpa-onnx-whisper-medium.en",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-medium.en.tar.bz2",
    dir: join(modelRoot, "sherpa-onnx-whisper-medium.en"),
  },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) {
    throw new Error(`${command} failed to start: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`${command} ${args.join(" ")} terminated by signal ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }
}

function cliPath(path) {
  if (process.platform !== "win32" || !process.env.MSYSTEM) return path;
  return path.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_match, drive) => `/${drive.toLowerCase()}`);
}

mkdirSync(modelRoot, { recursive: true });

try {
  require.resolve("sherpa-onnx-node");
} catch {
  run("npm", ["install"], { cwd: scriptDir });
}

for (const item of downloads) {
  const archive = join(modelRoot, `${item.name}.tar.bz2`);
  if (existsSync(item.dir)) {
    console.log(`${item.name}: already present`);
    rmSync(archive, { force: true });
    continue;
  }

  if (!existsSync(archive)) {
    console.log(`Downloading ${item.name}...`);
    run("curl", ["-L", "-o", cliPath(archive), item.url]);
  } else {
    console.log(`${item.name}: using existing archive ${archive}`);
  }
  console.log(`Extracting ${item.name}...`);
  run("tar", ["xf", cliPath(archive), "-C", cliPath(modelRoot)]);
  rmSync(archive, { force: true });
}

console.log(`Sherpa voice runtime is ready. Model root: ${modelRoot}`);
