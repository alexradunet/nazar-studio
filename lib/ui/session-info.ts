// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tiny module-level store for the current session's metadata, so the
// header can render a "session opened · HH:MM" chapter divider without
// every render call having to re-derive the session start time.
//
// The Pi extension entry (extensions/brand.ts) calls `recordSessionStart`
// on the `session_start` event; the header reads `currentSessionInfo`
// each render. On /reload, recordSessionStart fires again and overwrites.

export type SessionStatus = "opened" | "resumed";

export interface SessionInfo {
  startedAt: number; // ms epoch
  status: SessionStatus;
}

let info: SessionInfo | undefined;

export function recordSessionStart(status: SessionStatus = "opened"): void {
  info = { startedAt: Date.now(), status };
}

export function currentSessionInfo(): SessionInfo | undefined {
  return info;
}

/** Reset for tests. */
export function clearSessionInfo(): void {
  info = undefined;
}

/**
 * Format the session-start timestamp as HH:MM (local time).
 * Returns an empty string if no session has been recorded yet.
 */
export function formatSessionTime(): string {
  if (!info) return "";
  const d = new Date(info.startedAt);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
