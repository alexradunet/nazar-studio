// SPDX-License-Identifier: AGPL-3.0-or-later
// Nazar's current contextual mood. Set by lifecycle/tool events (extensions/brand.ts)
// and read by the avatar + thinking-panel renderers to pick an expression frame —
// so Nazar's face reflects what he's doing: focused while working, pleased on
// success, concerned on error, calm at rest.

export type NazarMood = "neutral" | "thinking" | "focused" | "pleased" | "concerned";

// Mood -> nazar-expr frame index. Canonical expression order:
// 0 neutral, 1 smile, 2 thinking, 3 surprised, 4 concerned, 5 pleased, 6 focused,
// 7 laughing, 8 resting.
export const NAZAR_MOOD_FRAME: Record<NazarMood, number> = {
  neutral: 0,
  thinking: 2,
  focused: 6,
  pleased: 5,
  concerned: 4,
};

let current: NazarMood = "neutral";
let activeTool: string | null = null;

export function getNazarMood(): NazarMood {
  return current;
}

export function setNazarMood(mood: NazarMood): void {
  current = mood;
}

/** The nazar-expr frame index for the current mood. */
export function nazarMoodFrame(): number {
  return NAZAR_MOOD_FRAME[current];
}

/** The tool Nazar is currently running, if any (for the live status bar). */
export function getActiveTool(): string | null {
  return activeTool;
}

export function setActiveTool(name: string | null): void {
  activeTool = name && name.trim() ? name.trim() : null;
}

/** Whether Nazar is actively working (non-resting mood). */
export function isNazarWorking(): boolean {
  return current === "thinking" || current === "focused";
}
