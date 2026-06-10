// SPDX-License-Identifier: AGPL-3.0-or-later

/** Current process environment through Bun's native runtime surface. */
export function runtimeEnv(): NodeJS.ProcessEnv {
  return Bun.env;
}
