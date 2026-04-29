# Project Rules

## Trigger And Yarn Responsibilities

- `triggers.json` only detects conditions and selects a `yarnNode`.
- Do not put executable actions in `triggers.json`; no `actions` arrays or command payloads belong there.
- All buddy and page actions must be authored in Yarn nodes using Yarn commands, for example `<<PlayAnimation twirl loop=false>>`.
- `PlayAnimation` returns to the idle animation by default; only include `returnToIdle=false` when explicitly opting out.
- Content scripts may evaluate triggers and jump to Yarn nodes, but action behavior should come from commands emitted by the active Yarn node.
