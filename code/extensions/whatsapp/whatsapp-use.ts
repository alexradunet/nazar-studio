import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { mkdir, open, readFile, rm, type FileHandle } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { clearRemoteTurnOrigin, setRemoteTurnOrigin } from "../remote-origin.ts";
import { transcribeSherpaPcm16 } from "../voice/sherpa-runtime.ts";
import {
  assistantText,
  deleteWhatsAppAuth,
  extractText,
  filterIncomingMessage,
  getAudioMessage,
  getImageMessage,
  loadWhatsAppConfig,
  maskPhone,
  normalizeLidJid,
  normalizePersonalJid,
  normalizePhoneDigits,
  phoneToPersonalJid,
  saveWhatsAppConfig,
  type WhatsAppConfig,
  whatsappAuthDir,
  whatsappConfigPath,
  whatsappMasterLockPath,
} from "./whatsapp-utils.ts";

type WhatsAppStatus = "disconnected" | "connecting" | "pairing" | "connected" | "stopping" | "locked" | "error";

type WhatsAppInputContent = string | Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;

type QueuedTurn = {
  id: string;
  jid: string;
  kind: "text" | "image" | "audio";
  content: WhatsAppInputContent;
  receivedAt: number;
  injectedAt?: number;
};

type BaileysRuntime = {
  makeWASocket: any;
  useMultiFileAuthState: any;
  fetchLatestBaileysVersion?: any;
  downloadMediaMessage: any;
  makeCacheableSignalKeyStore?: any;
  DisconnectReason: Record<string, number>;
};

const HELP_TEXT = `Pi WhatsApp commands
- /whatsapp status — show config/auth/connection state
- /whatsapp allowed +15551234567 — set the single whitelisted 1:1 phone number
- /whatsapp start — connect WhatsApp with QR login when needed and claim this Pi as the WhatsApp master
- /whatsapp pair +15551230000 — connect using a WhatsApp linked-device pairing code instead of QR
- /whatsapp autostart on|off — connect automatically when Pi starts; the first running instance becomes master
- /whatsapp stop — disconnect this Pi process from WhatsApp and release master
- /whatsapp ping [text] — send a manual test message to the whitelisted chat
- /whatsapp logout — disconnect and delete local WhatsApp auth state
- Start Pi with --whatsapp-online to connect automatically on startup after pairing
- /whatsapp help — show this help

Behavior
- Only the configured 1:1 phone number can trigger Pi.
- Groups, broadcasts, status/newsletter chats, self messages, and all other senders are ignored.
- Images are passed to Pi as vision input.
- Audio/voice notes are transcribed with the existing Pi STT runtime before being sent to Pi.`;

let ctxRef: ExtensionContext | undefined;
let config: WhatsAppConfig = {};
let socket: any | undefined;
let status: WhatsAppStatus = "disconnected";
let lastError = "";
let activeWhatsAppTurn: QueuedTurn | undefined;
let inboundQueue: QueuedTurn[] = [];
let turnSerial = 0;
let bridgeStartedAtSeconds = 0;
let baileysLoad: Promise<BaileysRuntime> | undefined;
let lastInbound = "none";
let lastIgnored = "none";
let lastAccepted = "none";
let lastOutbound = "none";
let lastInjection = "none";
let lastReplyMatch = "none";
let lastSkippedReply = "none";
let allowedLids: string[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempts = 0;
let intentionalStop = false;
let logger: any | undefined;
let masterLockHandle: FileHandle | undefined;
let masterLockNote = "not claimed";
let qrPairingWaiter: { resolve: (message: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
let lastQrLines: string[] | undefined;
let lastQrShownAt = 0;
let qrOverlayClose: (() => void) | undefined;
let qrOverlayHandle: { hide?: () => void } | undefined;
let qrOverlaySerial = 0;

function positiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const MAX_INBOUND_QUEUE = positiveIntEnv("PI_WHATSAPP_MAX_QUEUE", 5);
const MAX_IMAGE_BYTES = positiveIntEnv("PI_WHATSAPP_MAX_IMAGE_BYTES", 8 * 1024 * 1024);
const MAX_AUDIO_BYTES = positiveIntEnv("PI_WHATSAPP_MAX_AUDIO_BYTES", 12 * 1024 * 1024);
const MAX_PCM_BYTES = positiveIntEnv("PI_WHATSAPP_MAX_PCM_BYTES", 20 * 1024 * 1024);
const MAX_RECONNECT_ATTEMPTS = positiveIntEnv("PI_WHATSAPP_MAX_RECONNECT_ATTEMPTS", 12);

function hasInteractiveUi(ctx: { hasUI?: boolean } | undefined): boolean {
  return ctx?.hasUI !== false;
}

function setStatus(next: WhatsAppStatus, detail?: string): void {
  status = next;
  const suffix = detail ? ` (${detail})` : "";
  try {
    ctxRef?.ui.setStatus("whatsapp", `WhatsApp: ${next}${suffix}`);
  } catch {
    // The session context can be stale during shutdown/reload; status is best-effort.
  }
}

function whatsappDependencyError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error([
    `WhatsApp runtime dependency failed to load: ${detail}`,
    "Repo-local setup: run `npm ci --prefix code/extensions/whatsapp` from the Nazar checkout.",
    "Installed package setup: install optional WhatsApp dependencies for the package or reinstall `@nazar/nazar-pi` with optional dependencies enabled.",
  ].join("\n"));
}

function finishQrPairingWait(message: string): void {
  const waiter = qrPairingWaiter;
  if (!waiter) return;
  qrPairingWaiter = undefined;
  clearTimeout(waiter.timer);
  waiter.resolve(message);
}

function failQrPairingWait(error: unknown): void {
  const waiter = qrPairingWaiter;
  if (!waiter) return;
  qrPairingWaiter = undefined;
  clearTimeout(waiter.timer);
  waiter.reject(error instanceof Error ? error : new Error(String(error)));
}

function waitForQrPairing(timeoutMs = 60_000): Promise<string> {
  if (qrPairingWaiter) failQrPairingWait(new Error("A previous WhatsApp QR pairing wait was replaced."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      qrPairingWaiter = undefined;
      resolve("Timed out waiting for a WhatsApp QR. Check `/whatsapp status`; if WhatsApp is already linked, no QR is needed.");
    }, timeoutMs);
    qrPairingWaiter = { resolve, reject, timer };
  });
}

