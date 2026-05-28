export type RemoteTurnOrigin = {
  source: "whatsapp";
  id: string;
  jid: string;
  kind: string;
};

// Tiny process-local coupling channel: WhatsApp marks the active remote-originated
// Pi turn here so other extensions (currently Spotify playback replies) can decide
// whether a side effect should be attributed back to the WhatsApp bridge.
let activeRemoteTurnOrigin: RemoteTurnOrigin | undefined;

export function setRemoteTurnOrigin(origin: RemoteTurnOrigin): void {
  activeRemoteTurnOrigin = origin;
}

export function clearRemoteTurnOrigin(id?: string): void {
  if (!id || activeRemoteTurnOrigin?.id === id) activeRemoteTurnOrigin = undefined;
}

export function getRemoteTurnOrigin(): RemoteTurnOrigin | undefined {
  return activeRemoteTurnOrigin;
}
