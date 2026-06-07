#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/boke/repo}"
RELEASES_DIR="${RELEASES_DIR:-/var/www/boke-site/releases}"
CURRENT_LINK="${CURRENT_LINK:-/var/www/boke-site/current}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

timestamp="$(date -u +%Y%m%d%H%M%S)"
release_dir="${RELEASES_DIR}/${timestamp}"

cd "$APP_DIR"
npm ci --omit=dev
npm run clean
npm run build

mkdir -p "$release_dir/boke"
rsync -a --delete public/ "$release_dir/boke/"

find "$release_dir" -type d -exec chmod 755 {} +
find "$release_dir" -type f -exec chmod 644 {} +

ln -sfn "$release_dir" "${CURRENT_LINK}.tmp"
mv -Tf "${CURRENT_LINK}.tmp" "$CURRENT_LINK"

find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf

echo "Released ${timestamp}"
