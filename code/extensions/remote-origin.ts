export type RemoteTurnOrigin = {
  source: "whatsapp";
  id: string;
  jid: string;
  kind: string;
};

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
