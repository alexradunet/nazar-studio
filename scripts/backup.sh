#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Nazar backup — Restic snapshot of the vault + a git commit for history.
# Configure: RESTIC_REPOSITORY (e.g. rclone:b2:nazar or sftp:host:/path) + RESTIC_PASSWORD.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# The vault lives OUTSIDE the repo. Honor VAULT_PATH (set in the environment), else the XDG
# default — the same path lib/paths.ts resolves. Source a local .env if present for VAULT_PATH.
[ -f "$ROOT/.env" ] && { set -a; . "$ROOT/.env"; set +a; }
VAULT="${VAULT_PATH:-${XDG_DATA_HOME:-$HOME/.local/share}/nazar}"

echo "==> git commit (vault history)"
git -C "$VAULT" add -A 2>/dev/null || true
git -C "$VAULT" commit -m "vault: auto $(date -u +%F)" 2>/dev/null || echo "   (nothing to commit)"

echo "==> restic backup (encrypted, off-site)"
if [ -n "${RESTIC_REPOSITORY:-}" ]; then
	restic backup "$VAULT" --exclude='.sqlite' --tag nazar
	restic forget --keep-daily 7 --keep-weekly 8 --keep-monthly 12 --prune
else
	echo "   RESTIC_REPOSITORY not set — skipping off-site backup."
fi
echo "==> done."
