import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getMemoryPaths } from "../memory/paths.ts";
import { sherpaModelStatus } from "../voice/sherpa-runtime.ts";
import { saveSpotifySetupConfig, spotifyLoginWithLocalCallback, spotifySetupStatusText } from "../spotify/spotify-use.ts";
import { startWhatsAppQrPairing } from "../whatsapp/whatsapp-use.ts";
import { loadWhatsAppConfig, phoneToPersonalJid, saveWhatsAppConfig, whatsappAuthDir, whatsappConfigPath } from "../whatsapp/whatsapp-utils.ts";
import {
  defaultMemoryConfig,
  defaultVoiceModelDir,
  ensureSetupDirectories,
  getNazarDirs,
  nazarSetupConfigPath,
  readNazarSetupConfig,
  type SetupProfile,
  writeNazarSetupConfig,
} from "./setup-store.ts";

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const VOICE_SETUP_SCRIPT = resolve(EXTENSION_DIR, "../voice/setup-sherpa.mjs");

function hasInteractiveUi(ctx: { hasUI?: boolean }): boolean {
  return ctx.hasUI !== false;
}

async function show(ctx: ExtensionContext, title: string, text: string, level: "info" | "warning" | "error" = "info"): Promise<void> {
  if (!hasInteractiveUi(ctx)) {
    console.log(text);
    return;
  }
  ctx.ui.setWidget("nazar-setup", text.split("\n"));
  ctx.ui.notify(title, level);
}

