import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultVoiceModelDir, readNazarSetupConfig, writeNazarSetupConfig } from "@nazar/core/setup";
import { registerSetupProvider, type SetupProvider } from "@nazar/core/setup-registry";
import { hasInteractiveUi, showText } from "@nazar/core/shared";

import { sherpaModelStatus } from "./sherpa-runtime.ts";

const VOICE_SETUP_SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "setup-sherpa.mjs");

async function show(ctx: ExtensionContext, title: string, text: string, level: "info" | "warning" | "error" = "info"): Promise<void> {
  await showText(ctx, "nazar-setup", text, title, level);
}

async function choose(ctx: ExtensionContext, title: string, options: string[]): Promise<string | undefined> {
  if (!hasInteractiveUi(ctx)) return undefined;
  return ctx.ui.select(title, options);
}

async function input(ctx: ExtensionContext, title: string, placeholder = ""): Promise<string | undefined> {
  if (!hasInteractiveUi(ctx)) return undefined;
  return ctx.ui.input(title, placeholder);
}

async function confirm(ctx: ExtensionContext, title: string, message: string): Promise<boolean> {
  if (!hasInteractiveUi(ctx)) return false;
  return ctx.ui.confirm(title, message);
}

function parseDirectShowAudioDevices(output: string): string[] {
  const devices: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/"(.+)" \(audio\)/);
    if (match?.[1]) devices.push(match[1]);
  }
  return [...new Set(devices)];
}

function parseAvfoundationAudioDevices(output: string): Array<{ index: string; name: string }> {
  const devices: Array<{ index: string; name: string }> = [];
  let inAudioSection = false;
  for (const line of output.split(/\r?\n/)) {
    if (/AVFoundation audio devices:/i.test(line)) {
      inAudioSection = true;
      continue;
    }
    if (/AVFoundation video devices:/i.test(line)) {
      inAudioSection = false;
      continue;
    }
    if (!inAudioSection) continue;
    const match = line.match(/\[(\d+)\]\s+(.+)\s*$/);
    if (match?.[1] && match[2]) devices.push({ index: match[1], name: match[2].trim() });
  }
  return devices;
}

async function configureWindowsVoice(pi: ExtensionAPI, ctx: ExtensionContext): Promise<boolean> {
  const ffmpeg = await pi.exec("powershell.exe", ["-NoProfile", "-Command", "(Get-Command ffmpeg -ErrorAction SilentlyContinue).Source"], { timeout: 5000 });
  const ffmpegPath = ffmpeg.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "";
  if (!ffmpegPath || ffmpeg.code !== 0) {
    await show(ctx, "FFmpeg missing", "FFmpeg is not available. On Windows install it with winget: winget install --id Gyan.FFmpeg -e --source winget --accept-source-agreements --accept-package-agreements", "warning");
    return false;
  }

  const devicesResult = await pi.exec(ffmpegPath, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], { timeout: 10000 });
  const devices = parseDirectShowAudioDevices(`${devicesResult.stdout}\n${devicesResult.stderr}`);
  const selected = devices.length > 0
    ? await choose(ctx, "Choose microphone", devices)
    : await input(ctx, "Microphone device name", "Microphone Array (Realtek(R) Audio)");
  if (!selected) return false;

  const sttArgs = ["-hide_banner", "-loglevel", "error", "-f", "dshow", "-i", `audio=${selected}`, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"];
  writeNazarSetupConfig({ voice: { modelDir: readNazarSetupConfig().voice?.modelDir || defaultVoiceModelDir(), sttCommand: ffmpegPath, sttArgs } });
  return true;
}

async function configureMacVoice(pi: ExtensionAPI, ctx: ExtensionContext): Promise<boolean> {
  const ffmpeg = await pi.exec("sh", ["-lc", "command -v ffmpeg"], { timeout: 5000 });
  const ffmpegPath = ffmpeg.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "";
  if (!ffmpegPath || ffmpeg.code !== 0) {
    await show(ctx, "FFmpeg missing", "FFmpeg is not available on PATH. Install FFmpeg for macOS, then rerun /nazar setup or configure PI_STT_COMMAND/PI_STT_ARGS manually.", "warning");
    return false;
  }

  const devicesResult = await pi.exec(ffmpegPath, ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], { timeout: 10000 });
  const devices = parseAvfoundationAudioDevices(`${devicesResult.stdout}\n${devicesResult.stderr}`);
  const labels = devices.map((device) => `[${device.index}] ${device.name}`);
  const selected = labels.length > 0
    ? await choose(ctx, "Choose microphone", labels)
    : await input(ctx, "Microphone avfoundation index", "0");
  if (!selected) return false;

  const deviceId = selected.match(/^\[(\d+)\]/)?.[1] || selected.trim();
  if (!deviceId) return false;
  const sttArgs = ["-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", `:${deviceId}`, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"];
  writeNazarSetupConfig({ voice: { modelDir: readNazarSetupConfig().voice?.modelDir || defaultVoiceModelDir(), sttCommand: ffmpegPath, sttArgs } });
  return true;
}

async function configureVoice(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const voiceModelDir = readNazarSetupConfig().voice?.modelDir || defaultVoiceModelDir();
  writeNazarSetupConfig({ voice: { modelDir: voiceModelDir } });

  const setupModels = await confirm(ctx, "Configure voice models", "Run the Sherpa model setup now? This can download large local TTS/STT model files.");
  if (setupModels) {
    await show(ctx, "Voice setup", "Running voice model setup. This can take several minutes…");
    const result = await pi.exec("node", [VOICE_SETUP_SCRIPT], { timeout: 900_000 });
    if (result.code !== 0) {
      await show(ctx, "Voice model setup failed", result.stderr || result.stdout || "Voice model setup failed.", "error");
      return;
    }
  }

  if (process.platform === "win32") {
    await configureWindowsVoice(pi, ctx);
  } else if (process.platform === "darwin") {
    await configureMacVoice(pi, ctx);
  } else {
    const command = await input(ctx, "Optional custom STT command", readNazarSetupConfig().voice?.sttCommand || "");
    if (command?.trim()) {
      const argsText = await input(ctx, "STT args JSON array", JSON.stringify(readNazarSetupConfig().voice?.sttArgs || []));
      let sttArgs: string[] = [];
      try { sttArgs = JSON.parse(argsText || "[]"); } catch { sttArgs = []; }
      writeNazarSetupConfig({ voice: { modelDir: readNazarSetupConfig().voice?.modelDir || defaultVoiceModelDir(), sttCommand: command.trim(), sttArgs } });
    } else {
      writeNazarSetupConfig({ voice: { modelDir: readNazarSetupConfig().voice?.modelDir || defaultVoiceModelDir() } });
    }
  }
}

export function registerVoiceSetupProvider(): () => void {
  const provider: SetupProvider = {
    id: "voice",
    label: "Voice",
    order: 20,
    configure: configureVoice,
    statusText: sherpaModelStatus,
  };
  return registerSetupProvider(provider);
}
