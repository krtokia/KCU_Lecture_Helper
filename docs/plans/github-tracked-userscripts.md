# GitHub-tracked UserScript migration

## Objective

Convert the imported UserScript source files into clearly named, GitHub-tracked
`.user.js` files, retain the existing ntfy destination while making it easy to
edit at the top of the Helper, and remove the obsolete Greasy Fork update
metadata. Create a private GitHub repository and push the reviewed change as a
commit on `main`.

## Current-state findings

- The repository has an initial commit and no configured remote before this
  work; the approved outcome adds private `origin` and pushes `main`.
- `src/kcu-auto-navigator.user.js` is syntactically valid JavaScript for KCU
  Auto Navigator POC 3.1 (`0.3.1`).
- `src/kcu-lecture-helper.user.js` is syntactically valid JavaScript for KCU
  Lecture Helper (`1.0.0`). It retains the current ntfy destination through a
  single top-level editable constant; its Greasy Fork update metadata was
  removed in this local stage.
- README, source README, release, handoff, and syntax-check documentation now
  describe the included executable source and GitHub-first tracking model.

## Scope and non-goals

In scope: rename the imported source files, add a top-level ntfy configuration
block without changing its destination, remove Greasy Fork update metadata,
update documentation, validate syntax and Git contents, then create/push a
private GitHub repository.

Out of scope: deleting or modifying the existing Greasy Fork listing; changing
the ntfy destination or notification behavior; changing Navigator behavior;
testing against the KCU website; publishing a public release.

## Assumptions and constraints

- The existing ntfy destination must remain unchanged, but should not be
  reproduced in documentation or console output.
- A private repository is the safe default because the source still contains
  that destination. Public release requires a later explicit decision.
- Greasy Fork may be removed manually by the user later; its hosted update
  URLs must not remain in the repository source.

## Proposed design

1. Move the Navigator source to `src/kcu-auto-navigator.user.js` and Helper
   source to `src/kcu-lecture-helper.user.js`.
2. In Helper, define the ntfy endpoint once in a small top-level editable
   settings block, then reference it from `CONFIG.ntfy.url`.
3. Remove only `@downloadURL` and `@updateURL` metadata from Helper.
4. Update source and root README files to describe the included scripts and
   GitHub-first tracking model.
5. Commit the reviewed files, create `krtokia/KCU_Lecture_Helper` as private,
   add it as `origin`, and push `main`.

## Affected components

- `src/kcu-auto-navigator.user.js`
- `src/kcu-lecture-helper.user.js`
- `src/README.md`
- `README.md`
- `docs/RELEASE.md`
- Git history and the new GitHub remote

## Acceptance criteria

- Both scripts have descriptive `.user.js` names and no imported `.txt` source
  files remain in `src/`.
- Both scripts pass `node --check` when supplied through standard input.
- Helper keeps the existing ntfy value, has a single obvious top-level edit
  point for it, and no longer contains Greasy Fork update metadata.
- Documentation reflects that source is now included and GitHub is the chosen
  tracking location.
- A private GitHub repository exists at the requested account, contains the
  reviewed commit on `main`, and is configured as `origin`.

## Verification plan

1. Inspect the source diff and search for old text filenames and Greasy Fork
   update metadata.
2. Run syntax checks for both UserScripts.
3. Review `git status`, commit contents, remote configuration, and `gh repo
   view` after push.
4. No browser verification applies: this change does not alter a web
   application and KCU runtime testing is out of scope.

## Implementation outcome

Completed as designed on 2026-09-09: the two imported files were renamed,
Helper now uses one top-level `NTFY_ENDPOINT` constant with its prior value,
and its Greasy Fork update metadata was removed. The working tree passed
`node --check` for both scripts and Git's staged-diff whitespace check.
`krtokia/KCU_Lecture_Helper` was initially created as a private repository and
configured as HTTPS `origin`. It was later replaced by a clean public repository
after the personal endpoint was removed; see `public-userscript-release.md`.
The existing Greasy Fork listing and KCU/Tampermonkey runtime were not changed
or browser-tested.
