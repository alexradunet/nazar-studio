import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type SetupProvider = {
  id: string;
  label: string;
  order?: number;
  configure?: (pi: ExtensionAPI, ctx: ExtensionContext) => Promise<void>;
  statusText?: () => string | Promise<string>;
};

type SetupRegistryState = {
  providers: Map<string, SetupProvider>;
};

const STATE_KEY = Symbol.for("nazar.setup-registry");

function state(): SetupRegistryState {
  const root = globalThis as typeof globalThis & { [STATE_KEY]?: SetupRegistryState };
  root[STATE_KEY] ??= { providers: new Map() };
  return root[STATE_KEY];
}

export function registerSetupProvider(provider: SetupProvider): void {
  state().providers.set(provider.id, provider);
}

export function unregisterSetupProvider(id: string): void {
  state().providers.delete(id);
}

export function setupProviders(): SetupProvider[] {
  return [...state().providers.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.label.localeCompare(b.label));
}
