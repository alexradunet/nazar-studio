// SPDX-License-Identifier: AGPL-3.0-or-later
import { getEnvApiKey } from "@earendil-works/pi-ai";
import { runtimeEnv } from "../env.ts";

export function getBalaurApiKey(provider: string): string | undefined {
  const suffix = provider.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const explicit = runtimeEnv()[`BALAUR_${suffix}_API_KEY`];
  return explicit || getEnvApiKey(provider);
}
