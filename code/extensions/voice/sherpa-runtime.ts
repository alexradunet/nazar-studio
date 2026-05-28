import { mkdtemp, rm } from "node:fs/promises";
import { accessSync, constants, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

import { defaultVoiceModelDir, readNazarSetupConfig } from "../nazar/setup-store.ts";

const SHERPA_SETUP_HINT = "Run from this repository: cd code/extensions/voice && npm install && node setup-sherpa.mjs";

let sherpaModule: any | undefined;
let sherpaLoadError: string | undefined;

function loadSherpa(): any {
  if (sherpaModule) return sherpaModule;
  try {
    // sherpa-onnx-node is a CommonJS native addon package installed next to this module.
    // Load lazily so a missing optional runtime does not prevent Pi from starting.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sherpaModule = require("sherpa-onnx-node");
    sherpaLoadError = undefined;
    return sherpaModule;
  } catch (error) {
    sherpaLoadError = error instanceof Error ? error.message : String(error);
    throw new Error(`sherpa-onnx-node is not installed or failed to load. ${SHERPA_SETUP_HINT}. ${sherpaLoadError}`);
  }
}

const TTS_MODEL_NAME = process.env.PI_TTS_MODEL_NAME || "kokoro-en-v0_19";
const TTS_MODEL_FILE = TTS_MODEL_NAME.includes("int8") ? "model.int8.onnx" : "model.onnx";
const TTS_SPEAKER_ID = Math.max(0, Number(process.env.PI_TTS_SPEAKER_ID ?? "0") || 0);
const ASR_MODEL_NAME = process.env.PI_STT_MODEL_NAME || "sherpa-onnx-whisper-medium.en";
const ASR_MODEL_ID = ASR_MODEL_NAME.replace(/^sherpa-onnx-whisper-/, "");
const ASR_ENCODER_FILE = process.env.PI_STT_ENCODER_FILE || `${ASR_MODEL_ID}-encoder.int8.onnx`;
const ASR_DECODER_FILE = process.env.PI_STT_DECODER_FILE || `${ASR_MODEL_ID}-decoder.int8.onnx`;
const ASR_TOKENS_FILE = process.env.PI_STT_TOKENS_FILE || `${ASR_MODEL_ID}-tokens.txt`;
const ASR_LANGUAGE = "en";
const ASR_TASK = "transcribe";
const MIC_VOLUME = process.env.PI_MIC_VOLUME || "0.08";
const XRDP_MIC_VOLUME = process.env.PI_XRDP_MIC_VOLUME || "1.0";
const TTS_PREROLL_MS = Math.max(0, Number(process.env.PI_TTS_PREROLL_MS ?? "220") || 0);
const PULSE_DEFAULT_DEVICE = "default";

function modelRoot(): string {
  const setupConfig = readNazarSetupConfig();
  return process.env.PI_VOICE_MODEL_DIR || setupConfig.voice?.modelDir || defaultVoiceModelDir(setupConfig);
}

function ttsModelDir(): string {
  return resolve(modelRoot(), TTS_MODEL_NAME);
}

function asrModelDir(): string {
  return resolve(modelRoot(), ASR_MODEL_NAME);
}

type AudioTarget = {
  backend: "pulse" | "alsa" | "custom" | "powershell" | "native";
  command: string;
  args: string[];
  label: string;
  hint?: string;
  unavailableReason?: string;
};

function envValue(name: string): string {
  const env = (process.env[name] ?? "").trim();
  if (env) return env;
  const voice = readNazarSetupConfig().voice;
  if (name === "PI_STT_COMMAND") return voice?.sttCommand?.trim() || "";
  if (name === "PI_STT_ARGS") return voice?.sttArgs ? JSON.stringify(voice.sttArgs) : "";
  if (name === "PI_TTS_COMMAND") return voice?.ttsCommand?.trim() || "";
  if (name === "PI_TTS_ARGS") return voice?.ttsArgs ? JSON.stringify(voice.ttsArgs) : "";
  return "";
}

function splitEnvArgs(value: string, replacements: Record<string, string> = {}): string[] {
  const replaced = Object.entries(replacements).reduce((text, [key, replacement]) => text.replaceAll(`{${key}}`, replacement), value.trim());
  if (!replaced) return [];

  try {
    const parsed = JSON.parse(replaced);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
  } catch {
    // Fall back to shell-like whitespace splitting below.
  }

  const matches = replaced.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return matches.map((part) => {
    if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
      return part.slice(1, -1);
    }
    return part;
  });
}

