# GitHub Raw automatic updates

## Objective

Enable Tampermonkey automatic updates for both public UserScripts from the
repository's GitHub Raw `main` URLs.

## Current-state findings (before implementation)

- The repository is public at `krtokia/KCU_Lecture_Helper`.
- Both UserScripts have version metadata but no `@updateURL` or
  `@downloadURL` metadata.
- The source paths are stable under `src/` and can be served directly as Raw
  UserScript files.

## Scope and non-goals

In scope: add GitHub Raw update/download metadata, bump each script patch
version, document the update policy, validate source syntax and Raw access,
then commit and push.

Out of scope: changing script runtime behavior, changing ntfy settings,
modifying the Greasy Fork listing, or browser-based Tampermonkey installation.

## Assumptions and constraints

- `main` holds only reviewed release-ready changes.
- Both update metadata fields intentionally point to the full Raw UserScript;
  no separate metadata artifact is needed for this small project.
- Future functional changes must bump `@version` before they are pushed.

## Proposed design

1. Add the exact GitHub Raw source URL as both metadata URLs for each script.
2. Increment Helper from `1.0.0` to `1.0.1` and Navigator from `0.3.1` to
   `0.3.2`.
3. Add a concise release note explaining first install and future updates.
4. Validate headers, syntax, public Raw responses, commit, and push.

## Affected components

- `src/kcu-lecture-helper.user.js`
- `src/kcu-auto-navigator.user.js`
- `docs/RELEASE.md`

## Acceptance criteria

- Each script has matching GitHub Raw `@updateURL` and `@downloadURL` fields.
- Both scripts have a higher patch version and pass syntax checks.
- The public Raw URLs return the installed source after push.
- Documentation states that an initial manual install is required and future
  higher-version pushes are eligible for Tampermonkey update checks.

## Verification plan

1. Check the metadata headers and syntax locally.
2. After push, fetch both Raw URLs and confirm their version metadata.
3. Browser verification is deferred until the user installs the Helper in
   Tampermonkey.

## Implementation record (2026-09-09)

- Added matching Raw `@updateURL` and `@downloadURL` fields for both scripts.
- Bumped Helper to `1.0.1`; bumped Navigator metadata and runtime `VERSION` to
  `0.3.2`.
- `node --check` passed for both scripts, as did a static header check for the
  versions, matching URLs, and Navigator runtime version. No commit, push,
  Raw-response fetch, or Tampermonkey browser test was performed.
