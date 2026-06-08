// SPDX-License-Identifier: AGPL-3.0-or-later
// Optional Chafa WASM renderer for ANSI avatar experiments.
// Pi render methods are synchronous, so the extension initializes WASM before use.
import Chafa from "chafa-wasm";

type Callback<T> = (error: unknown, data: T) => void;
type ChafaImageData = { width: number; height: number; data: Uint8ClampedArray };
type ChafaAnsiResult = { ansi: string };
type ChafaModule = {
  imageToAnsi(image: ChafaImageData, config: Record<string, unknown>, callback: Callback<ChafaAnsiResult>): void;
};

type ChafaState = {
  module?: ChafaModule;
  init?: Promise<boolean>;
  error?: string;
};

const state: ChafaState = {};

export async function initChafaWasm(): Promise<boolean> {
  if (state.module) return true;
  if (state.init) return state.init;

  state.init = Chafa()
    .then((module) => {
      state.module = module as ChafaModule;
      state.error = undefined;
      return true;
    })
    .catch((error: unknown) => {
      state.error = error instanceof Error ? error.message : String(error);
      return false;
    });

  return state.init;
}

export function chafaWasmReady(): boolean {
  return Boolean(state.module);
}

export function chafaWasmError(): string | undefined {
  return state.error;
}

function imageToChafaAnsiOnce(module: ChafaModule, image: ChafaImageData, config: Record<string, unknown>): string | undefined {
  let ansi: string | undefined;
  let failed = false;
  module.imageToAnsi(image, config, (error, data) => {
    if (error) {
      failed = true;
      state.error = error instanceof Error ? error.message : String(error);
      return;
    }
    state.error = undefined;
    ansi = data.ansi;
  });

  // chafa-wasm calls back synchronously after module initialization for decoded
  // ImageDataLike input. If that ever changes, fall back instead of blocking Pi.
  if (failed || ansi === undefined) return undefined;
  return ansi;
}

export function imageToChafaAnsi(image: ChafaImageData, config: Record<string, unknown>): string | undefined {
  if (!state.module) return undefined;

  // chafa-wasm 0.3.3 can throw on the first conversion after module init, then
  // succeed immediately on retry. Keep that warmup quirk out of Pi's renderer.
  return imageToChafaAnsiOnce(state.module, image, config)
    ?? imageToChafaAnsiOnce(state.module, image, config);
}
