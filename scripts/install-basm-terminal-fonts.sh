#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Install Nazar's Basm terminal fonts locally.
#
# Basm uses display/pixel fonts for web labels, but the daily terminal needs a
# readable monospace. CozetteVector is the default: compact, local, and ANSI-safe.
# Departure Mono and JetBrains Mono remain available as alternatives.
set -euo pipefail

DIR="${NAZAR_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
FONT_DST="${XDG_DATA_HOME:-$HOME/.local/share}/fonts/nazar"
FONT_FAMILY="${NAZAR_TERMINAL_FONT:-Cozette}"

mkdir -p "$FONT_DST"

install_cozette() {
  local src="$DIR/assets/fonts/cozette/CozetteVector.ttf"
  [ -f "$src" ] || { echo "Missing Cozette asset: $src" >&2; exit 1; }
  cp -f "$src" "$FONT_DST/"
}

install_departure_mono() {
  local src="$DIR/assets/fonts/departure-mono/DepartureMono-Regular.otf"
  [ -f "$src" ] || { echo "Missing Departure Mono asset: $src" >&2; exit 1; }
  cp -f "$src" "$FONT_DST/"
}

install_jetbrains_mono() {
  local src_dir="$DIR/web/fonts"
  shopt -s nullglob
  local fonts=("$src_dir"/jetbrainsmono-*.woff2)
  [ "${#fonts[@]}" -gt 0 ] || { echo "No JetBrains Mono font files found in $src_dir" >&2; exit 1; }
  cp -f "${fonts[@]}" "$FONT_DST/"
}

case "${FONT_FAMILY,,}" in
  cozette|cozettevector|cozette-vector)
    FONT_FAMILY="CozetteVector"
    install_cozette
    ;;
  "departure mono"|departure|departure-mono)
    FONT_FAMILY="Departure Mono"
    install_departure_mono
    ;;
  "jetbrains mono"|jetbrains|jetbrains-mono)
    FONT_FAMILY="JetBrains Mono"
    install_jetbrains_mono
    ;;
  *)
    echo "Unknown NAZAR_TERMINAL_FONT='$FONT_FAMILY'. Use 'Cozette', 'Departure Mono', or 'JetBrains Mono'." >&2
    exit 1
    ;;
esac

if command -v fc-cache >/dev/null 2>&1; then
  fc-cache -f "$FONT_DST" >/dev/null 2>&1 || fc-cache -f >/dev/null 2>&1 || true
fi

printf 'Installed %s to %s\n' "$FONT_FAMILY" "$FONT_DST"
if command -v fc-match >/dev/null 2>&1; then
  printf 'fontconfig match: '
  fc-match "$FONT_FAMILY" || true
fi
printf 'Set your terminal font to %s in your terminal preferences.\n' "$FONT_FAMILY"
