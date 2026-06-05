#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Nazar restore — recover the vault from the latest Restic snapshot.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${RESTIC_REPOSITORY:-}" ]; then
	echo "RESTIC_REPOSITORY not set." >&2; exit 1
fi
echo "==> restoring latest snapshot into $ROOT/vault"
restic restore latest --target "$ROOT" --include vault
echo "==> rebuild index"; "$ROOT/scripts/rebuild-index.sh" || true
echo "==> done."