function closeQrOverlay(): void {
  const close = qrOverlayClose;
  const handle = qrOverlayHandle;
  qrOverlaySerial += 1;
  qrOverlayClose = undefined;
  qrOverlayHandle = undefined;
  try {
    close?.();
  } catch {
    // Best-effort UI cleanup.
  }
  try {
    handle?.hide?.();
  } catch {
    // Best-effort UI cleanup.
  }
}

function showQrOverlay(lines: string[]): void {
  if (!hasInteractiveUi(ctxRef)) return;
  const ctx = ctxRef;
  if (!ctx) return;
  closeQrOverlay();

  const qrWidth = Math.max(...lines.map((line) => visibleWidth(line)), 0);
  const requestedWidth = Math.min(Math.max(qrWidth + 8, 72), 120);

  const overlaySerial = ++qrOverlaySerial;
  void ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (qrOverlaySerial === overlaySerial) {
        qrOverlayClose = undefined;
        qrOverlayHandle = undefined;
      }
      done();
    };
    qrOverlayClose = close;

    const component: Component = {
      render(width: number): string[] {
        const title = theme.fg("accent", theme.bold("WhatsApp pairing QR"));
        const help = theme.fg("dim", "Esc/Enter closes • terminal fallback also printed");
        const availableRows = Math.max(1, Math.floor(tui.terminal.rows));
        if (width < qrWidth + 2) {
          return [
            truncateToWidth(title, width),
            "",
            truncateToWidth(theme.fg("warning", `Terminal too narrow for QR: needs ${qrWidth + 2} columns, has ${width}.`), width),
            truncateToWidth("Enlarge the terminal or use /whatsapp pair +<pi-whatsapp-account-phone>.", width),
            "",
            truncateToWidth(help, width),
          ];
        }
        if (availableRows < lines.length) {
          return [
            truncateToWidth(title, width),
            "",
            truncateToWidth(theme.fg("warning", `Terminal too short for QR: needs ${lines.length} rows, has ${availableRows}.`), width),
            truncateToWidth("Enlarge the terminal or use /whatsapp pair +<pi-whatsapp-account-phone>.", width),
            truncateToWidth("The full QR was also printed to the terminal as fallback.", width),
            "",
            truncateToWidth(help, width),
          ];
        }

        const centeredQr = lines.map((line) => `${" ".repeat(Math.max(0, Math.floor((width - visibleWidth(line)) / 2)))}${line}`);
        if (availableRows < lines.length + 5) return centeredQr;

        return [
          truncateToWidth(title, width),
          truncateToWidth("Scan with WhatsApp → Linked devices → Link a device.", width),
          "",
          ...centeredQr,
          "",
          truncateToWidth(help, width),
        ];
      },
      handleInput(data: string): void {
        if (matchesKey(data, "escape") || matchesKey(data, "enter") || matchesKey(data, "ctrl+c")) close();
      },
      invalidate(): void {},
    };
    return component;
  }, {
    overlay: true,
    overlayOptions: { anchor: "center", width: requestedWidth, maxHeight: "100%", margin: 0 },
    onHandle: (handle) => {
      if (qrOverlaySerial === overlaySerial) qrOverlayHandle = handle;
    },
  }).finally(() => {
    if (qrOverlaySerial === overlaySerial) {
      qrOverlayClose = undefined;
      qrOverlayHandle = undefined;
    }
  });
}

function reshowRecentQr(ctx: ExtensionContext): boolean {
  if (!lastQrLines || Date.now() - lastQrShownAt > 120_000) return false;
  ctxRef = ctx;
  showQrOverlay(lastQrLines);
  ctx.ui.notify("WhatsApp QR re-shown. Scan it with the Pi phone.", "info");
  return true;
}

