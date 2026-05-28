import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { writeNazarSetupConfig } from "@nazar/core/setup";
import { registerSetupProvider } from "@nazar/core/setup-registry";
import { showText } from "@nazar/core/shared";

import { startWhatsAppQrPairing } from "./whatsapp-use.ts";
import { loadWhatsAppConfig, maskPhone, phoneToPersonalJid, saveWhatsAppConfig, whatsappAuthDir, whatsappConfigPath } from "./whatsapp-utils.ts";

async function show(ctx: ExtensionContext, title: string, text: string, level: "info" | "warning" | "error" = "info"): Promise<void> {
  await showText(ctx, "nazar-setup", text, title, level);
}

async function input(ctx: ExtensionContext, title: string, placeholder = ""): Promise<string | undefined> {
  if (ctx.hasUI === false) return undefined;
  return ctx.ui.input(title, placeholder);
}

async function confirm(ctx: ExtensionContext, title: string, message: string): Promise<boolean> {
  if (ctx.hasUI === false) return false;
  return ctx.ui.confirm(title, message);
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

async function whatsappSetupStatusText(): Promise<string> {
  const configPath = whatsappConfigPath();
  const authDir = whatsappAuthDir();
  try {
    const config = await loadWhatsAppConfig();
    return [
      `Allowed phone: ${maskPhone(config.allowedPhone)}`,
      `Config path: ${configPath}`,
      `Auth dir: ${authDir}`,
    ].join("\n");
  } catch (error) {
    return [
      `Config error: ${error instanceof Error ? error.message : String(error)}`,
      `Config path: ${configPath}`,
      `Auth dir: ${authDir}`,
    ].join("\n");
  }
}

export function registerWhatsAppSetupProvider(): void {
  registerSetupProvider({
    id: "whatsapp",
    label: "WhatsApp",
    order: 30,
    configure: configureWhatsApp,
    statusText: whatsappSetupStatusText,
  });
}
