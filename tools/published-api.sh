#!/usr/bin/env bash
# The published declaration contract.
#
# api/<version>/ is the frozen .d.ts snapshot for a version that has been
# tagged. It is not a living copy of dist. A pull request may move the public
# surface. It may not edit a snapshot that is already on the base branch.
#
# While api/<package.json version>/ is absent, the version must be a plain
# major.minor.patch and strictly newer than every frozen record. The byte
# diff waits for the release. tools/freeze-api.sh writes that record from
# dist. After the record exists, it must match the built declarations, and a
# non-breaking bump must still export every name from the previous record.
#
# Before 1.0.0 the minor component is the breaking slot: 0.2.4 to 0.3.0 may
# remove declarations, and 0.3.0 to 0.3.1 may not. From 1.0.0 only a major
# bump may remove them. A patch never may.
#
# The base ref defaults to origin/main. CHAAYA_BASE_REF overrides it. A
# shallow checkout that does not have that ref gets one fetch of the branch.
# If the ref is still missing, the gate fails closed instead of skipping
# the history check.
set -euo pipefail

pkg_version() {
	node -p "require('./package.json').version"
}

version_ok() {
	[[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# True when $1 is strictly greater than $2 under version sort.
version_gt() {
	local top
	[ "$1" = "$2" ] && return 1
	top=$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)
	[ "$top" = "$1" ]
}

# See the header for which bumps may remove declarations.
is_breaking_bump() {
	local prev=$1 next=$2
	local p_major p_minor p_patch n_major n_minor n_patch
	IFS=. read -r p_major p_minor p_patch <<<"$prev"
	IFS=. read -r n_major n_minor n_patch <<<"$next"
	if [ "$p_major" -eq 0 ] && [ "$n_major" -eq 0 ]; then
		[ "$n_minor" -gt "$p_minor" ]
		return
	fi
	[ "$n_major" -gt "$p_major" ]
}

require_base() {
	local base_ref=$1 branch
	if git rev-parse --verify --quiet "${base_ref}^{commit}" >/dev/null; then
		return 0
	fi
	# CI checks out the pull request with depth 1, so the base branch is
	# often absent. One fetch brings its tree. The workflow file stays
	# untouched. A missing ref after that still fails the gate.
	if [[ $base_ref == origin/* ]]; then
		branch=${base_ref#origin/}
		if ! git fetch --depth=1 origin "$branch"; then
			printf 'Blocked. Could not fetch %s, so frozen records cannot be checked against published history.\n' "$base_ref" >&2
			exit 1
		fi
	fi
	if ! git rev-parse --verify --quiet "${base_ref}^{commit}" >/dev/null; then
		printf 'Blocked. %s is not available, so frozen records cannot be checked against published history. Fetch it, or set CHAAYA_BASE_REF.\n' "$base_ref" >&2
		exit 1
	fi
}

# Fills version_names with plain versions found as direct children of api/.
read_local_versions() {
	local path name
	version_names=()
	[ -d api ] || return 0
	shopt -s nullglob
	for path in api/[0-9]*/; do
		[ -d "$path" ] || continue
		name=${path#api/}
		name=${name%/}
		if ! version_ok "$name"; then
			printf 'Blocked. %s is not a major.minor.patch record.\n' "$path" >&2
			exit 1
		fi
		version_names+=("$name")
	done
	shopt -u nullglob
}

# Fills base_names from the base ref. Exits if a child is not a plain version.
read_base_versions() {
	local base_ref=$1 path name
	base_names=()
	if ! git cat-file -e "${base_ref}:api" 2>/dev/null; then
		return 0
	fi
	while IFS= read -r path; do
		[ -n "$path" ] || continue
		name=${path#api/}
		if ! version_ok "$name"; then
			printf 'Blocked. %s on %s is not a major.minor.patch record.\n' "$path" "$base_ref" >&2
			exit 1
		fi
		base_names+=("$name")
	done < <(git ls-tree -d --name-only "$base_ref" api/ | sort -V)
}

# Records that already exist on the base stay byte for byte, including the
# lowest one. A new record is allowed only for the version in package.json.
assert_published_history() {
	local base_ref=$1 pkg=$2 name status
	local -A on_base=()
	read_base_versions "$base_ref"
	read_local_versions
	for name in "${base_names[@]}"; do
		on_base["$name"]=1
		if [ ! -d "api/$name" ]; then
			printf 'Blocked. api/%s exists on %s and must not be removed.\n' "$name" "$base_ref" >&2
			exit 1
		fi
		if ! git diff --quiet "$base_ref" -- "api/$name"; then
			printf 'Blocked. api/%s differs from %s. A published record stays frozen.\n' "$name" "$base_ref" >&2
			git diff --stat "$base_ref" -- "api/$name" >&2 || true
			exit 1
		fi
		status=$(git status --porcelain -- "api/$name")
		if [ -n "$status" ]; then
			printf 'Blocked. api/%s has working tree changes and must stay frozen.\n' "$name" >&2
			printf '%s\n' "$status" >&2
			exit 1
		fi
	done
	for name in "${version_names[@]}"; do
		if [ -n "${on_base[$name]:-}" ]; then
			continue
		fi
		if [ "$name" != "$pkg" ]; then
			printf 'Blocked. api/%s is not on %s. The only record a release may add is api/%s.\n' "$name" "$base_ref" "$pkg" >&2
			exit 1
		fi
	done
}

# Public declaration files, relative paths with a leading ./, sorted.
list_declarations() {
	local root=$1
	(cd "$root" && find . -name '*.d.ts' ! -name '*.test.d.ts' ! -name '*.spec.d.ts' | sort)
}

# Export names one declaration file introduces. A rename reads as a removal
# because both the local name and the exported name are collected.
names_in() {
	node --input-type=module -e '
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const ts = require("typescript");
const text = readFileSync(process.argv[1], "utf8");
const source = ts.createSourceFile(process.argv[1], text, ts.ScriptTarget.Latest, true);
const names = new Set();
const visit = (node) => {
  if (ts.isExportSpecifier(node)) {
    names.add(node.name.text);
    if (node.propertyName !== undefined) names.add(node.propertyName.text);
  } else if (
    ts.isVariableStatement(node) || ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)
  ) {
    const exported = (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported) {
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
        }
      } else if (node.name !== undefined) {
        names.add(node.name.text);
      }
    }
  }
  ts.forEachChild(node, visit);
};
visit(source);
console.log([...names].sort().join("\n"));' "$1"
}

# Sets removal_count. Prints one line per missing file or export.
# $1 is the previous record, $2 is the record that must still contain it.
collect_removals() {
	local previous=$1 current=$2 declaration current_names previous_names name
	removal_count=0
	while IFS= read -r declaration; do
		[ -n "$declaration" ] || continue
		if [ ! -f "$current/$declaration" ]; then
			printf 'Removed file %s (present in %s, absent from %s).\n' "$declaration" "$previous" "$current" >&2
			removal_count=$((removal_count + 1))
			continue
		fi
		current_names=$(names_in "$current/$declaration")
		previous_names=$(names_in "$previous/$declaration")
		while IFS= read -r name; do
			[ -n "$name" ] || continue
			if ! grep -qxF "$name" <<<"$current_names"; then
				printf 'Removed export %s from %s.\n' "$name" "$declaration" >&2
				removal_count=$((removal_count + 1))
			fi
		done <<<"$previous_names"
	done < <(list_declarations "$previous")
}

# The current record is exactly the public declarations under dist.
assert_record_matches_dist() {
	local api_record=$1 declaration built extra=0
	local -A expected=()
	if [ ! -d dist ]; then
		printf 'Blocked. dist is missing, so %s cannot be compared to the build.\n' "$api_record" >&2
		exit 1
	fi
	while IFS= read -r declaration; do
		[ -n "$declaration" ] || continue
		expected["$declaration"]=1
		if [ ! -f "$api_record/$declaration" ]; then
			printf 'Blocked. %s has no frozen declaration under %s.\n' "$declaration" "$api_record" >&2
			extra=1
			continue
		fi
		diff -u "$api_record/$declaration" "dist/$declaration" || extra=1
	done < <(list_declarations dist)
	while IFS= read -r built; do
		[ -n "$built" ] || continue
		if [ -z "${expected[$built]:-}" ]; then
			printf 'Blocked. %s/%s is not a public declaration from dist.\n' "$api_record" "${built#./}" >&2
			extra=1
		fi
	done < <(cd "$api_record" && find . -type f | sort)
	if [ "$extra" -ne 0 ]; then
		printf 'Blocked. The build differs from the frozen declarations under %s.\n' "$api_record" >&2
		exit 1
	fi
}

# Copy public declarations from dist into $1. Fails when dist has none.
copy_declarations() {
	local dest=$1 declaration dir count=0
	if [ ! -d dist ]; then
		printf 'Blocked. dist is missing, so there is nothing to freeze.\n' >&2
		exit 1
	fi
	mkdir -p "$dest"
	while IFS= read -r declaration; do
		[ -n "$declaration" ] || continue
		dir=$(dirname "$declaration")
		mkdir -p "$dest/$dir"
		cp "dist/$declaration" "$dest/$declaration"
		count=$((count + 1))
	done < <(list_declarations dist)
	if [ "$count" -eq 0 ]; then
		printf 'Blocked. dist has no public declarations to freeze.\n' >&2
		exit 1
	fi
	printf 'Copied %s public declarations into %s.\n' "$count" "$dest"
}

# Highest frozen version strictly below $1. Exits when a record is newer.
previous_version() {
	local pkg=$1 name previous=""
	read_local_versions
	for name in "${version_names[@]}"; do
		if [ "$name" = "$pkg" ]; then
			continue
		fi
		if version_gt "$name" "$pkg"; then
			printf 'Blocked. Frozen record %s is newer than package version %s.\n' "$name" "$pkg" >&2
			exit 1
		fi
		if [ -z "$previous" ] || version_gt "$name" "$previous"; then
			previous=$name
		fi
	done
	printf '%s\n' "$previous"
}

assert_bump_policy() {
	local pkg=$1 api_record=$2 previous
	previous=$(previous_version "$pkg")
	if [ -z "$previous" ]; then
		printf 'No earlier frozen record. %s starts the history.\n' "$pkg"
		return 0
	fi
	collect_removals "api/$previous" "$api_record"
	if [ "$removal_count" -eq 0 ]; then
		printf 'No public declaration removed since %s.\n' "$previous"
		return 0
	fi
	if is_breaking_bump "$previous" "$pkg"; then
		printf 'Breaking bump from %s to %s. Those removals are allowed.\n' "$previous" "$pkg"
		return 0
	fi
	printf 'Blocked. %s to %s is not a breaking bump, so %s must keep every public file and export from api/%s.\n' "$previous" "$pkg" "$api_record" "$previous" >&2
	exit 1
}

assert_unreleased_ahead() {
	local pkg=$1 name
	read_local_versions
	for name in "${version_names[@]}"; do
		if ! version_gt "$pkg" "$name"; then
			printf 'Blocked. Package version %s is not strictly newer than frozen record %s. Bump it, or freeze this version with tools/freeze-api.sh.\n' "$pkg" "$name" >&2
			exit 1
		fi
	done
}

check_published_api() {
	local base_ref=${CHAAYA_BASE_REF:-origin/main}
	local pkg api_record
	pkg=$(pkg_version)
	if ! version_ok "$pkg"; then
		printf 'Blocked. package.json version %s is not a plain major.minor.patch version.\n' "$pkg" >&2
		exit 1
	fi
	require_base "$base_ref"
	assert_published_history "$base_ref" "$pkg"
	api_record="api/$pkg"
	if [ ! -d "$api_record" ]; then
		assert_unreleased_ahead "$pkg"
		printf 'Version %s is unreleased. Public declarations are not frozen on this run. At the release tag, tools/freeze-api.sh copies dist into %s. The packed tarball is still typechecked below.\n' "$pkg" "$api_record"
		return 0
	fi
	assert_record_matches_dist "$api_record"
	assert_bump_policy "$pkg" "$api_record"
	printf 'Frozen declarations under %s match the build.\n' "$api_record"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
	cd "$(dirname "$0")/.."
	check_published_api
fi
