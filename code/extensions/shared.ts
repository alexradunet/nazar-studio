import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

export type NotifyLevel = "info" | "warning" | "error";

export function trim(value: string | undefined | null): string {
  return (value ?? "").trim();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toolError(toolName: string, error: unknown): Error {
  return new Error(`${toolName}: ${errorMessage(error)}`);
}

export function truncateUtf8(text: string, maxBytes: number, suffix = "\n\n[Output truncated]"): string {
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

export function hasInteractiveUi(ctx: { hasUI?: boolean } | undefined): boolean {
  return ctx?.hasUI !== false;
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
