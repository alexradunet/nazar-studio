// SPDX-License-Identifier: AGPL-3.0-or-later
import { COLOR } from "../design/tokens.ts";

export const TUI_THEME = {
  spacing: {
    screenPaddingX: 1,
    messageGap: 1,
    avatarGap: 2,
  },
  avatar: {
    mode: "sextant" as const,
    identityRows: 5,
    assistantRows: 3,
    userRows: 3,
  },
  color: {
    title: COLOR.gold,
    prompt: COLOR.teal,
    user: COLOR.teal,
    userLabel: COLOR.indigo,
    assistant: COLOR.onSurface,
    assistantLabel: COLOR.gold,
    tool: COLOR.gold,
    status: COLOR.steel,
    muted: COLOR.muted,
    steel: COLOR.steel,
  },
  label: {
    assistant: "Balaur",
    user: "You",
    tool: "Tool",
    status: "Status",
  },
} as const;
