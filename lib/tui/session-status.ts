// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RuntimeSessionState } from "../runtime/events.ts";

export function formatRuntimeSessionState(state: RuntimeSessionState): string {
  const scope = state.conversation === "branch" ? `branch: ${state.branchTitle || "untitled"}` : "master";
  return `${scope} · ${state.streaming ? "streaming…" : "ready"}`;
}
