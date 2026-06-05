// SPDX-License-Identifier: AGPL-3.0-or-later
// Tiny terminal helpers shared by Nazar's Pi UI layer.
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function rgb(r: number, g: number, b: number, text: string): string {
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

export function compact(text: string, width: number): string {
  return truncateToWidth(text, Math.max(1, width));
}

export function padVisible(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

export { visibleWidth };
