# ChatGPT Audit Fixes

This branch contains targeted fixes from the code audit. The `main` branch is intentionally unchanged.

## Priority fixes
- Keep canonical snapshots free of annotation overlays during screen capture.
- Preserve all partial-eraser survivors across repeated erase passes.
- Clarify document schema version versus IndexedDB database version.
- Persist radial-dock position from the authoritative drag value.
- Avoid React state updates for every radial-dock pointer movement.
- Correct YouTube Picture-in-Picture capability reporting.
- Correct snapshot capture-method metadata.
- Strengthen IndexedDB/page-object validation.
