export type RemoteTurnOrigin = {
  source: "whatsapp";
  id: string;
  jid: string;
  kind: string;
};

type RemoteOriginState = {
  active?: RemoteTurnOrigin;
};

const STATE_KEY = Symbol.for("nazar.remote-origin");

function state(): RemoteOriginState {
  const root = globalThis as typeof globalThis & { [STATE_KEY]?: RemoteOriginState };
  root[STATE_KEY] ??= {};
  return root[STATE_KEY];
}

export function setRemoteTurnOrigin(origin: RemoteTurnOrigin): void {
  state().active = origin;
}

export function clearRemoteTurnOrigin(id?: string): void {
  const current = state().active;
  if (!id || current?.id === id) state().active = undefined;
}

export function getRemoteTurnOrigin(): RemoteTurnOrigin | undefined {
  return state().active;
}
