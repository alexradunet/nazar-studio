// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ModelDownloadProgress {
  totalSize: number;
  downloadedSize: number;
}

function formatBytes(bytes: number): string {
  const safe = Math.max(0, bytes);
  if (safe >= 1000 ** 3) return `${(safe / 1000 ** 3).toFixed(1)} GB`;
  if (safe >= 1000 ** 2) return `${(safe / 1000 ** 2).toFixed(1)} MB`;
  if (safe >= 1000) return `${(safe / 1000).toFixed(1)} KB`;
  return `${safe} B`;
}

function progressBar(percent: number, width = 20): string {
  const safe = Math.max(0, Math.min(100, percent));
  const filled = Math.round((safe / 100) * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

export function modelDownloadProgressPercent(progress: ModelDownloadProgress): number | undefined {
  if (!Number.isFinite(progress.totalSize) || progress.totalSize <= 0) return undefined;
  const downloaded = Math.max(0, Math.min(progress.downloadedSize, progress.totalSize));
  return Math.floor((downloaded / progress.totalSize) * 100);
}

export function formatModelDownloadProgress(progress: ModelDownloadProgress): string {
  const percent = modelDownloadProgressPercent(progress);
  if (percent === undefined) return `Downloading local model · ${formatBytes(progress.downloadedSize)}`;
  const downloaded = Math.max(0, Math.min(progress.downloadedSize, progress.totalSize));
  return `Downloading local model · ${percent}% ${progressBar(percent)} (${formatBytes(downloaded)} / ${formatBytes(progress.totalSize)})`;
}

export function createModelDownloadProgressReporter(onStatus?: (text: string) => void): ((progress: ModelDownloadProgress) => void) | undefined {
  if (!onStatus) return undefined;
  let lastPercent: number | undefined;
  let emittedUnknownTotal = false;
  return (progress) => {
    const percent = modelDownloadProgressPercent(progress);
    if (percent === undefined) {
      if (emittedUnknownTotal) return;
      emittedUnknownTotal = true;
    } else if (percent === lastPercent) {
      return;
    } else {
      lastPercent = percent;
    }
    onStatus(formatModelDownloadProgress(progress));
  };
}
