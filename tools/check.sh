#!/usr/bin/env bash
# The gate every change passes before a review. A workstation and CI run the
# same file, so neither can drift.
#
# The search patterns below use character-class splits such as [t]hutapi and
# [pP][0-9]. A split still matches the text it hunts, while the literal in this
# file never matches itself. Both scans read every tracked file, and this file
# is one of them.
set -euo pipefail
cd "$(dirname "$0")/.."
git rev-parse --is-inside-work-tree >/dev/null

step() { printf '\n== %s ==\n' "$1"; }

# Fail when any tracked or staged-for-review file matches a forbidden pattern.
# The listing is git ls-files for tracked work, plus the untracked files git
# would add, so the gate judges uncommitted work the same way. Exit 1 on a
# match and on a scan error, so the gate never passes by accident. An optional
# second argument names one exempt file.
scan_tracked_files() {
	local pattern=$1 exclude=${2:-} file status
	local -a hits=()
	mapfile -d '' files < <(git ls-files --cached --others --exclude-standard -z)
	for file in "${files[@]}"; do
		if [ "$file" = "$exclude" ]; then continue; fi
		status=0
		grep -iIlE -- "$pattern" "$file" || status=$?
		case $status in
			0) hits+=("$file") ;;
			1) ;;
			*)
				printf 'The scan could not read %s\n' "$file" >&2
				exit 1
				;;
		esac
	done
	if [ "${#hits[@]}" -gt 0 ]; then
		printf 'Blocked. These tracked files match a forbidden pattern:\n' >&2
		printf '%s\n' "${hits[@]}" >&2
		exit 1
	fi
}

step "svelte-check"
npm run check

step "eslint"
npm run lint

step "vitest"
npm run test

step "playwright"
# Three engines, run bare. A workstation can lack the system libraries the
# webkit engine needs, so a bare webkit launch failure re-runs that one project
# inside the pinned image. Chromium and Firefox never fall back, and a genuine
# test failure never does either.
launches() {
	node --input-type=module -e "import { webkit } from 'playwright-core'; const browser = await webkit.launch(); await browser.close();" 2>/dev/null
}
npm run test:browser -- --project=chromium
npm run test:browser -- --project=firefox

bare_status=0
npm run test:browser -- --project=webkit || bare_status=$?
if [ "$bare_status" -eq 0 ]; then
	echo "webkit ran on the host."
elif launches; then
	echo "The webkit project failed while its engine launches. This is a test failure, not an environment gap." >&2
	exit 1
else
	image="mcr.microsoft.com/playwright:v$(node -p "require('@playwright/test/package.json').version")-noble"
	echo "webkit cannot launch on this host. The webkit project runs inside $image."
	docker run --rm --init --ipc=host --name "chaaya-webkit-$$" \
		-u "$(id -u):$(id -g)" -e HOME=/tmp/pw-home \
		-v "$PWD:/work" -w /work "$image" \
		timeout 900 npx playwright test --project=webkit
fi

step "svelte-package"
rm -rf dist
npm run package

step "publint"
npm run publint

step "consumer names"
# No consumer project may leave its name in a tracked file. Case does not
# matter. The ignore rule that keeps local planning out of git is the one
# allowed mention of [d]ev-diary, so that branch alone skips the ignore file.
scan_tracked_files '[t]hutapi|[a]jilamu|[r]eprise|[f]oleyflow'
scan_tracked_files '[d]ev-diary' '.gitignore'

step "plan references"
# No tracked file may cite the plan. Identifiers carry a non-identifier prefix
# so generated checksums cannot look like a reference. A lone single-letter type
# parameter in angle brackets has no digit after it and never matches. The
# ignore entries naming the planning documents are the allowed mention, so the
# file-name branch alone skips the ignore file.
section_mark=$'\xc2\xa7'
scan_tracked_files '[p]lan[.]md|project[.]md|handoff[.]md|control-room[.]md' '.gitignore'
scan_tracked_files 'invariant [0-9]|round[0-9]|task [0-9]|(^|[^A-Za-z0-9+/=_-])[tT][0-9]+([.][0-9]+)?[a-z]?\b|(^|[^A-Za-z0-9+/=_-])[pP][0-9]+\b'"|$section_mark"

step "gate"
echo "Every check passed."
