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

step "audio tools"
# The browser audio checks measure a recorded take with ffmpeg and ffprobe.
# Both tools must be present before the browser leg runs. A missing tool fails
# here by name, so no audio check turns into a silent skip.
for measurement_tool in ffprobe ffmpeg; do
  if ! command -v "$measurement_tool" >/dev/null; then
    printf 'Blocked. %s is not installed, so the audio checks cannot measure a take.\n' "$measurement_tool" >&2
    exit 1
  fi
done

# Fail when any tracked or staged-for-review file matches a forbidden pattern.
# The listing is git ls-files for tracked work, plus the untracked files git
# would add, so the gate judges uncommitted work the same way. Exit 1 on a
# match and on a scan error, so the gate never passes by accident. An optional
# second argument names one exempt file.
scan_tracked_files() {
	local pattern=$1 exclude=${2:-} file status
	local -a hits=()
	mapfile -d '' files < <(git ls-files --cached --others --exclude-standard -z)
	# An untracked symlink to a directory lists as one path. Skip it, so grep
	# never reads a directory and fails the scan. A tracked file deleted in
	# the working tree but not staged also still lists. Skip it the same way
	# the lint step does, so the scan judges the tree and not the index.
	for file in "${files[@]}"; do
		if [ "$file" = "$exclude" ] || [ ! -f "$file" ]; then continue; fi
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

step "svelte 4 leakage"
# A Svelte 4 idiom inside a Svelte 5 file compiles clean and then never
# reacts. No compiler warns, so this scan hunts the idioms in src/lib: an
# export let prop, a $: reactive label, an import from svelte/store.
node tools/guards/svelte4-leakage.mjs

step "visual values"
# Components ship behaviour, not looks. Colours and font families come from
# the consumer's tokens. The scan fails on literal values in src/lib, except
# in the token contract's reference file.
node tools/guards/visual-values.mjs

step "keel fixtures"
# The wire fixtures are a byte copy of Keel's golden frames at a pinned tag.
# This step reruns that copy against the recorded tag and fails when a byte
# differs, so a hand edit cannot pass. CI never sees the Keel checkout, so the
# step prints why it skips and carries on there.
keel=${KEEL_DIR:-/home/nryn/work/keel}
if [ ! -e "$keel/.git" ]; then
	echo "No Keel checkout at $keel. The gate parses the committed fixtures only, so it skips the copy check."
else
	keel_tag=$(cat src/lib/wire/fixtures/KEEL_TAG)
	keel_staging=$(mktemp -d)
	trap 'rm -rf "$keel_staging"' EXIT
	git -C "$keel" archive "$keel_tag" testdata/wire | tar -x -C "$keel_staging"
	diff -ru --exclude=KEEL_TAG "$keel_staging/testdata/wire" src/lib/wire/fixtures
fi

step "vitest"
npm run test

step "playwright"
# The browser leg runs against a production build, not the dev server. All
# three engines share one invocation and one server, so no engine can
# adopt a server another engine is shutting down. WebKit cannot launch on every
# workstation, so a bare launch failure re-runs that one project inside the
# pinned image, where it builds and serves on its own. Chromium and Firefox
# never fall back, and a genuine test failure never does either.
launches() {
	node --input-type=module -e "import { webkit } from 'playwright-core'; const browser = await webkit.launch(); await browser.close();" 2>/dev/null
}
if launches; then
	npm run test:browser
else
	image="mcr.microsoft.com/playwright:v$(node -p "require('@playwright/test/package.json').version")-noble"
	echo "webkit cannot launch on this host. chromium and firefox run bare, webkit runs inside $image."
	npm run test:browser -- --project=chromium --project=firefox
	# The marker reader measures a take with ffprobe, and the pinned image
	# carries no ffmpeg. The static pair the workflow installs comes from
	# the same image here, extracted to the work directory, so the container
	# finds the binaries on its own PATH without a mount beside /work.
	tool_dir=".playwright-image-tools"
	rm -rf "$tool_dir"
	mkdir -p "$tool_dir"
	tool_cid=$(docker create mwader/static-ffmpeg:7.1@sha256:a8090df5f5608daef387e1b2e93b98aaacb4d92153ad904e7d715c725724fca4)
	docker cp "${tool_cid}:/ffmpeg" "$tool_dir/ffmpeg"
	docker cp "${tool_cid}:/ffprobe" "$tool_dir/ffprobe"
	docker rm "$tool_cid" >/dev/null
	docker run --rm --init --ipc=host --name "chaaya-webkit-$$" \
		-u "$(id -u):$(id -g)" -e HOME=/tmp/pw-home \
		-v "$PWD:/work" -w /work "$image" \
		env PATH="/work/$tool_dir:$PATH" \
		timeout 900 npx playwright test --project=webkit
fi

step "svelte-package"
rm -rf dist
npm run package

step "publint"
npm run publint

step "server safety"
# Consumers render on the server and prerender. This step imports every entry
# in the exports map with plain node and no DOM. An import-time touch of
# window, document, navigator or localStorage fails it. The step needs the
# build above, because the exports map points at dist.
node tools/guards/server-safety.mjs

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
