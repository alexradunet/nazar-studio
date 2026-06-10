// SPDX-License-Identifier: AGPL-3.0-or-later
import { modelsDir } from "../paths.ts";
import { createModelDownloadProgressReporter, type ModelDownloadProgress } from "./download-progress.ts";
import { getBalaurModelStatus, type BalaurModelStatus } from "./model-status.ts";

interface ResolveModelFileOptions {
  directory: string;
  cli: boolean;
  onProgress?: (progress: ModelDownloadProgress) => void;
  signal?: AbortSignal;
}

type ResolveModelFile = (modelUri: string, options: ResolveModelFileOptions) => Promise<string>;

export interface EnsureBalaurLocalModelOptions {
  cacheDir?: string;
  env?: NodeJS.ProcessEnv;
  onStatus?: (text: string) => void;
  resolveModelFile?: ResolveModelFile;
  signal?: AbortSignal;
}

async function defaultResolveModelFile(modelUri: string, options: ResolveModelFileOptions): Promise<string> {
  const llamaCpp = await import("node-llama-cpp");
  return llamaCpp.resolveModelFile(modelUri, options);
}

export async function ensureBalaurLocalModel(options: EnsureBalaurLocalModelOptions = {}): Promise<BalaurModelStatus> {
  const cacheDir = options.cacheDir ?? modelsDir();
  const status = getBalaurModelStatus(options.env, cacheDir);
  if (!status.local || !status.needsDownload) return status;

  const action = status.cache?.partial ? "Resuming" : "Downloading";
  options.onStatus?.(`${action} local model ${status.model.name}. This may take a while.`);

  const resolveModelFile = options.resolveModelFile ?? defaultResolveModelFile;
  await resolveModelFile(status.model.id, {
    directory: cacheDir,
    cli: false,
    onProgress: createModelDownloadProgressReporter(options.onStatus),
    signal: options.signal,
  });

  const nextStatus = getBalaurModelStatus(options.env, cacheDir);
  options.onStatus?.(`Local model ready: ${status.model.name}.`);
  return nextStatus;
}