function allowedJid(): string | undefined {
  return normalizePersonalJid(config.allowedPhone);
}

function isPidAlive(pid: number | undefined): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readMasterLock(): Promise<any | undefined> {
  try {
    return JSON.parse(await readFile(whatsappMasterLockPath(), "utf8"));
  } catch {
    return undefined;
  }
}

async function acquireMasterLock(): Promise<string | undefined> {
  if (masterLockHandle) return undefined;

  const path = whatsappMasterLockPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      masterLockHandle = handle;
      const lock = {
        pid: process.pid,
        cwd: process.cwd(),
        startedAt: new Date().toISOString(),
        authDir: whatsappAuthDir(),
      };
      await handle.writeFile(JSON.stringify(lock, null, 2));
      masterLockNote = `this process (pid ${process.pid})`;
      return undefined;
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readMasterLock();
      if (existing?.pid && !isPidAlive(Number(existing.pid))) {
        await rm(path, { force: true });
        continue;
      }
      const owner = existing?.pid ? `pid ${existing.pid}` : "another process";
      masterLockNote = `locked by ${owner}`;
      return `WhatsApp master is already claimed by ${owner}. Attach that Pi/Zellij session, or stop it before starting WhatsApp here.`;
    }
  }

  return "Could not claim WhatsApp master lock.";
}

async function releaseMasterLock(): Promise<void> {
  const handle = masterLockHandle;
  if (!handle) {
    masterLockNote = "not claimed";
    return;
  }
  masterLockHandle = undefined;
  masterLockNote = "not claimed";
  try { await handle.close(); } catch { /* ignore */ }
  const existing = await readMasterLock();
  if (Number(existing?.pid) === process.pid) await rm(whatsappMasterLockPath(), { force: true });
}

async function assertCanResetAuth(): Promise<string | undefined> {
  if (masterLockHandle) return undefined;
  const existing = await readMasterLock();
  if (!existing?.pid) return undefined;
  const pid = Number(existing.pid);
  if (isPidAlive(pid)) {
    return `Refusing to delete WhatsApp auth while another master is running (pid ${pid}). Stop the Zellij master first if you really want to reset auth.`;
  }
  await rm(whatsappMasterLockPath(), { force: true });
  return undefined;
}

async function describeMasterLock(): Promise<string> {
  if (masterLockHandle) return masterLockNote;
  const existing = await readMasterLock();
  if (!existing?.pid) return "not claimed";
  const pid = Number(existing.pid);
  const state = isPidAlive(pid) ? "live" : "stale";
  const session = existing.sessionFile ? ` session=${existing.sessionFile}` : "";
  const cwd = existing.cwd ? ` cwd=${existing.cwd}` : "";
  return `${state} lock by pid ${pid}${cwd}${session}`;
}

async function loadBaileys(): Promise<BaileysRuntime> {
  if (baileysLoad) return baileysLoad;
  baileysLoad = (async () => {
    try {
      const baileys = await import("@whiskeysockets/baileys");
      const pino = (await import("pino")).default;
      logger = pino({ level: "silent" });
      return {
        makeWASocket: (baileys as any).default ?? (baileys as any).makeWASocket,
        useMultiFileAuthState: (baileys as any).useMultiFileAuthState,
        fetchLatestBaileysVersion: (baileys as any).fetchLatestBaileysVersion,
        downloadMediaMessage: (baileys as any).downloadMediaMessage,
        makeCacheableSignalKeyStore: (baileys as any).makeCacheableSignalKeyStore,
        DisconnectReason: (baileys as any).DisconnectReason ?? {},
      };
    } catch (error) {
      baileysLoad = undefined;
      throw whatsappDependencyError(error);
    }
  })();
  return baileysLoad;
}

function timestampSeconds(value: any): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value?.toNumber === "function") return value.toNumber();
  if (typeof value?.low === "number") return value.low;
  return 0;
}

async function convertAudioToPcm16(audio: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-i", "pipe:0",
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-ac", "1",
      "-ar", "16000",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `ffmpeg exited with code ${code}`));
    });
    child.stdin.end(audio);
  });
}