function maskPhone(phone?: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 4) return phone ? "configured" : "not configured";
  return `+${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

async function statusText(): Promise<string> {
  const config = readNazarSetupConfig();
  const dirs = getNazarDirs();
  const paths = getMemoryPaths();
  const whatsappConfigPathText = whatsappConfigPath();
  const whatsappAuthDirText = whatsappAuthDir();
  let whatsappAllowed = "not configured";
  try {
    whatsappAllowed = maskPhone((await loadWhatsAppConfig()).allowedPhone);
  } catch (error) {
    whatsappAllowed = `config error: ${error instanceof Error ? error.message : String(error)}`;
  }

  let spotifyStatus = "";
  try {
    spotifyStatus = spotifySetupStatusText();
  } catch (error) {
    spotifyStatus = `Spotify config error: ${error instanceof Error ? error.message : String(error)}`;
  }

  return [
    "Nazar setup status",
    "",
    `Profile: ${config.profile || "unknown"}`,
    `Config: ${nazarSetupConfigPath()}`,
    `Config dir: ${dirs.configDir}`,
    `State dir: ${dirs.stateDir}`,
    `Data dir: ${dirs.dataDir}`,
    "",
    "Memory:",
    `- Vault: ${paths.VAULT_DIR || "(not configured; local dev fallback)"}`,
    `- Runtime root: ${paths.MEMORY_ROOT}`,
    `- Search/pages root: ${paths.PAGES_DIR}`,
    `- AI/wiki pages: ${paths.AI_PAGES_DIR}`,
    `- Human vault: ${paths.PERSONAL_PAGES_DIR}`,
    "",
    "Voice:",
    ...sherpaModelStatus().split("\n").map((line) => `- ${line}`),
    "",
    "WhatsApp:",
    `- Allowed phone: ${whatsappAllowed}`,
    `- Config path: ${whatsappConfigPathText}`,
    `- Auth dir: ${whatsappAuthDirText} (${existsSync(whatsappAuthDirText) ? "present" : "missing"})`,
    "",
    "Spotify:",
    ...spotifyStatus.split("\n").map((line) => `- ${line}`),
  ].join("\n");
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

async function configureProfile(ctx: ExtensionContext): Promise<SetupProfile | undefined> {
  const selected = await choose(ctx, "What kind of computer is this?", ["laptop", "desktop", "remote", "headless", "custom"]);
  if (!selected) return undefined;
  const profile = selected as SetupProfile;
  writeNazarSetupConfig({ profile });
  return profile;
}

function memoryConfigFromVault(vaultDir: string) {
  return {
    vaultDir,
    rootDir: join(vaultDir, "05_Nazar", "runtime"),
    pagesDir: vaultDir,
    aiPagesDir: join(vaultDir, "05_Nazar", "llm-wiki", "wiki"),
    humanPagesDir: vaultDir,
  };
}

function memoryConfigSummary(memory: ReturnType<typeof memoryConfigFromVault>): string {
  return [
    `Vault root: ${memory.vaultDir}`,
    "",
    "Derived paths:",
    `- Runtime/state: ${memory.rootDir}`,
    `- QMD/search root: ${memory.pagesDir}`,
    `- AI/LLM wiki: ${memory.aiPagesDir}`,
    `- Human Obsidian vault: ${memory.humanPagesDir}`,
  ].join("\n");
}

async function configureMemory(ctx: ExtensionContext): Promise<void> {
  const defaults = defaultMemoryConfig();
  const current = readNazarSetupConfig().memory || {};
  const vaultInput = await input(ctx, "Nazar Obsidian vault root", current.vaultDir || defaults.vaultDir);
  const vaultDir = (vaultInput?.trim() || current.vaultDir || defaults.vaultDir).trim();
  if (!vaultDir) {
    await show(ctx, "Memory setup cancelled", "No Nazar vault root was selected. Memory configuration was left unchanged.", "warning");
    return;
  }

  let memory = memoryConfigFromVault(vaultDir);
  const useDerived = await confirm(ctx, "Use derived memory paths?", `${memoryConfigSummary(memory)}\n\nRecommended: Yes. Choose No only if you need advanced path overrides.`);
  if (!useDerived) {
    const customize = await confirm(ctx, "Advanced memory paths", "Customize individual runtime/search/wiki/human paths? Choose No to cancel memory setup without changes.");
    if (!customize) {
      await show(ctx, "Memory setup cancelled", "Memory configuration was left unchanged.", "warning");
      return;
    }

    memory = {
      vaultDir,
      rootDir: await input(ctx, "Runtime/state root", current.rootDir || memory.rootDir) || current.rootDir || memory.rootDir,
      pagesDir: await input(ctx, "QMD/search root", current.pagesDir || memory.pagesDir) || current.pagesDir || memory.pagesDir,
      aiPagesDir: await input(ctx, "AI/LLM wiki pages dir", current.aiPagesDir || memory.aiPagesDir) || current.aiPagesDir || memory.aiPagesDir,
      humanPagesDir: await input(ctx, "Human Obsidian vault dir", current.humanPagesDir || memory.humanPagesDir) || current.humanPagesDir || memory.humanPagesDir,
    };
  }

  writeNazarSetupConfig({ memory });
  ensureSetupDirectories(readNazarSetupConfig());
  await show(ctx, "Memory configured", `${memoryConfigSummary(memory)}\n\nRun /reload or restart Pi so all extensions see the updated vault paths.`);
}

function parseDirectShowAudioDevices(output: string): string[] {
  const devices: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/"(.+)" \(audio\)/);
    if (match?.[1]) devices.push(match[1]);
  }
  return [...new Set(devices)];
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

async function configureWhatsApp(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const current = await loadWhatsAppConfig();
  const phone = await input(ctx, "Allowed WhatsApp phone", current.allowedPhone || "+15551234567");
  const allowedPhone = phone?.trim() || current.allowedPhone;
  if (!phoneToPersonalJid(allowedPhone)) {
    await show(ctx, "WhatsApp setup needs a valid phone", "Enter a single personal phone number with country code, e.g. +15551234567.", "warning");
    return;
  }
  const autoStart = await confirm(ctx, "WhatsApp autostart", "Connect WhatsApp automatically when Pi starts after pairing?");
  await saveWhatsAppConfig({ allowedPhone, autoStart });
  writeNazarSetupConfig({ whatsapp: { configured: true, paired: false } });

  const showQr = await confirm(ctx, "WhatsApp QR pairing", "Start WhatsApp now and show the linked-device QR code in Pi? Scan it from WhatsApp → Linked devices → Link a device.");
  if (!showQr) return;

  try {
    const result = await startWhatsAppQrPairing(pi, ctx);
    writeNazarSetupConfig({ whatsapp: { configured: true, paired: result.includes("connected") } });
    const qrHint = result.startsWith("WhatsApp connection started")
      ? "\n\nA WhatsApp QR popup will appear when WhatsApp returns a pairing code. Keep Pi open while scanning."
      : "";
    await show(ctx, "WhatsApp pairing started", `${result}${qrHint}`);
  } catch (error) {
    await show(ctx, "WhatsApp pairing failed", error instanceof Error ? error.message : String(error), "error");
  }
}

async function configureSpotify(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const clientId = await input(ctx, "Spotify Client ID", "");
  const redirectUri = await input(ctx, "Spotify redirect URI", "http://127.0.0.1:53682/callback");
  if (clientId?.trim() || redirectUri?.trim()) {
    saveSpotifySetupConfig({ clientId: clientId?.trim() || undefined, redirectUri: redirectUri?.trim() || undefined });
    writeNazarSetupConfig({ spotify: { configured: Boolean(clientId?.trim()), loggedIn: false } });
  }

  const startLogin = await confirm(ctx, "Spotify login", "Start Spotify OAuth login now? This opens your browser and stores the token outside the repository.");
  if (!startLogin) return;

  try {
    const result = await spotifyLoginWithLocalCallback(pi, ctx);
    writeNazarSetupConfig({ spotify: { configured: true, loggedIn: true } });
    await show(ctx, "Spotify login complete", result);
  } catch (error) {
    await show(ctx, "Spotify login failed", error instanceof Error ? error.message : String(error), "error");
  }
}

type SetupSection = "memory" | "voice" | "whatsapp" | "spotify";

type SetupProvider = {
  id: SetupSection;
  label: string;
  configure: (pi: ExtensionAPI, ctx: ExtensionContext) => Promise<void>;
};

const SETUP_PROVIDERS: SetupProvider[] = [
  { id: "memory", label: "Memory", configure: async (_pi, ctx) => configureMemory(ctx) },
  { id: "voice", label: "Voice", configure: configureVoice },
  { id: "whatsapp", label: "WhatsApp", configure: configureWhatsApp },
  { id: "spotify", label: "Spotify", configure: configureSpotify },
];

function validSetupSections(): string[] {
  return ["all", ...SETUP_PROVIDERS.map((provider) => provider.id)];
}

type SetupAction = "all" | SetupSection | "status" | "doctor" | "cancel";

async function showSetupMenu(ctx: ExtensionContext): Promise<SetupAction | undefined> {
  const config = readNazarSetupConfig();
  const memory = { ...defaultMemoryConfig(), ...config.memory };
  const items: SelectItem[] = [
    { value: "all", label: "Run full setup (recommended)", description: "Profile, memory, voice, WhatsApp, and Spotify" },
    { value: "memory", label: "Configure memory", description: `vault at ${memory.vaultDir}` },
    { value: "voice", label: "Configure voice", description: "Local TTS/STT models, recorder, and playback" },
    { value: "whatsapp", label: "Configure WhatsApp", description: "Allowed contact, autostart, and optional QR pairing" },
    { value: "spotify", label: "Configure Spotify", description: "Client ID, redirect URI, and optional OAuth login" },
    { value: "status", label: "Show status", description: "Inspect current Nazar setup without changing files" },
    { value: "doctor", label: "Run doctor", description: "Show status plus post-setup notes" },
    { value: "cancel", label: "Cancel", description: "Close setup without changes" },
  ];

  const result = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Nazar setup")), 1, 0));
    container.addChild(new Text(theme.fg("dim", "Choose what to configure. Secrets and auth tokens are kept outside Nazar setup config."), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });
    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);
    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

    return {
      render(width: number) {
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
      handleInput(data: string) {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });

  return (result || undefined) as SetupAction | undefined;
}

async function runSetup(pi: ExtensionAPI, ctx: ExtensionContext, section?: string): Promise<void> {
  if (!hasInteractiveUi(ctx)) {
    await show(ctx, "Nazar setup", `${await statusText()}\n\nInteractive setup requires Pi interactive mode. Run /nazar-setup in the TUI.`);
    return;
  }

  mkdirSync(dirname(nazarSetupConfigPath()), { recursive: true, mode: 0o700 });

  if (!section || section === "all") await configureProfile(ctx);
  for (const provider of SETUP_PROVIDERS) {
    if (!section || section === "all" || section === provider.id) {
      await show(ctx, `Nazar setup: ${provider.label}`, `Configuring ${provider.label.toLowerCase()}…`);
      await provider.configure(pi, ctx);
    }
  }

  await show(ctx, "Nazar setup complete", `${await statusText()}\n\nNext: run /reload or restart Pi so all setup config is active. Then run /voice status, /whatsapp start or /whatsapp pair, and /spotify status as needed.`);
}

export function registerNazarSetupUse(pi: ExtensionAPI): void {
  pi.registerCommand("nazar-setup", {
    description: "Configure Nazar memory, voice, WhatsApp, and Spotify after installation",
    handler: async (args, ctx) => {
      let section = args.trim().toLowerCase();
      if (!section && hasInteractiveUi(ctx)) {
        const action = await showSetupMenu(ctx);
        if (!action || action === "cancel") {
          ctx.ui.notify("Nazar setup cancelled", "info");
          return;
        }
        section = action;
      }

      if (["status", "doctor"].includes(section)) {
        await show(ctx, "Nazar setup status", `${await statusText()}\n\nDoctor notes:\n- Reload/restart Pi after setup changes.\n- OAuth and WhatsApp auth are never stored in Nazar setup config.\n- On Windows, use winget for host dependencies when available.`);
        return;
      }
      if (section && !validSetupSections().includes(section)) {
        await show(ctx, "Nazar setup help", "Usage: /nazar-setup [status|doctor|memory|voice|whatsapp|spotify]", "warning");
        return;
      }
      await runSetup(pi, ctx, section || "all");
    },
  });

  pi.registerCommand("nazar-status", {
    description: "Show Nazar setup status",
    handler: async (_args, ctx) => show(ctx, "Nazar setup status", await statusText()),
  });
}
