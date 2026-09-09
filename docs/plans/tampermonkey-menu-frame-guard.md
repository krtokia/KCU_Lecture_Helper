# Helper menu frame guard

## Objective

Ensure ntfy configuration prompts are registered only once from the top-level
KCU page while keeping Helper media detection active in matching iframes.

## Current-state findings

- Helper matches the KCU site broadly and therefore runs in top-level pages and
  matching frames.
- Its ntfy menu commands are currently registered in every execution context.
- Selecting identically named frame menus can trigger repeated address prompts.

## Scope and non-goals

In scope: guard only menu registration to the top-level window, document the
fix, syntax-check, commit, push, and verify the public Raw source.

Out of scope: disabling iframe execution, changing ntfy storage, changing
playback behavior, or changing Navigator.

## Proposed design

Wrap `registerNtfyMenu()` in a `window.top === window.self` check. Loading
stored ntfy configuration remains unchanged in all frames, so notification and
media behavior are preserved.

## Acceptance criteria

- One top-level Helper menu registration is made per page.
- Matching iframe executions retain their existing Helper behavior.
- Helper syntax and public Raw response are verified after push.

## Implementation outcome

On 2026-09-09, menu registration was guarded with
`window.top === window.self`; loading stored settings remains in every frame.
The Helper passed `node --check`, commit `560913b` was pushed, and its public
Raw source was checked for the guard.
