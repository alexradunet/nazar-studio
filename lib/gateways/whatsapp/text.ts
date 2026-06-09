// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/whatsapp/text.ts — pull a plain-text body and a millisecond
 * timestamp out of Baileys message shapes. Pure + unit-tested.
 */

/** Extract a plain-text body from a Baileys message content object. */
export function extractText(message: any): string {
  if (!message || typeof message !== "object") return "";
  const direct =
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.title;
  if (typeof direct === "string") return direct.trim();
  // ephemeral / view-once wrappers nest the real content.
  const nested =
    message.ephemeralMessage?.message ??
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message;
  if (nested) return extractText(nested);
  return "";
}

/** Baileys timestamps are seconds (number or Long-like) → milliseconds. */
export function toMillis(ts: unknown): number {
  if (typeof ts === "number") return ts > 1e12 ? ts : Math.round(ts * 1000);
  if (ts && typeof (ts as { toNumber?: () => number }).toNumber === "function") {
    return Math.round((ts as { toNumber: () => number }).toNumber() * 1000);
  }
  if (ts && typeof (ts as { low?: number }).low === "number") {
    return (ts as { low: number }).low * 1000;
  }
  return Date.now();
}
