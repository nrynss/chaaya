#!/usr/bin/env bash
# Copy the wire fixtures out of a pinned Keel tag.
#
# Keel owns the golden error and event frames. This script regenerates the copy
# under src/lib/wire/fixtures from the tag named on the command line. It falls
# back to the pinned tag when the caller omits one. It records the tag it
# copied in KEEL_TAG, so the gate can rerun the same copy later.
set -euo pipefail
cd "$(dirname "$0")/.."

keel=${KEEL_DIR:-/home/nryn/work/keel}
tag=${1:-v0.0.1}
dest=src/lib/wire/fixtures

if [ ! -e "$keel/.git" ]; then
	printf 'No Keel checkout at %s\n' "$keel" >&2
	exit 1
fi

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
git -C "$keel" archive "$tag" testdata/wire | tar -x -C "$staging"

if [ ! -d "$staging/testdata/wire" ]; then
	printf 'Keel tag %s carries no testdata/wire directory\n' "$tag" >&2
	exit 1
fi

rm -rf "$dest"
mkdir -p "$dest"
cp -R "$staging/testdata/wire/." "$dest/"
printf '%s\n' "$tag" >"$dest/KEEL_TAG"
printf 'Copied the wire fixtures from Keel %s\n' "$tag"
