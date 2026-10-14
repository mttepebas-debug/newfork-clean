#!/bin/sh
# Copies the atlas source (not the build output) to the project's shared folder.
# Usage: sh tools/sync.sh   (from apps/web/.temp/atlas)
set -e
dest=/mnt/project-files/pages/atlas/source
mkdir -p "$dest"
tar -C "$(dirname "$0")/.." --exclude=./dist -cf - . | tar -C "$dest" -xf -
echo "synced to $dest"
