#!/usr/bin/env bash
set -Eeuo pipefail

RELEASES_DIR="${RELEASES_DIR:-/var/www/boke-site/releases}"
CURRENT_LINK="${CURRENT_LINK:-/var/www/boke-site/current}"
target="${1:-}"

if [[ -z "$target" ]]; then
  target="$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort -r | sed -n '2p')"
else
  target="${RELEASES_DIR}/${target}"
fi

if [[ ! -d "$target/boke" ]]; then
  echo "Invalid release: $target" >&2
  exit 1
fi

ln -sfn "$target" "${CURRENT_LINK}.tmp"
mv -Tf "${CURRENT_LINK}.tmp" "$CURRENT_LINK"

echo "Rolled back to $(basename "$target")"