function executableNames(command: string): string[] {
  if (process.platform !== "win32") return [command];
  const hasExtension = /\.[^\\/]+$/.test(command);
  if (hasExtension) return [command];
  const extensions = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return [
    command,
    ...extensions.map((extension) => `${command}${extension.toLowerCase()}`),
    ...extensions.map((extension) => `${command}${extension.toUpperCase()}`),
  ];
}

function canExecute(path: string): boolean {
  try {
    if (process.platform === "win32") return existsSync(path);
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandAvailable(command: string): boolean {
  if (!command) return false;
  if (isAbsolute(command) || command.includes("/") || command.includes("\\")) return canExecute(command);
  const pathDirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  return pathDirs.some((dir) => executableNames(command).some((name) => canExecute(join(dir, name))));
}

function targetAvailability(target: AudioTarget): string {
  if (target.unavailableReason) return `unavailable (${target.unavailableReason})`;
  if (!target.command) return "unavailable (no command configured)";
  if (!commandAvailable(target.command)) return `unavailable (missing ${target.command} on PATH)`;
  return `ready (${target.command})`;
}

function assertTargetAvailable(target: AudioTarget, purpose: string): void {
  if (!target.unavailableReason && target.command && commandAvailable(target.command)) return;
  const hint = target.hint ? ` ${target.hint}` : "";
  throw new Error(`${purpose} is ${targetAvailability(target)}. ${target.label}.${hint}`.trim());
}

function powershellEncodedArgs(script: string): string[] {
  return ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")];
}

function powerShellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function isPulseDevice(device: string): boolean {
  const normalized = device.trim().toLowerCase();
  return normalized === "" || normalized === "default" || normalized === "pulse";
}

function getPulseDefault(kind: "Sink" | "Source"): string | undefined {
  const result = spawnSync("pactl", ["info"], { encoding: "utf8", timeout: 1000 });
  if (result.status !== 0 || typeof result.stdout !== "string") return undefined;
  const match = result.stdout.match(new RegExp(`^Default ${kind}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
}

function isXrdpPulseDefault(kind: "Sink" | "Source"): boolean {
  return (getPulseDefault(kind) ?? "").toLowerCase().includes("xrdp");
}

function micVolumeTarget(): string {
  return isXrdpPulseDefault("Source") ? XRDP_MIC_VOLUME : MIC_VOLUME;
}

function resolveSttInput(): AudioTarget {
  const customCommand = envValue("PI_STT_COMMAND");
  if (customCommand) {
    return {
      backend: "custom",
      command: customCommand,
      args: splitEnvArgs(envValue("PI_STT_ARGS")),
      label: `custom STT recorder ${customCommand}`,
      hint: "The command must write raw signed 16-bit little-endian mono PCM at 16 kHz to stdout.",
    };
  }

  if (process.platform === "win32") {
    return {
      backend: "native",
      command: "",
      args: [],
      label: "Windows microphone input",
      unavailableReason: "no default Windows recorder is bundled",
      hint: "Install a recorder such as FFmpeg and set PI_STT_COMMAND/PI_STT_ARGS to output raw signed 16-bit little-endian mono PCM at 16 kHz to stdout.",
    };
  }

  if (process.platform === "darwin") {
    return {
      backend: "native",
      command: "",
      args: [],
      label: "macOS microphone input",
      unavailableReason: "no default macOS recorder is bundled",
      hint: "Install a recorder such as FFmpeg and set PI_STT_COMMAND/PI_STT_ARGS to output raw signed 16-bit little-endian mono PCM at 16 kHz to stdout.",
    };
  }

  const configured = envValue("PI_STT_ALSA_DEVICE");
  const pulseSource = envValue("PI_STT_PULSE_SOURCE");

  if (pulseSource || isPulseDevice(configured) || isXrdpPulseDefault("Source")) {
    const args = ["--record", "--device=@DEFAULT_SOURCE@", "--format=s16le", "--rate=16000", "--channels=1", "--raw"];
    if (pulseSource) args[1] = `--device=${pulseSource}`;
    return {
      backend: "pulse",
      command: "parec",
      args,
      label: pulseSource ? `PulseAudio source ${pulseSource}` : "PulseAudio default source",
      hint: "Install PulseAudio/PipeWire Pulse tools, configure PI_STT_PULSE_SOURCE, or set PI_STT_COMMAND/PI_STT_ARGS for a custom recorder.",
    };
  }

  return {
    backend: "alsa",
    command: "arecord",
    args: ["-D", configured || PULSE_DEFAULT_DEVICE, "-r", "16000", "-c", "1", "-f", "S16_LE", "-t", "raw"],
    label: `ALSA device ${configured || PULSE_DEFAULT_DEVICE}`,
    hint: "Install ALSA arecord or set PI_STT_COMMAND/PI_STT_ARGS for a custom recorder.",
  };
}

function resolveTtsOutput(path: string): AudioTarget {
  const customCommand = envValue("PI_TTS_COMMAND");
  if (customCommand) {
    const configuredArgs = splitEnvArgs(envValue("PI_TTS_ARGS"), { file: path });
    return {
      backend: "custom",
      command: customCommand,
      args: configuredArgs.length > 0 ? configuredArgs : [path],
      label: `custom TTS player ${customCommand}`,
      hint: "Use {file} in PI_TTS_ARGS to choose where the generated WAV path is inserted.",
    };
  }

  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System",
      `$player = [System.Media.SoundPlayer]::new(${powerShellSingleQuoted(path)})`,
      "$player.PlaySync()",
    ].join("; ");
    return {
      backend: "powershell",
      command: "powershell.exe",
      args: powershellEncodedArgs(script),
      label: "Windows SoundPlayer",
      hint: "Set PI_TTS_COMMAND/PI_TTS_ARGS if PowerShell SoundPlayer is unavailable.",
    };
  }

  if (process.platform === "darwin") {
    return {
      backend: "native",
      command: "afplay",
      args: [path],
      label: "macOS afplay output",
      hint: "Install afplay or set PI_TTS_COMMAND/PI_TTS_ARGS for a custom player.",
    };
  }

  const configured = envValue("PI_TTS_ALSA_DEVICE");
  const pulseSink = envValue("PI_TTS_PULSE_SINK");

  if (pulseSink || isPulseDevice(configured) || isXrdpPulseDefault("Sink")) {
    const args = pulseSink ? [`--device=${pulseSink}`, path] : [path];
    return {
      backend: "pulse",
      command: "paplay",
      args,
      label: pulseSink ? `PulseAudio sink ${pulseSink}` : "PulseAudio default sink",
      hint: "Install PulseAudio/PipeWire Pulse tools, configure PI_TTS_PULSE_SINK, or set PI_TTS_COMMAND/PI_TTS_ARGS for a custom player.",
    };
  }

  return {
    backend: "alsa",
    command: "pasuspender",
    args: ["--", "aplay", "-D", configured || PULSE_DEFAULT_DEVICE, path],
    label: `ALSA device ${configured || PULSE_DEFAULT_DEVICE}`,
    hint: "Install ALSA aplay/pasuspender or set PI_TTS_COMMAND/PI_TTS_ARGS for a custom player.",
  };
}

let tts: any | undefined;
let recognizer: any | undefined;
let activePlayback: ReturnType<typeof spawn> | undefined;
let speechGeneration = 0;

export type RecordingProcess = ChildProcessWithoutNullStreams & { chunks: Buffer[] };

type MicrophoneSample = {
  input: string;
  bytes: number;
  samples: number;
  peak: number;
  rms: number;
};

function required(paths: string[]): string[] {
  return paths.filter((path) => !existsSync(path));
}

export function sherpaModelStatus(): string {
  const missingTts = required([
    join(ttsModelDir(), TTS_MODEL_FILE),
    join(ttsModelDir(), "voices.bin"),
    join(ttsModelDir(), "tokens.txt"),
    join(ttsModelDir(), "espeak-ng-data"),
  ]);
  const missingAsr = required([
    join(asrModelDir(), ASR_ENCODER_FILE),
    join(asrModelDir(), ASR_DECODER_FILE),
    join(asrModelDir(), ASR_TOKENS_FILE),
  ]);

  let engine = "sherpa-onnx-node: not loaded";
  try {
    const sherpa = loadSherpa();
    engine = `sherpa-onnx-node ${sherpa.version ?? "unknown"}`;
  } catch {
    engine = `sherpa-onnx-node unavailable (${sherpaLoadError ?? "unknown error"})`;
  }

  return [
    `Engine: ${engine}`,
    `Setup: ${SHERPA_SETUP_HINT}`,
    `Model root: ${modelRoot()}`,
    `TTS model: ${TTS_MODEL_NAME} (${missingTts.length === 0 ? "ready" : `missing ${missingTts.length} file(s)`}), speaker ID ${TTS_SPEAKER_ID}`,
    `STT model: ${ASR_MODEL_NAME} (${missingAsr.length === 0 ? "ready" : `missing ${missingAsr.length} file(s)`}), language ${ASR_LANGUAGE || "auto"}`,
    `Mic volume target: ${micVolumeTarget()}`,
    `TTS preroll: ${TTS_PREROLL_MS}ms`,
    `PulseAudio default source: ${getPulseDefault("Source") ?? "unavailable"}`,
    `PulseAudio default sink: ${getPulseDefault("Sink") ?? "unavailable"}`,
    `STT input: ${resolveSttInput().label} — ${targetAvailability(resolveSttInput())}`,
    `TTS output: ${resolveTtsOutput("<generated wav>").label} — ${targetAvailability(resolveTtsOutput("<generated wav>"))}`,
  ].join("\n");
}

function ensureTtsModel(): void {
  const missing = required([
    join(ttsModelDir(), TTS_MODEL_FILE),
    join(ttsModelDir(), "voices.bin"),
    join(ttsModelDir(), "tokens.txt"),
    join(ttsModelDir(), "espeak-ng-data"),
  ]);
  if (missing.length > 0) throw new Error(`Missing TTS model files under ${ttsModelDir()}`);
}

function ensureAsrModel(): void {
  const missing = required([
    join(asrModelDir(), ASR_ENCODER_FILE),
    join(asrModelDir(), ASR_DECODER_FILE),
    join(asrModelDir(), ASR_TOKENS_FILE),
  ]);
  if (missing.length > 0) throw new Error(`Missing STT model files under ${asrModelDir()}`);
}

async function getTts(): Promise<any> {
  if (tts) return tts;
  ensureTtsModel();
  const sherpa = loadSherpa();
  tts = await sherpa.OfflineTts.createAsync({
    model: {
      kokoro: {
        model: join(ttsModelDir(), TTS_MODEL_FILE),
        voices: join(ttsModelDir(), "voices.bin"),
        tokens: join(ttsModelDir(), "tokens.txt"),
        dataDir: join(ttsModelDir(), "espeak-ng-data"),
      },
      debug: false,
      numThreads: 2,
      provider: "cpu",
    },
    maxNumSentences: 1,
  });
  return tts;
}

async function getRecognizer(): Promise<any> {
  if (recognizer) return recognizer;
  ensureAsrModel();
  const sherpa = loadSherpa();
  recognizer = await sherpa.OfflineRecognizer.createAsync({
    featConfig: {
      sampleRate: 16000,
      featureDim: 80,
    },
    modelConfig: {
      whisper: {
        encoder: join(asrModelDir(), ASR_ENCODER_FILE),
        decoder: join(asrModelDir(), ASR_DECODER_FILE),
        language: ASR_LANGUAGE,
        task: ASR_TASK,
        tailPaddings: -1,
      },
      tokens: join(asrModelDir(), ASR_TOKENS_FILE),
      numThreads: 2,
      provider: "cpu",
      debug: 0,
    },
  });
  return recognizer;
}

function addTtsPreroll(samples: Float32Array | number[], sampleRate: number): Float32Array | number[] {
  // Pulse/XRDP sinks can drop the first few frames while a fresh paplay stream opens.
  // A short silence pad keeps the first spoken word out of that wake-up window.
  const silenceSamples = Math.round((sampleRate * TTS_PREROLL_MS) / 1000);
  if (silenceSamples <= 0) return samples;

  const padded = new Float32Array(silenceSamples + samples.length);
  padded.set(samples, silenceSamples);
  return padded;
}

function playWav(path: string, generation: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (generation !== speechGeneration) {
      resolve();
      return;
    }

    const output = resolveTtsOutput(path);
    assertTargetAvailable(output, "TTS playback");
    const child = spawn(output.command, output.args, { stdio: ["ignore", "ignore", "pipe"] });
    activePlayback = child;
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (activePlayback === child) activePlayback = undefined;
      if (signal === "SIGTERM" || code === 0) resolve();
      else reject(new Error(stderr.trim() || `${output.command} ${output.args.join(" ")} failed with code ${code}`));
    });
  });
}

export function stopSherpaSpeech(): void {
  speechGeneration += 1;
  if (!activePlayback) return;
  try {
    activePlayback.kill("SIGTERM");
  } catch {
    // already stopped
  }
  activePlayback = undefined;
}

export function resetSherpaRuntime(): void {
  stopSherpaSpeech();
  tts = undefined;
  recognizer = undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function speakWithSherpa(text: string): Promise<void> {
  const sherpa = loadSherpa();
  const generation = speechGeneration;
  const engine = await withTimeout(getTts(), 30_000, "TTS model load");
  const audio = await withTimeout(engine.generateAsync({
    text,
    enableExternalBuffer: true,
    generationConfig: new sherpa.GenerationConfig({
      sid: TTS_SPEAKER_ID,
      speed: 1.0,
      silenceScale: 0.2,
    }),
  }), 120_000, "TTS generation");

  const dir = await mkdtemp(join(tmpdir(), "pi-sherpa-tts-"));
  const wav = join(dir, "speech.wav");
  try {
    sherpa.writeWave(wav, { samples: addTtsPreroll(audio.samples, audio.sampleRate), sampleRate: audio.sampleRate });
    await playWav(wav, generation);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function startSherpaRecording(): RecordingProcess {
  const input = resolveSttInput();
  assertTargetAvailable(input, "Voice input");
  normalizeMicVolume(input);
  const child = spawn(input.command, input.args, { stdio: ["ignore", "pipe", "pipe"] }) as RecordingProcess;
  child.chunks = [];
  child.stdout.on("data", (chunk) => child.chunks.push(Buffer.from(chunk)));
  return child;
}

export function recordingByteLength(child: RecordingProcess): number {
  return child.chunks.reduce((total, chunk) => total + chunk.length, 0);
}

export function stopSherpaRecording(child: RecordingProcess): void {
  try {
    child.kill("SIGINT");
  } catch {
    // already stopped
  }
}

export async function transcribeSherpaRecording(child: RecordingProcess): Promise<string> {
  const buffer = Buffer.concat(child.chunks);
  return transcribeSherpaPcm16(buffer);
}

function pcm16Stats(buffer: Buffer): Omit<MicrophoneSample, "input"> {
  const samples = Math.floor(buffer.length / 2);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    const value = buffer.readInt16LE(i * 2);
    const absolute = Math.abs(value);
    if (absolute > peak) peak = absolute;
    sum += value * value;
  }
  return {
    bytes: buffer.length,
    samples,
    peak,
    rms: samples > 0 ? Math.sqrt(sum / samples) : 0,
  };
}

function waitForClose(child: RecordingProcess, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    child.once("close", finish);
    setTimeout(() => {
      if (!done) {
        try { child.kill("SIGTERM"); } catch { /* ignore */ }
      }
      finish();
    }, timeoutMs);
  });
}

export async function sampleSherpaMicrophone(durationMs = 5000): Promise<MicrophoneSample> {
  const input = resolveSttInput().label;
  const child = startSherpaRecording();
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  stopSherpaRecording(child);
  await waitForClose(child);
  return { input, ...pcm16Stats(Buffer.concat(child.chunks)) };
}

export async function transcribeSherpaPcm16(buffer: Buffer): Promise<string> {
  if (buffer.length < 16000 * 2 * 0.25) return "";
  const samples = new Float32Array(Math.floor(buffer.length / 2));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.max(-1, Math.min(1, buffer.readInt16LE(i * 2) / 32768));
  }

  const engine = await withTimeout(getRecognizer(), 30_000, "STT model load");
  const stream = engine.createStream();
  stream.acceptWaveform({ sampleRate: 16000, samples });
  await withTimeout(engine.decodeAsync(stream), 120_000, "STT transcription");
  const result = engine.getResult(stream);
  return String(result?.text ?? "").trim();
}

function normalizeMicVolume(input: AudioTarget): void {
  if (input.backend !== "pulse" || !commandAvailable("pactl")) return;
  const target = micVolumeTarget();
  if (!target) return;
  const percent = Math.max(1, Math.min(150, Math.round(Number(target) * 100)));
  spawnSync("pactl", ["set-source-mute", "@DEFAULT_SOURCE@", "0"], { stdio: "ignore" });
  spawnSync("pactl", ["set-source-volume", "@DEFAULT_SOURCE@", `${percent}%`], { stdio: "ignore" });
}
