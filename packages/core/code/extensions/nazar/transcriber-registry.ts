export type Pcm16Transcriber = (pcm: Buffer) => Promise<string>;

type TranscriberState = {
  transcriber?: Pcm16Transcriber;
};

const STATE_KEY = Symbol.for("nazar.transcriber-registry");

function state(): TranscriberState {
  const root = globalThis as typeof globalThis & { [STATE_KEY]?: TranscriberState };
  root[STATE_KEY] ??= {};
  return root[STATE_KEY];
}

export function setTranscriber(transcriber: Pcm16Transcriber | undefined): void {
  state().transcriber = transcriber;
}

export function clearTranscriber(transcriber?: Pcm16Transcriber): void {
  const current = state().transcriber;
  if (!transcriber || current === transcriber) state().transcriber = undefined;
}

export function getTranscriber(): Pcm16Transcriber | undefined {
  return state().transcriber;
}
