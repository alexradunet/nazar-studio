import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

export type NotifyLevel = "info" | "warning" | "error";

type NativeTruncationApi = {
  DEFAULT_MAX_BYTES?: number;
  DEFAULT_MAX_LINES?: number;
  truncateHead?: (content: string, options?: { maxBytes?: number; maxLines?: number }) => {
    content: string;
    truncated: boolean;
    truncatedBy: "lines" | "bytes" | null;
    totalLines: number;
    totalBytes: number;
    outputLines: number;
    outputBytes: number;
    maxLines: number;
    maxBytes: number;
  };
};

const FALLBACK_MAX_BYTES = 50 * 1024;
const FALLBACK_MAX_LINES = 2000;
const DEFAULT_TRUNCATION_SUFFIX = "\n\n[Output truncated]";
let nativeTruncationPromise: Promise<NativeTruncationApi | undefined> | undefined;

export function trim(value: string | undefined | null): string {
  return (value ?? "").trim();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toolError(toolName: string, error: unknown): Error {
  return new Error(`${toolName}: ${errorMessage(error)}`);
}

export function truncateUtf8(text: string, maxBytes: number, suffix = DEFAULT_TRUNCATION_SUFFIX): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;

  const budget = Math.max(0, maxBytes - Buffer.byteLength(suffix, "utf8"));
  let output = "";
  let bytes = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > budget) break;
    output += char;
    bytes += size;
  }
  return `${output}${suffix}`;
}

async function loadNativeTruncation(): Promise<NativeTruncationApi | undefined> {
  nativeTruncationPromise ??= import("@earendil-works/pi-coding-agent")
    .then((module) => module as NativeTruncationApi)
    .catch(() => undefined);
  return nativeTruncationPromise;
}

function lineCount(text: string): number {
  if (!text) return 0;
  return text.endsWith("\n") ? text.slice(0, -1).split("\n").length : text.split("\n").length;
}

function truncateToolOutputFallback(text: string, maxBytes: number, maxLines: number, suffix: string): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes && lineCount(text) <= maxLines) return text;

  const budget = Math.max(0, maxBytes - Buffer.byteLength(suffix, "utf8"));
  const lines = text.split("\n");
  const output: string[] = [];
  let bytes = 0;
  for (let i = 0; i < lines.length && output.length < maxLines; i += 1) {
    const line = lines[i];
    const lineBytes = Buffer.byteLength(line, "utf8") + (output.length > 0 ? 1 : 0);
    if (bytes + lineBytes > budget) break;
    output.push(line);
    bytes += lineBytes;
  }

  if (output.length === 0) return truncateUtf8(text, maxBytes, suffix);
  return `${output.join("\n")}${suffix}`;
}

export async function truncateToolOutput(text: string, options: { maxBytes?: number; maxLines?: number; suffix?: string } = {}): Promise<string> {
  const native = await loadNativeTruncation();
  const maxBytes = options.maxBytes ?? native?.DEFAULT_MAX_BYTES ?? FALLBACK_MAX_BYTES;
  const maxLines = options.maxLines ?? native?.DEFAULT_MAX_LINES ?? FALLBACK_MAX_LINES;
  const suffix = options.suffix ?? DEFAULT_TRUNCATION_SUFFIX;
  if (Buffer.byteLength(text, "utf8") <= maxBytes && lineCount(text) <= maxLines) return text;

  const suffixBytes = Buffer.byteLength(suffix, "utf8");

  if (native?.truncateHead) {
    const result = native.truncateHead(text, { maxBytes: Math.max(0, maxBytes - suffixBytes), maxLines });
    return result.truncated ? `${result.content}${suffix}` : result.content;
  }

  return truncateToolOutputFallback(text, maxBytes, maxLines, suffix);
}

export function hasInteractiveUi(ctx: { hasUI?: boolean } | undefined): boolean {
  return ctx?.hasUI !== false;
}

export function notify(ctx: ExtensionContext, text: string, level: NotifyLevel = "info"): void {
  if (!hasInteractiveUi(ctx)) {
    console.log(text);
    return;
  }
  ctx.ui.notify(text, level);
}

export async function showText(ctx: ExtensionContext, widget: string, text: string, title: string, level: NotifyLevel = "info"): Promise<void> {
  if (!hasInteractiveUi(ctx)) {
    console.log(text);
    return;
  }
  ctx.ui.setWidget(widget, text.split("\n"));
  ctx.ui.notify(title, level);
}

function windowsAppData(): string {
  return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
}

function windowsLocalAppData(): string {
  return process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
}

export function xdgConfigHome(): string {
  if (platform() === "win32") return windowsAppData();
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export function xdgStateHome(): string {
  if (platform() === "win32") return windowsLocalAppData();
  return process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
}

export function xdgDataHome(): string {
  if (platform() === "win32") return windowsLocalAppData();
  return process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
}

export function chmodBestEffort(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch {
    // Best effort on platforms/filesystems that do not support POSIX modes.
  }
}

export function writePrivateFileSync(path: string, data: string, mode = 0o600): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodBestEffort(dir, 0o700);
  writeFileSync(path, data, { encoding: "utf8", mode });
  chmodBestEffort(path, mode);
}

export function writePrivateJsonSync(path: string, value: unknown, mode = 0o600): void {
  writePrivateFileSync(path, `${JSON.stringify(value, null, 2)}\n`, mode);
}
