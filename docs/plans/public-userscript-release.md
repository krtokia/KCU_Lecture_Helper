# Public UserScript release

## Objective

Make the Helper safe for public release by removing the personal ntfy endpoint
from source and Git history, storing an endpoint only in Tampermonkey's local
storage, and replacing the current private GitHub repository with a new public
repository of the same name and clean history.

## Current-state findings

- Private `krtokia/KCU_Lecture_Helper` contains the prior endpoint in commit
  history and must not be made public.
- Helper currently has the Tampermonkey notification/network grants but lacks
  the storage and menu-command grants required for local configuration.
- Navigator already uses Tampermonkey storage/menu APIs, but it is unrelated
  to the Helper endpoint setting.

## Scope and non-goals

In scope: a Helper ntfy settings menu backed by `GM_getValue`/`GM_setValue`,
empty and disabled defaults, removal of the personal value from source and
docs, static validation, clean Git history, deletion of the old private remote,
and creation/push of a public replacement remote.

Out of scope: modifying the existing Greasy Fork listing; adding GitHub Raw
auto-update metadata; changing playback or Navigator behavior; KCU runtime
testing; adding GitHub Raw auto-update metadata; changing playback or Navigator
behavior; or modifying the existing Greasy Fork listing.

## Assumptions and constraints

- The existing `@connect ntfy.sh` entry remains unchanged; only `https://ntfy.sh`
  endpoints are accepted and no network permission is widened.
- Users configure their own endpoint and enabled state through the Helper menu.
- No personal endpoint may appear in the public worktree, commit history, or
  GitHub repository.

## Proposed design

1. Add `GM_getValue`, `GM_setValue`, and `GM_registerMenuCommand` grants to
   Helper.
2. Start Helper with ntfy disabled and an empty endpoint. Read persisted values
   from Tampermonkey storage and expose menu commands to set/clear the endpoint
   and enable/disable ntfy.
3. Prevent ntfy requests unless it is enabled and the endpoint is a valid
   `https://ntfy.sh` URL.
4. Update documentation with the public-release model and local configuration
   workflow without recording any endpoint.
5. Preserve a local backup of old Git metadata outside the worktree, initialize
   a new repository, commit only sanitized files, delete the old private remote,
   then create and push a public replacement.

## Affected components

- `src/kcu-lecture-helper.user.js`
- `README.md`, `src/README.md`, `docs/RELEASE.md`, `docs/HANDOFF.md`,
  `docs/TEST_CHECKLIST.md`
- `.git` metadata and the `krtokia/KCU_Lecture_Helper` GitHub repository

## Acceptance criteria

- No personal ntfy endpoint or endpoint identifier is present in tracked files
  or the new public Git history.
- The Helper has explicit storage/menu grants and can persist an enabled flag
  and endpoint locally through Tampermonkey.
- ntfy is disabled by default and cannot send to a blank or invalid endpoint.
- Both scripts pass Node syntax checks.
- The replacement repository is public, named `krtokia/KCU_Lecture_Helper`,
  has a clean history containing no prior private commits, and receives `main`.

## Verification plan

1. Search the worktree and `git log -p` for the prior endpoint identifier.
2. Use static checks to confirm grants, default values, menu registration, and
   request guard behavior; run `node --check` for both scripts.
3. Review the new initial commit and GitHub visibility/history after push.
4. Browser verification is deferred: Tampermonkey/KCU interaction requires the
   user's authenticated browser and will be exercised during installation.

## Implementation record (2026-09-09)

The implementation uses two Helper-specific local-storage keys for the ntfy
endpoint and enabled state. The menu can set or clear the endpoint and toggle
the enabled state; an empty or invalid value is never sent.  The static checks
in this task cover syntax and source-level guards only, not Tampermonkey menu
persistence or authenticated KCU playback.
