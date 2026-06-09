// SPDX-License-Identifier: AGPL-3.0-or-later
// Per-component render cache for Nazar's turn panels. Pi re-renders components
// frequently; we memoise the composed lines on the component instance behind a
// Symbol key and recompute only when the caller's key changes. The key depends
// on avatars.ts module state (the panel sequence counter), so the caller passes
// a key function — this module stays a generic, state-free get/set.
import type { SymbolBag } from "./pi-surface.ts";

const PANEL_RENDER_CACHE = Symbol.for("nazar.panelRenderCache");

type PanelRenderCache = { key: string; lines: string[] };

export function clearPanelRenderCache(owner: unknown): void {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return;
  delete (owner as SymbolBag)[PANEL_RENDER_CACHE];
}

export function cachedPanelRender(owner: unknown, keyFor: () => string, render: () => string[]): string[] {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return render();
  const beforeKey = keyFor();
  const cache = (owner as SymbolBag)[PANEL_RENDER_CACHE] as PanelRenderCache | undefined;
  if (cache?.key === beforeKey) return cache.lines;

  const lines = render();
  // Recompute the key after render: render() may bump the panel sequence.
  (owner as SymbolBag)[PANEL_RENDER_CACHE] = { key: keyFor(), lines };
  return lines;
}
