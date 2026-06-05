// SPDX-License-Identifier: AGPL-3.0-or-later
// Terminal avatar helpers for Nazar's ANSI-only UI.
// Canonical per-avatar 3×3, 9-frame PNG sprite sheets render as generated ANSI pixels.

export type SpriteRole = "user" | "nazar";
export type NazarActivity = "idle" | "thinking" | "tool" | "memory" | "doctor" | "evolving";
export type AvatarMode = "avatar";

const NAZAR_SPRITES: Record<NazarActivity, string> = {
  idle: "B",
  thinking: "?",
  tool: "T",
  memory: "M",
  doctor: "+",
  evolving: "*",
};

export function userDisplayName(): string {
  return (process.env.NAZAR_USER_NAME || process.env.USER || "You").trim() || "You";
}

export function avatarMode(): AvatarMode {
  return "avatar";
}

export function spriteFor(role: SpriteRole, activity: NazarActivity = "idle"): string {
  if (role === "user") return "@";
  return NAZAR_SPRITES[activity] ?? NAZAR_SPRITES.idle;
}

export function roleNameplate(role: SpriteRole, _activity: NazarActivity = "idle"): string {
  if (role === "user") return userDisplayName();
  return "Nazar";
}
