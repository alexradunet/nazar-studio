import { dirname, join } from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { xdgConfigHome, xdgStateHome } from "../shared.ts";

export type WhatsAppConfig = {
  allowedPhone?: string;
  autoStart?: boolean;
};

export type FilterInput = {
  remoteJid?: string | null;
  fromMe?: boolean | null;
  allowedJid?: string | null;
  allowedLids?: string[];
};

export type FilterResult =
  | { allowed: true; jid: string }
  | { allowed: false; reason: string };

export function whatsappConfigPath(): string {
  return process.env.PI_WHATSAPP_CONFIG || join(xdgConfigHome(), "pi", "whatsapp.json");
}

export function whatsappAuthDir(): string {
  return process.env.PI_WHATSAPP_AUTH_DIR || join(xdgStateHome(), "pi", "whatsapp", "auth");
}

export function whatsappMasterLockPath(): string {
  return process.env.PI_WHATSAPP_MASTER_LOCK || join(xdgStateHome(), "pi", "whatsapp", "master.lock");
}

export function normalizePhoneDigits(input: string | undefined | null): string {
  return String(input ?? "").replace(/\D/g, "");
}

export function phoneToPersonalJid(input: string | undefined | null): string | undefined {
  const digits = normalizePhoneDigits(input);
  if (digits.length < 8) return undefined;
  return `${digits}@s.whatsapp.net`;
}

export function normalizePersonalJid(input: string | undefined | null): string | undefined {
  const value = String(input ?? "").trim();
  if (!value) return undefined;
  if (value.endsWith("@s.whatsapp.net")) {
    const local = value.split("@")[0]?.split(":")[0] ?? "";
    return phoneToPersonalJid(local);
  }
  return phoneToPersonalJid(value);
}

export function normalizeLidJid(input: string | undefined | null): string | undefined {
  const value = String(input ?? "").trim();
  if (!value.endsWith("@lid")) return undefined;
  const local = value.split("@")[0]?.split(":")[0] ?? "";
  return local ? `${local}@lid` : undefined;
}

export function maskPhone(input: string | undefined | null): string {
  const digits = normalizePhoneDigits(input);
  if (!digits) return "not configured";
  if (digits.length <= 4) return `***${digits}`;
  return `+${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function isNonPersonalJid(jid: string): boolean {
  return jid.endsWith("@g.us")
    || jid.endsWith("@broadcast")
    || jid === "status@broadcast"
    || jid.endsWith("@newsletter")
    || !(jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"));
}

export function filterIncomingMessage(input: FilterInput): FilterResult {
  const remoteJid = input.remoteJid?.trim();
  const allowedJid = input.allowedJid?.trim();

  if (input.fromMe) return { allowed: false, reason: "from self" };
  if (!remoteJid) return { allowed: false, reason: "missing remote JID" };
  if (isNonPersonalJid(remoteJid)) return { allowed: false, reason: "not a 1:1 personal chat" };
  if (!allowedJid) return { allowed: false, reason: "whitelist not configured" };

  const normalizedRemote = normalizePersonalJid(remoteJid);
  const normalizedAllowed = normalizePersonalJid(allowedJid);
  if (normalizedRemote && normalizedRemote === normalizedAllowed) {
    return { allowed: true, jid: normalizedRemote };
  }

  const normalizedLid = normalizeLidJid(remoteJid);
  if (normalizedLid && input.allowedLids?.includes(normalizedLid)) {
    return { allowed: true, jid: normalizedLid };
  }

  return { allowed: false, reason: "sender is not whitelisted" };
}

export function unwrapMessageContent(content: any): any {
  let current = content;
  for (let i = 0; i < 5; i += 1) {
    const next = current?.ephemeralMessage?.message
      ?? current?.viewOnceMessage?.message
      ?? current?.viewOnceMessageV2?.message
      ?? current?.documentWithCaptionMessage?.message;
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

export function extractText(content: any): string {
  const message = unwrapMessageContent(content);
  return String(
    message?.conversation
      ?? message?.extendedTextMessage?.text
      ?? message?.imageMessage?.caption
      ?? message?.videoMessage?.caption
      ?? message?.documentMessage?.caption
      ?? "",
  ).trim();
}

export function getImageMessage(content: any): any | undefined {
  return unwrapMessageContent(content)?.imageMessage;
}

export function getAudioMessage(content: any): any | undefined {
  return unwrapMessageContent(content)?.audioMessage;
}

export function assistantText(message: any): string {
  if (!message || message.role !== "assistant") return "";
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function loadWhatsAppConfig(): Promise<WhatsAppConfig> {
  let fileConfig: WhatsAppConfig = {};
  const path = whatsappConfigPath();
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as WhatsAppConfig;
    fileConfig = {
      allowedPhone: typeof parsed.allowedPhone === "string" ? parsed.allowedPhone : undefined,
      autoStart: parsed.autoStart === true,
    };
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw new Error(`WhatsApp config is unreadable or malformed at ${path}: ${error instanceof Error ? error.message : String(error)}`);
    fileConfig = {};
  }

  const envAllowed = process.env.PI_WHATSAPP_ALLOWED_PHONE?.trim();
  if (envAllowed) return { ...fileConfig, allowedPhone: envAllowed };
  return fileConfig;
}

export async function saveWhatsAppConfig(config: WhatsAppConfig): Promise<void> {
  const path = whatsappConfigPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export async function deleteWhatsAppAuth(): Promise<void> {
  await rm(whatsappAuthDir(), { recursive: true, force: true });
}