async function downloadMedia(baileys: BaileysRuntime, message: any): Promise<Buffer> {
  const buffer = await baileys.downloadMediaMessage(
    message,
    "buffer",
    {},
    socket?.updateMediaMessage ? { logger, reuploadRequest: socket.updateMediaMessage.bind(socket) } : { logger },
  );
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

function sendUserMessage(pi: ExtensionAPI, content: WhatsAppInputContent): void {
  pi.sendUserMessage(content as any);
}

function learnAllowedLid(remoteJid: string | undefined, remoteJidAlt: string | undefined): void {
  const allowed = allowedJid();
  const pn = [remoteJid, remoteJidAlt].map(normalizePersonalJid).find(Boolean);
  const lid = [remoteJid, remoteJidAlt].map(normalizeLidJid).find(Boolean);
  if (!allowed || pn !== allowed || !lid || allowedLids.includes(lid)) return;
  allowedLids.push(lid);
  lastAccepted = `${new Date().toISOString()} learned whitelist LID from inbound alt JID: ${lid}`;
}

function filterInbound(message: any): { allowed: true; jid: string } | { allowed: false; reason: string } {
  const remoteJid = message?.key?.remoteJid;
  const remoteJidAlt = message?.key?.remoteJidAlt;
  learnAllowedLid(remoteJid, remoteJidAlt);

  const primary = filterIncomingMessage({ remoteJid, fromMe: message?.key?.fromMe, allowedJid: allowedJid(), allowedLids });
  if (primary.allowed) return primary;

  const alternate = filterIncomingMessage({ remoteJid: remoteJidAlt, fromMe: message?.key?.fromMe, allowedJid: allowedJid(), allowedLids });
  if (alternate.allowed) return alternate;

  return { allowed: false, reason: `${primary.reason}${remoteJidAlt ? `; alt=${remoteJidAlt} => ${alternate.reason}` : ""}` };
}

function maybeInjectNext(pi: ExtensionAPI, force = false): void {
  if (activeWhatsAppTurn || inboundQueue.length === 0) return;
  if (!force && ctxRef && !ctxRef.isIdle()) {
    lastInjection = `${new Date().toISOString()} waiting for active Pi turn to finish; queue=${inboundQueue.length}`;
    return;
  }

  const next = inboundQueue.shift();
  if (!next) return;
  activeWhatsAppTurn = { ...next, injectedAt: Date.now() };
  setRemoteTurnOrigin({ source: "whatsapp", id: next.id, jid: next.jid, kind: next.kind });
  lastInjection = `${new Date().toISOString()} injected ${next.id} kind=${next.kind} jid=${next.jid}; queue=${inboundQueue.length}`;
  sendUserMessage(pi, next.content);
}

function enqueueWhatsAppTurn(pi: ExtensionAPI, jid: string, kind: QueuedTurn["kind"], content: WhatsAppInputContent): void {
  if (inboundQueue.length >= MAX_INBOUND_QUEUE) {
    lastIgnored = `${new Date().toISOString()} queue full; jid=${jid} kind=${kind}; queue=${inboundQueue.length}`;
    void socket?.sendMessage(jid, { text: "Pi is still processing earlier WhatsApp messages. Please wait and try again." });
    return;
  }
  const turn: QueuedTurn = {
    id: `wa-${++turnSerial}`,
    jid,
    kind,
    content,
    receivedAt: Date.now(),
  };
  inboundQueue.push(turn);
  lastAccepted = `${new Date().toISOString()} queued ${turn.id} kind=${kind} jid=${jid}; queue=${inboundQueue.length}`;
  maybeInjectNext(pi);
}

async function markReadBestEffort(message: any): Promise<void> {
  try {
    if (message?.key) await socket?.readMessages?.([message.key]);
  } catch (error) {
    lastError = `read receipt failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function handleIncoming(pi: ExtensionAPI, baileys: BaileysRuntime, payload: any): Promise<void> {
  for (const message of payload?.messages ?? []) {
    const remoteJid = message?.key?.remoteJid;
    const messageSeconds = timestampSeconds(message?.messageTimestamp);
    lastInbound = `${new Date().toISOString()} type=${payload?.type ?? "unknown"} jid=${remoteJid ?? "missing"} fromMe=${String(message?.key?.fromMe)} hasMessage=${String(Boolean(message?.message))} ts=${messageSeconds || "unknown"}`;

    if (!message?.message) {
      lastIgnored = `${new Date().toISOString()} missing message content for jid=${remoteJid ?? "missing"}`;
      continue;
    }

    const filter = filterInbound(message);
    if (!filter.allowed) {
      lastIgnored = `${new Date().toISOString()} ${filter.reason}; jid=${remoteJid ?? "missing"} alt=${message.key?.remoteJidAlt ?? "none"}`;
      continue;
    }

    if (bridgeStartedAtSeconds > 0 && messageSeconds > 0 && messageSeconds < bridgeStartedAtSeconds - 5) {
      lastIgnored = `${new Date().toISOString()} old message ignored; jid=${remoteJid ?? "missing"} ts=${messageSeconds}`;
      continue;
    }

    const text = extractText(message.message);
    const imageMessage = getImageMessage(message.message);
    const audioMessage = getAudioMessage(message.message);
    lastAccepted = `${new Date().toISOString()} jid=${filter.jid} kind=${imageMessage ? "image" : audioMessage ? "audio" : text ? "text" : "unsupported"}`;

    try {
      if (imageMessage) {
        const image = await downloadMedia(baileys, message);
        if (image.length > MAX_IMAGE_BYTES) {
          await socket?.sendMessage(filter.jid, { text: `That image is too large for Pi to process (${Math.ceil(image.length / 1024 / 1024)} MiB).` });
          await markReadBestEffort(message);
          continue;
        }
        const rawMime = String(imageMessage.mimetype || "image/jpeg").toLowerCase().split(";")[0].trim();
        const mimeType = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
        enqueueWhatsAppTurn(pi, filter.jid, "image", [
          { type: "text", text: text || "Image from WhatsApp." },
          { type: "image", data: image.toString("base64"), mimeType },
        ]);
        await markReadBestEffort(message);
        continue;
      }

      if (audioMessage) {
        const audio = await downloadMedia(baileys, message);
        if (audio.length > MAX_AUDIO_BYTES) {
          await socket?.sendMessage(filter.jid, { text: `That audio message is too large for Pi to process (${Math.ceil(audio.length / 1024 / 1024)} MiB).` });
          await markReadBestEffort(message);
          continue;
        }
        const pcm = await convertAudioToPcm16(audio);
        if (pcm.length > MAX_PCM_BYTES) {
          await socket?.sendMessage(filter.jid, { text: "That audio message is too long for local transcription." });
          await markReadBestEffort(message);
          continue;
        }
        const transcript = (await transcribeSherpaPcm16(pcm)).trim();
        if (!transcript) {
          await socket?.sendMessage(filter.jid, { text: "I could not transcribe that audio message." });
          await markReadBestEffort(message);
          continue;
        }
        enqueueWhatsAppTurn(pi, filter.jid, "audio", transcript);
        await markReadBestEffort(message);
        continue;
      }

      if (text) {
        enqueueWhatsAppTurn(pi, filter.jid, "text", text);
        await markReadBestEffort(message);
      } else {
        lastIgnored = `${new Date().toISOString()} unsupported/empty whitelisted message; jid=${filter.jid}`;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      lastError = detail;
      await socket?.sendMessage(filter.jid, { text: `Pi could not process that WhatsApp message: ${detail}` });
    }
  }
}

async function resolveAllowedLids(): Promise<void> {
  allowedLids = [];
  const jid = allowedJid();
  if (!socket || !jid || typeof socket.onWhatsApp !== "function") return;
  try {
    const matches = await socket.onWhatsApp(jid);
    allowedLids = (matches ?? [])
      .map((match: any) => typeof match?.lid === "string" ? match.lid : undefined)
      .filter(Boolean);
    if (allowedLids.length > 0) {
      lastAccepted = `${new Date().toISOString()} resolved whitelist LID(s): ${allowedLids.join(",")}`;
    }
  } catch (error) {
    lastError = `Could not resolve WhatsApp LID for whitelist: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function qrCodeLines(qr: string): Promise<string[]> {
  try {
    const qrcodeModule = await import("qrcode-terminal");
    const qrcode = (qrcodeModule as any).default ?? qrcodeModule;
    return new Promise((resolve) => {
      qrcode.generate(qr, { small: true }, (output: string) => {
        resolve(output.split(/\r?\n/));
      });
    });
  } catch (error) {
    throw whatsappDependencyError(error);
  }
}

async function startWhatsApp(pi: ExtensionAPI, pairingPhone?: string): Promise<string> {
  await refreshConfig();
  if (!allowedJid()) return `Set the single whitelisted phone first: /whatsapp allowed +15551234567`;
  if (socket && status === "connected") return "WhatsApp is already connected.";
  if (socket && (status === "connecting" || status === "pairing" || status === "stopping")) {
    return `WhatsApp is already ${status}. Use /whatsapp stop before starting again.`;
  }
  if (socket) await stopWhatsApp();

  const lockError = await acquireMasterLock();
  if (lockError) {
    setStatus("locked", "master already running");
    return lockError;
  }

  try {
    intentionalStop = false;
    setStatus("connecting");
    lastError = "";
    bridgeStartedAtSeconds = Math.floor(Date.now() / 1000);

    const baileys = await loadBaileys();
    await mkdir(whatsappAuthDir(), { recursive: true, mode: 0o700 });
    const { state, saveCreds } = await baileys.useMultiFileAuthState(whatsappAuthDir());
    const version = baileys.fetchLatestBaileysVersion ? (await baileys.fetchLatestBaileysVersion()).version : undefined;

    socket = baileys.makeWASocket({
      auth: baileys.makeCacheableSignalKeyStore
        ? { creds: state.creds, keys: baileys.makeCacheableSignalKeyStore(state.keys, logger) }
        : state,
      version,
      logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    if (pairingPhone && !state.creds.registered && typeof socket.requestPairingCode === "function") {
      const digits = normalizePhoneDigits(pairingPhone);
      if (digits.length < 8) throw new Error("Pairing phone must include country code, e.g. /whatsapp pair +15551230000");
      setStatus("pairing", "pairing code");
      const code = await socket.requestPairingCode(digits);
      const text = `WhatsApp pairing code for ${maskPhone(digits)}: ${code}`;
      if (!hasInteractiveUi(ctxRef)) console.log(text);
      else {
        ctxRef?.ui.setWidget("whatsapp", [text, "On the Pi-only phone: WhatsApp → Linked devices → Link with phone number instead."]);
        ctxRef?.ui.notify("WhatsApp pairing code shown in widget", "info");
      }
    }

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async (update: any) => {
      try {
        const { connection, lastDisconnect, qr } = update;
      if (qr) {
        setStatus("pairing");
        try {
          const lines = await qrCodeLines(qr);
          lastQrLines = lines;
          lastQrShownAt = Date.now();
          console.log(lines.join("\n"));
          showQrOverlay(lines);
          if (hasInteractiveUi(ctxRef)) ctxRef?.ui.notify("WhatsApp QR ready. Scan it with the Pi phone.", "info");
          finishQrPairingWait("WhatsApp QR shown in a Pi popup and printed to the terminal. Scan it with the Pi phone.");
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          setStatus("error");
          failQrPairingWait(error);
          try {
            await stopWhatsApp();
          } catch (stopError) {
            lastError = `${lastError}; cleanup failed: ${stopError instanceof Error ? stopError.message : String(stopError)}`;
          }
          if (hasInteractiveUi(ctxRef)) ctxRef?.ui.notify(`WhatsApp QR failed: ${lastError}`, "error");
        }
      }

      if (connection === "open") {
        await resolveAllowedLids();
        closeQrOverlay();
        reconnectAttempts = 0;
        setStatus("connected", maskPhone(config.allowedPhone));
        finishQrPairingWait("WhatsApp connected. Existing linked-device auth was reused, so no QR was needed.");
        if (hasInteractiveUi(ctxRef)) ctxRef?.ui.notify("WhatsApp connected", "info");
        return;
      }

      if (connection === "close") {
        socket = undefined;
        if (intentionalStop) {
          setStatus("disconnected");
          return;
        }
        const code = lastDisconnect?.error?.output?.statusCode;
        lastError = lastDisconnect?.error?.message || String(lastDisconnect?.error ?? "connection closed");
        const loggedOut = code === baileys.DisconnectReason?.loggedOut;
        if (loggedOut) {
          closeQrOverlay();
          await deleteWhatsAppAuth();
          await releaseMasterLock();
          setStatus("disconnected", "logged out; auth reset");
          failQrPairingWait(new Error("WhatsApp logged out. Local auth was reset; run setup again to show a fresh QR."));
          if (hasInteractiveUi(ctxRef)) ctxRef?.ui.notify("WhatsApp logged out. Local auth was reset; run /whatsapp start to print a fresh QR.", "warning");
          return;
        }
        closeQrOverlay();
        const setupWaiterActive = Boolean(qrPairingWaiter);
        failQrPairingWait(new Error(`WhatsApp connection closed before QR/connection: ${lastError}`));
        if (setupWaiterActive) {
          await releaseMasterLock();
          setStatus("disconnected", "connection closed before QR");
          return;
        }
        reconnectAttempts += 1;
        if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
          await releaseMasterLock();
          setStatus("error", "reconnect limit reached");
          return;
        }
        const delayMs = Math.min(60_000, 5000 * reconnectAttempts);
        setStatus("connecting", `reconnecting in ${Math.round(delayMs / 1000)}s`);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => { void startWhatsApp(pi).catch((error) => { lastError = error.message; setStatus("error"); }); }, delayMs);
      }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        setStatus("error");
        failQrPairingWait(error);
      }
    });

    socket.ev.on("messages.upsert", (payload: any) => {
      void handleIncoming(pi, baileys, payload).catch((error) => {
        lastError = error instanceof Error ? error.message : String(error);
        setStatus("error");
      });
    });

    return "WhatsApp connection started. Scan the QR code if one appears.";
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    lastError = detail;
    socket = undefined;
    clearRemoteTurnOrigin(activeWhatsAppTurn?.id);
    activeWhatsAppTurn = undefined;
    inboundQueue = [];
    failQrPairingWait(error);
    await releaseMasterLock();
    setStatus("error");
    throw error;
  }
}

export async function startWhatsAppQrPairing(pi: ExtensionAPI, ctx: ExtensionContext): Promise<string> {
  ctxRef = ctx;
  const qrWait = waitForQrPairing();
  void qrWait.catch(() => undefined);
  try {
    const startText = await startWhatsApp(pi);
    if (!startText.startsWith("WhatsApp connection started")) {
      if (startText.includes("already connecting") || startText.includes("already pairing")) {
        if (reshowRecentQr(ctx)) {
          finishQrPairingWait("WhatsApp QR re-shown in a Pi popup.");
        }
        const pairingText = await qrWait;
        return `${startText}\n${pairingText}`;
      }
      finishQrPairingWait(startText);
      return startText;
    }
    const pairingText = await qrWait;
    return `${startText}\n${pairingText}`;
  } catch (error) {
    failQrPairingWait(error);
    try {
      await stopWhatsApp();
    } catch (stopError) {
      lastError = `${error instanceof Error ? error.message : String(error)}; cleanup failed: ${stopError instanceof Error ? stopError.message : String(stopError)}`;
    }
    throw error;
  }
}

async function stopWhatsApp(): Promise<string> {
  closeQrOverlay();
  intentionalStop = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  reconnectAttempts = 0;
  if (!socket) {
    clearRemoteTurnOrigin(activeWhatsAppTurn?.id);
    activeWhatsAppTurn = undefined;
    inboundQueue = [];
    await releaseMasterLock();
    setStatus("disconnected");
    return "WhatsApp is not connected.";
  }
  setStatus("stopping");
  try {
    socket.ev?.removeAllListeners?.("connection.update");
    socket.ev?.removeAllListeners?.("messages.upsert");
    socket.ev?.removeAllListeners?.("creds.update");
    socket.end?.(undefined);
  } catch {
    // Best effort shutdown.
  }
  socket = undefined;
  clearRemoteTurnOrigin(activeWhatsAppTurn?.id);
  activeWhatsAppTurn = undefined;
  inboundQueue = [];
  await releaseMasterLock();
  setStatus("disconnected");
  return "WhatsApp disconnected for this Pi process.";
}

async function refreshConfig(): Promise<void> {
  config = await loadWhatsAppConfig();
}

async function statusText(): Promise<string> {
  await refreshConfig();
  return [
    `Status: ${status}`,
    `Allowed phone: ${maskPhone(config.allowedPhone)}`,
    `Allowed JID configured: ${allowedJid() ? "yes" : "no"}`,
    `Allowed LID(s): ${allowedLids.length > 0 ? allowedLids.join(", ") : "none resolved yet"}`,
    `Autostart: ${config.autoStart === true ? "on" : "off"}`,
    `Master: ${await describeMasterLock()}`,
    `Master lock: ${whatsappMasterLockPath()}`,
    `Config path: ${whatsappConfigPath()}`,
    `Auth dir: ${whatsappAuthDir()}`,
    `Active WhatsApp turn: ${activeWhatsAppTurn ? `${activeWhatsAppTurn.id} ${activeWhatsAppTurn.kind} ${activeWhatsAppTurn.jid}` : "none"}`,
    `Queued WhatsApp turns: ${inboundQueue.length}`,
    `Last inbound: ${lastInbound}`, 
    `Last injection: ${lastInjection}`,
    `Last reply match: ${lastReplyMatch}`,
    `Last skipped reply: ${lastSkippedReply}`,
    `Last accepted: ${lastAccepted}`,
    `Last ignored: ${lastIgnored}`,
    `Last outbound: ${lastOutbound}`,
    lastError ? `Last error: ${lastError}` : undefined,
  ].filter(Boolean).join("\n");
}

export function registerWhatsAppUse(pi: ExtensionAPI) {
  pi.registerFlag("whatsapp-online", {
    description: "Connect the minimal personal WhatsApp bridge on Pi startup when configured",
    type: "boolean",
    default: false,
  });

  pi.on("session_start", async (_event, ctx) => {
    ctxRef = ctx;
    await refreshConfig();
    setStatus(status, allowedJid() ? maskPhone(config.allowedPhone) : undefined);
    if ((pi.getFlag("whatsapp-online") === true || config.autoStart === true) && ctx.hasUI !== false) {
      void startWhatsApp(pi).catch((error) => {
        lastError = error instanceof Error ? error.message : String(error);
        setStatus("error");
        if (hasInteractiveUi(ctx)) ctx.ui.notify(`WhatsApp failed to start: ${lastError}`, "error");
      });
    }
  });

  pi.on("agent_end", async (event: any) => {
    const messages = Array.isArray(event?.messages) ? event.messages : [];

    if (!activeWhatsAppTurn) {
      clearRemoteTurnOrigin();
      lastSkippedReply = `${new Date().toISOString()} agent_end without active WhatsApp turn; messages=${messages.length}`;
      maybeInjectNext(pi, true);
      return;
    }

    const target = activeWhatsAppTurn;
    const reply = messages.slice().reverse().map(assistantText).find(Boolean) || "";
    lastReplyMatch = `${new Date().toISOString()} agent_end matched ${target.id}; messages=${messages.length}; replyChars=${reply.length}`;
    activeWhatsAppTurn = undefined;
    clearRemoteTurnOrigin(target.id);

    if (!reply) {
      lastSkippedReply = `${new Date().toISOString()} no assistant text for ${target.id}`;
      maybeInjectNext(pi, true);
      return;
    }

    try {
      if (!socket) throw new Error("WhatsApp socket is not connected");
      await socket.sendMessage(target.jid, { text: reply });
      lastOutbound = `${new Date().toISOString()} sent assistant reply for ${target.id} to ${target.jid}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      setStatus("error");
    } finally {
      maybeInjectNext(pi, true);
    }
  });

  pi.on("session_shutdown", async () => {
    await stopWhatsApp();
  });

  pi.registerCommand("whatsapp", {
    description: "Personal 1:1 WhatsApp bridge: help|status|allowed|start|stop|logout",
    handler: async (args, ctx) => {
      ctxRef = ctx;
      const [commandRaw, ...rest] = args.trim().split(/\s+/).filter(Boolean);
      const command = (commandRaw || "help").toLowerCase();
      const value = rest.join(" ").trim();

      if (command === "help") {
        if (!hasInteractiveUi(ctx)) console.log(HELP_TEXT);
        else {
          ctx.ui.setWidget("whatsapp", HELP_TEXT.split("\n"));
          ctx.ui.notify("WhatsApp help updated", "info");
        }
        return;
      }

      if (command === "status") {
        const text = await statusText();
        if (!hasInteractiveUi(ctx)) console.log(text);
        else {
          ctx.ui.setWidget("whatsapp", text.split("\n"));
          ctx.ui.notify("WhatsApp status updated", "info");
        }
        return;
      }

      if (command === "allowed" || command === "allow") {
        const jid = phoneToPersonalJid(value);
        if (!jid) {
          const text = "Usage: /whatsapp allowed +15551234567";
          if (!hasInteractiveUi(ctx)) console.log(text);
          else ctx.ui.notify(text, "error");
          return;
        }
        config = { ...config, allowedPhone: value };
        allowedLids = [];
        await saveWhatsAppConfig(config);
        if (socket && status === "connected") await resolveAllowedLids();
        setStatus(status, maskPhone(value));
        const text = `Allowed WhatsApp contact set to ${maskPhone(value)}.`;
        if (!hasInteractiveUi(ctx)) console.log(text);
        else ctx.ui.notify(text, "info");
        return;
      }

      if (command === "autostart" || command === "auto-start") {
        const normalized = value.toLowerCase();
        if (!["on", "off", "true", "false", "1", "0", "status", ""].includes(normalized)) {
          const text = "Usage: /whatsapp autostart on|off|status";
          if (!hasInteractiveUi(ctx)) console.log(text);
          else ctx.ui.notify(text, "error");
          return;
        }
        if (normalized && normalized !== "status") {
          config = { ...config, autoStart: ["on", "true", "1"].includes(normalized) };
          await saveWhatsAppConfig(config);
        }
        const text = `WhatsApp autostart is ${config.autoStart === true ? "on" : "off"}.`;
        if (!hasInteractiveUi(ctx)) console.log(text);
        else ctx.ui.notify(text, "info");
        return;
      }

      if (command === "start" || command === "connect") {
        const text = await startWhatsApp(pi);
        if (!hasInteractiveUi(ctx)) console.log(text);
        else ctx.ui.notify(text, "info");
        return;
      }

      if (command === "pair" || command === "pair-code") {
        if (!value) {
          const text = "Usage: /whatsapp pair +15551230000  (the Pi-only WhatsApp account phone number)";
          if (!hasInteractiveUi(ctx)) console.log(text);
          else ctx.ui.notify(text, "error");
          return;
        }
        const text = await startWhatsApp(pi, value);
        if (!hasInteractiveUi(ctx)) console.log(text);
        else ctx.ui.notify(text, "info");
        return;
      }

      if (command === "stop" || command === "disconnect") {
        const text = await stopWhatsApp();
        if (!hasInteractiveUi(ctx)) console.log(text);
        else ctx.ui.notify(text, "info");
        return;
      }

      if (command === "ping" || command === "send-test") {
        if (!socket || status !== "connected") {
          const text = "WhatsApp is not connected.";
          if (!hasInteractiveUi(ctx)) console.log(text);
          else ctx.ui.notify(text, "error");
          return;
        }
        const jid = allowedJid();
        if (!jid) {
          const text = "Allowed phone is not configured.";
          if (!hasInteractiveUi(ctx)) console.log(text);
          else ctx.ui.notify(text, "error");
          return;
        }
        const body = value || "Pi WhatsApp test message.";
        await socket.sendMessage(jid, { text: body });
        lastOutbound = `${new Date().toISOString()} sent manual test to ${jid}`;
        const text = `Sent WhatsApp test message to ${maskPhone(config.allowedPhone)}.`;
        if (!hasInteractiveUi(ctx)) console.log(text);
        else ctx.ui.notify(text, "info");
        return;
      }

      if (command === "logout" || command === "reset") {
        const ok = !hasInteractiveUi(ctx) || await ctx.ui.confirm("Delete WhatsApp auth?", "This removes the local linked-device credentials. You will need to scan QR again.");
        if (!ok) return;
        const resetError = await assertCanResetAuth();
        if (resetError) {
          if (!hasInteractiveUi(ctx)) console.log(resetError);
          else ctx.ui.notify(resetError, "error");
          return;
        }
        await stopWhatsApp();
        await deleteWhatsAppAuth();
        const text = "WhatsApp auth state deleted.";
        if (!hasInteractiveUi(ctx)) console.log(text);
        else ctx.ui.notify(text, "warning");
        return;
      }

      const text = `Unknown /whatsapp command: ${command}. Try /whatsapp help.`;
      if (!hasInteractiveUi(ctx)) console.log(text);
      else ctx.ui.notify(text, "error");
    },
  });
}
