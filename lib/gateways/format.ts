// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * gateways/format.ts — transport-agnostic outbound text helpers.
 *
 * Terminal output is ANSI-coloured and can be long; chat apps want clean text
 * in bounded messages. stripAnsi() removes escape sequences; chunkText() splits
 * on natural boundaries so long answers arrive as a few readable messages
 * instead of one truncated wall. Transport-specific markup lives in each
 * transport's own format module.
 *
 * Patterns are built from char codes (ESC=27, BEL=7) so the source stays plain
 * ASCII — no literal control characters in the file.
 */

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
// CSI: ESC [ ... final-byte (colours, cursor moves).
const CSI_PATTERN = new RegExp(ESC + "\\[[0-9;?]*[ -/]*[@-~]", "g");
// OSC: ESC ] ... BEL (window titles, hyperlinks).
const OSC_PATTERN = new RegExp(ESC + "\\][^" + BEL + "]*" + BEL, "g");

/** Remove ANSI/VT escape sequences (colours, cursor moves, OSC titles/links). */
export function stripAnsi(input: string): string {
  return input.replace(CSI_PATTERN, "").replace(OSC_PATTERN, "");
}

/**
 * Split text into chunks no longer than `max`, preferring paragraph, then
 * newline, then word boundaries near the limit so we don't cut mid-word. Never
 * returns empty chunks; returns [text] when it already fits.
 */
export function chunkText(text: string, max = 3500): string[] {
  if (max <= 0 || text.length <= max) return text ? [text] : [];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = window.lastIndexOf("\n\n");
    if (cut < max * 0.5) cut = window.lastIndexOf("\n");
    if (cut < max * 0.5) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = max;
    const piece = rest.slice(0, cut).replace(/\s+$/, "");
    if (piece) chunks.push(piece);
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest) chunks.push(rest);
  return chunks;
}
