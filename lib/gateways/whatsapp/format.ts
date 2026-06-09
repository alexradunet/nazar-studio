// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/whatsapp/format.ts — lightweight Markdown → WhatsApp text.
 *
 * WhatsApp supports *bold*, _italic_, ~strike~ and ```mono``` but not real
 * Markdown. This is a pragmatic, conservative converter (not a parser): strip
 * ANSI, turn headings and **bold** into WhatsApp *bold*, and flatten links.
 * It intentionally leaves single-asterisk emphasis and code fences alone to
 * avoid mangling content, then chunks the result for delivery.
 */
import { chunkText, stripAnsi } from "../format.ts";

const WHATSAPP_MAX = 3500;

export function markdownToWhatsApp(input: string): string {
  let out = stripAnsi(input);
  // Headings "## Title" → "*Title*"
  out = out.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*$/gm, (_m, title: string) => `*${title.trim()}*`);
  // **bold** / __bold__ → *bold*
  out = out.replace(/\*\*(.+?)\*\*/g, "*$1*");
  out = out.replace(/__(.+?)__/g, "*$1*");
  // [text](url) → text (url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)");
  return out;
}

/** Convert + chunk an assistant answer for delivery as WhatsApp messages. */
export function toWhatsAppChunks(input: string, max = WHATSAPP_MAX): string[] {
  return chunkText(markdownToWhatsApp(input).trim(), max);
}
