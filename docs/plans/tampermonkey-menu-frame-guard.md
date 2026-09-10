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
The Helper passed `node --check`; commits `560913b` and `6322ce1` were pushed,
the latter raising Helper to `1.0.2` so existing installations can identify the
fix. GitHub's Contents API confirmed the public `main` source has the version
and guard.

## Follow-up: ntfy state visibility (2026-09-10)

### Objective

Make the Tampermonkey ntfy controls unambiguous: a user must be able to see
whether ntfy delivery is enabled and whether an endpoint is saved, without
exposing the private endpoint in a menu label or console output.

### Current-state findings

- `registerNtfyMenu()` registers a toggle label once, based on the initial
  `CONFIG.ntfy.enabled` value.
- `toggleNtfyEnabled()` correctly flips and persists that value, but existing
  Tampermonkey menu labels cannot be updated in place. Therefore the prior
  label remains visible until the menu is closed and opened again.
- The endpoint command has no status indication. Showing its full value in a
  command label would unnecessarily disclose a topic/token-like private value.

### Scope and non-goals

In scope: add a read-only status command, have the toggle display the state it
will produce, and display a short confirmation after endpoint/toggle changes.
Status reports only enabled/disabled and endpoint configured/not configured.

Out of scope: modifying ntfy delivery rules, endpoint validation/storage keys,
playback behavior, Navigator, or deployment destinations.

### Assumptions and constraints

- Tampermonkey recreates command menus when opened; it does not offer a safe
  in-place label update for an already registered command in this script.
- Endpoint values are private and must not be printed in source, menu labels,
  console output, documents, or test fixtures.

### Proposed design

Add `ntfyStatusText()` to derive a privacy-safe summary from current in-memory
settings. Register it as a read-only menu command that alerts the user. Change
the toggle wording to `현재 꺼짐 (클릭하면 켜짐)` or `현재 켜짐 (클릭하면 꺼짐)`.
After a state-changing action, show the same summary in an alert; when the
user later reopens the menu, the registered label is regenerated from storage.

### Affected components

- `src/kcu-lecture-helper.user.js`: ntfy settings/menu helpers only.
- This plan and `docs/HANDOFF.md`: implementation result and verification
  record.

### Acceptance criteria

- The toggle command visibly distinguishes current enabled and disabled state.
- Clicking the toggle immediately confirms its new state.
- A separate command shows whether an endpoint is configured, never its value.
- Existing endpoint normalization, GM storage, notification delivery gates,
  top-level-only menu registration, and playback code remain unchanged.

### Verification plan

- Static: `node --check` on both scripts, focused source assertions, and
  `git diff --check`.
- Browser: in Orca's embedded browser, verify the changed user flow if a
  Tampermonkey-enabled KCU session is available. Otherwise record that it
  requires the user's installed extension/session and give the minimal manual
  check.

### Implementation outcome

The Helper was raised to `1.0.3`. Its top-level Tampermonkey menu now contains
`ntfy 상태 확인`; its toggle shows both the current state and the result of a
click. Toggling and saving/clearing an endpoint show an immediate alert with
enabled/disabled and configured/not configured status only. The endpoint value
is not displayed.

`node --check` passed for both scripts, `git diff --check` passed, and a
Node-based GM API mock verified the initial off label, persisted on label,
immediate toggle confirmation, configured-endpoint summary, and absence of the
test endpoint text from menu labels. Orca's embedded browser had no open tab or
Tampermonkey/KCU login session, so extension UI verification remains pending.
