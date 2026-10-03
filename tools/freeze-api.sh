#!/usr/bin/env bash
# Freeze dist into api/<package.json version>/ when cutting a release.
#
# Run this from a clean tree after tools/check.sh has passed and before the
# tag. The script builds the package, copies the public declarations, and
# applies the same bump rule as the gate. It does not commit and it does not
# tag. A tag made before this commit would point at a tree with no snapshot.
#
#   ./tools/check.sh
#   ./tools/freeze-api.sh
#   git add api/<version>
#   git commit -m "Freeze the <version> declarations"
#   git tag -a v<version> -m "<version>"
#
# A second run for a version that already has a record fails. Edit the record
# by bumping package.json, not by rewriting api/<version>/.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=published-api.sh
source tools/published-api.sh

if [ -n "$(git status --porcelain)" ]; then
	printf 'Blocked. The worktree is dirty. Freeze from a clean tree so the snapshot commit is only the new record.\n' >&2
	exit 1
fi

pkg=$(pkg_version)
if ! version_ok "$pkg"; then
	printf 'Blocked. package.json version %s is not a plain major.minor.patch version.\n' "$pkg" >&2
	exit 1
fi
if [ -d "api/$pkg" ]; then
	printf 'Blocked. api/%s already exists. Bump the package to freeze a new version.\n' "$pkg" >&2
	exit 1
fi

base_ref=${CHAAYA_BASE_REF:-origin/main}
require_base "$base_ref"
assert_published_history "$base_ref" "$pkg"
assert_unreleased_ahead "$pkg"

npm run package

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
copy_declarations "$staging/record"
assert_record_matches_dist "$staging/record"
assert_bump_policy "$pkg" "$staging/record"

mkdir -p api
mv "$staging/record" "api/$pkg"
trap - EXIT
rm -rf "$staging"
printf 'Froze api/%s. Commit that directory, then tag v%s. Run tools/check.sh again before you publish.\n' "$pkg" "$pkg"
