// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { createModelDownloadProgressReporter, formatModelDownloadProgress, modelDownloadProgressPercent } from "./download-progress.ts";

test("formats model download progress", () => {
  expect(modelDownloadProgressPercent({ downloadedSize: 42, totalSize: 100 })).toBe(42);
  expect(formatModelDownloadProgress({ downloadedSize: 1_500_000_000, totalSize: 3_000_000_000 })).toBe("Downloading local model · 50% [##########----------] (1.5 GB / 3.0 GB)");
  expect(formatModelDownloadProgress({ downloadedSize: 2_000_000, totalSize: 0 })).toBe("Downloading local model · 2.0 MB");
});

test("download progress reporter emits only percent changes", () => {
  const lines: string[] = [];
  const report = createModelDownloadProgressReporter((line) => lines.push(line));

  report?.({ downloadedSize: 10, totalSize: 100 });
  report?.({ downloadedSize: 10.5, totalSize: 100 });
  report?.({ downloadedSize: 11, totalSize: 100 });

  expect(lines).toEqual([
    "Downloading local model · 10% [##------------------] (10 B / 100 B)",
    "Downloading local model · 11% [##------------------] (11 B / 100 B)",
  ]);
});
