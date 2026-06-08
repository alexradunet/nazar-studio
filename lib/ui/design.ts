// SPDX-License-Identifier: AGPL-3.0-or-later
// Visual design primitives for Nazar's Pi terminal UI.
// ANSI is the compatibility layer; panels and avatars stay truecolor SGR.
import { graphicsCapabilitySummary } from "./graphics-protocol.ts";

export function uiCapabilitySummary(): string {
  return `${graphicsCapabilitySummary()} notes=ANSI truecolor panels and avatars`;
}
