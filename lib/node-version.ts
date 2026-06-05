// SPDX-License-Identifier: AGPL-3.0-or-later

export const MIN_NODE_SQLITE_VERSION = "23.4.0";

export type NodeVersion = {
  major: number;
  minor: number;
  patch: number;
};

export function parseNodeVersion(version: string): NodeVersion | undefined {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareNodeVersions(a: NodeVersion, b: NodeVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function hasStableNodeSqlite(version = process.version): boolean {
  const current = parseNodeVersion(version);
  const minimum = parseNodeVersion(MIN_NODE_SQLITE_VERSION)!;
  return current !== undefined && compareNodeVersions(current, minimum) >= 0;
}

export function nodeSqliteUpgradePrompt(version = process.version): string | undefined {
  if (hasStableNodeSqlite(version)) return undefined;
  return `Nazar memory uses node:sqlite FTS5. Current Node is ${version}; please install/update to Node 24 LTS or newer (minimum ${MIN_NODE_SQLITE_VERSION}) so memory works without experimental runtime issues.`;
}
