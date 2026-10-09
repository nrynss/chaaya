# Review: keep the packaged Svelte modules compilable, issue 80

Written by glm-vibe, a coding agent. This file records one agent's read of the handed commit. It is not a maintainer approval.

- Hash reviewed: `4dd449d79cb8b3c570376931817b3ef9ed3ce086` (branch `issue-80-svelte5-dist`, one commit on `main` `c7ad43b`)
- Worktree: `/home/nryn/work/chaaya-wt/glm-vibe-issue-80-rev-r1` (detached at the hash)
- Spec: GitHub issue nrynss/chaaya#80, pull request nrynss/chaaya#82
- Diff read: `git diff main...4dd449d`. Four files. `tsconfig.json`, `package.json`, `tools/check.sh`, and the new `tools/guards/published-svelte-modules.mjs`.

## What the change is

The root `tsconfig.json` sets `"target": "ES2022"`, so packaging no longer leans on the generated `.svelte-kit` config a clean tree lacks. The `package` script runs `svelte-kit sync` before `svelte-package`. A new gate step between `svelte-package` and `publint` compiles every `dist/**/*.svelte.js` through `compileModule` and fails by name on the first throw. The guard reads files and runs the compiler only. No declaration record changed, and no `docs/scope.md` line changed. That matches the issue shape exactly.

## Findings

None. Severity counts C 0, H 0, M 0, L 0.

## Pins I ran

Every pin ran on the handed hash. The mutation pins ran in a scratch copy of my worktree at `/tmp/chaaya-rev-r1/scratch` with `node_modules` linked, so my worktree never carried a mutation. My worktree read clean before and after.

1. **The mutation must fail.** I removed the target line with `sed`, removed `.svelte-kit` and `dist`, and ran `npx svelte-package -i src/lib -o dist` with the sync belt bypassed. Packaging exited 0 in silence. The landed guard exited 1 and named `dist/adapters/keel/job/job.svelte.js`.
2. **The mutation rebuilds 0.4.0.** `diff -r` of that build against the published 0.4.0 `dist` reports every publishable file byte-identical. The only difference is the `.test.js` and `.test.d.ts` files `npm pack` filters out of the artifact anyway.
3. **The artifact fails the landed guard.** I ran a fresh `npm pack @nrynss/chaaya@0.4.0` and used that tarball alone. Its `dist` is byte-identical to the copy already on this machine, which settles provenance. I dropped that `dist` into the scratch tree and ran the landed guard. Exit 1, naming the same file.
4. **The mechanism, counted.** `compileModule` over all 20 `.svelte.js` modules of the 0.4.0 artifact throws `state_invalid_placement` on 18 and compiles 2 clean. The first thrower is `dist/adapters/keel/job/job.svelte.js`. This matches the pull request claim exactly.
5. **Honest state, target absent, belt present.** Target line removed, no `.svelte-kit`, `npm run package`. The belt regenerates the config and packaging exits 0. Guard exit 0 with 20 modules compiled.
6. **Honest state, target present, belt bypassed.** Target line restored, no `.svelte-kit`, `npx svelte-package` with no sync. Guard exit 0 with 20 modules compiled.
7. **Honest state, ordinary flow.** In my own worktree, `rm -rf .svelte-kit dist && npm run package`, guard exit 0 with 20 modules compiled, and `git status --porcelain` empty.
8. **The guard refuses an empty proof.** With no `dist` it exits 1 and says so. With a `dist` that carries no `.svelte.js` module it exits 1 and says so. The step cannot pass on an empty build.
9. **No packaging path skips the belt.** The only packaging caller outside `package.json` is `tools/freeze-api.sh`, and it runs `npm run package`, so the belt covers it.

## Gate record

Every run is the full `./tools/check.sh` after `npm ci`, one at a time, with nothing else running on the machine.

**Worktree** `/home/nryn/work/chaaya-wt/glm-vibe-issue-80-rev-r1` at `4dd449d`:

- `npm ci`, exit 0.
- `./tools/check.sh`, exit 0. All 17 steps ran. vitest 465 passed in 53 files. Playwright 298 passed, then 139 passed on the sink leg. The new step printed `compiled 20 .svelte.js modules through the Svelte 5 module compiler`. The published api step diffed `dist` against the `api/0.4.0` record and passed. `Every check passed.` closed the run.

**Clean clone triple** at `4dd449d`, three runs in a row, each from a fresh clone:

    git clone -b issue-80-svelte5-dist /home/nryn/work/chaaya /tmp/chaaya-rev-r1/clone-N
    cd /tmp/chaaya-rev-r1/clone-N
    npm ci
    ./tools/check.sh

- Each clone checked out `4dd449d79cb8b3c570376931817b3ef9ed3ce086` and carried zero dirty paths.
- Clone 1: `npm ci` exit 0, gate exit 0.
- Clone 2: `npm ci` exit 0, gate exit 0.
- Clone 3: `npm ci` exit 0, gate exit 0.
- Every run printed `compiled 20 .svelte.js modules through the Svelte 5 module compiler` and closed with `Every check passed.`
- No flake broke the streak, so no run needed a retry.

## Review questions

1. **Did a Svelte 4 idiom slip in?** No. The diff touches no component and no reactive module. The svelte 4 leakage scan passed. The new code is plain node with no reactivity.
2. **Does a module touch a browser global at import time?** No. The new guard imports `node:fs`, `node:path`, `svelte/compiler` and the shared guard library, all safe on a server. The server safety step passed. My grep over the diff for `window`, `document`, `navigator` and `localStorage` calls found zero hits.
3. **Does a component carry a visual value?** No. The visual values scan passed. The diff carries no colour, font, shadow or spacing value.
4. **Does the change, its issue, or its pull request name a consumer?** No. I grepped the diff, the commit message, the issue body and the pull request body for every recorded consumer name. Zero hits. The consumer names step passed.
5. **Does any code, comment or test cite a planning file or a private note, or did stripping one lose the reason it carried?** No. Both plan reference scans passed on the tracked tree, and my own grep over the diff found none. The guard comments state the reason in their own words, so nothing was stripped.
6. **Does `docs/scope.md` still match what the change covers?** Yes. This is a build, packaging and gate fix. It adds no coverage and removes none, so the file needs no edit, and the diff does not touch it. The issue states the same boundary.
7. **Was this review run on the handed hash, in a worktree of its own?** Yes. Detached worktree at the hash above, confirmed with `git log -1` before any run. I never moved the branch.

## Verdict

**APPROVE.** C 0, H 0, M 0, L 0. The gate is green on the handed hash in my worktree and three times on a clean clone. Every author claim I relied on reproduced under my own pins. This verdict covers `main...4dd449d` and nothing else.
