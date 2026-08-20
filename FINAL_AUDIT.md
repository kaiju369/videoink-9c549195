# VideoInk Final Rigorous Audit — `chatgpt-audit-fixes`

## Scope

Audit of the application architecture and current branch, with emphasis on video loading/capture, canonical frame data, annotation state, ink input/rendering, erasing, selection/movement, persistence, exports, UI state, and failure modes.

## Executive result

The product architecture is viable and the core model is correct: a clean snapshot should be stored separately from editable vector annotations. The branch fixes the most important partial-eraser survivor-loss issue and hardens screen-capture snapshot handling, but the branch is **not yet production-ready**.

### Release blockers

1. **Pen profile persistence is incomplete.** `Prefs` exposes multiple profiles and the renderer resolves `stroke.profile`, but the current `makeStroke()` path does not persist the selected profile. The UI can therefore report one pen while the stroke falls back to another profile.
2. **YouTube current-frame capture is not directly available through the embedded player abstraction.** YouTube thumbnail capture is correctly marked reference-only; it must never be presented as the current frame.
3. **Blank pages are not a complete note workflow.** They are created immediately, but edits are still tied to the active editor/Save workflow and the video surface remains part of the workstation. A blank note needs direct editing plus debounced persistence/recovery.
4. **Shape creation does not yet enforce the requested Draw → Select → Move workflow.** After creating a shape, the tool should switch to Move and select the new object.
5. **Tool-set visibility is not yet implemented as a persistent UI capability.** The rectangle/shape controls need a hide/show control independent of the current drawing state.

## High-severity findings

### H1 — Capture capability must be explicit

Direct HTML5 video can be drawn to canvas when the source is origin-clean/CORS-compatible. Cross-origin video without suitable CORS headers taints canvas. The implementation correctly attempts direct capture first and then falls back to authorized screen capture, but capability should be surfaced to the user rather than being implicit.

### H2 — Screen-capture geometry is inherently fragile

The crop mapping relies on display/window dimensions, DPR, visual viewport scale, and browser chrome offsets. Multi-monitor, OS scaling, browser zoom, window capture, and unusual display configurations can still produce an offset crop. Treat screen capture as a fallback, not the canonical capture path.

### H3 — IndexedDB validation is shallow

`sanitizePage()` validates the page envelope but does not deeply validate every Stroke, ShapeObject, TextObject, point, pressure, color, enum, bounds, or snapshot field. A malformed stored object can therefore survive page-level validation and fail later during rendering/hit-testing/export.

### H4 — Persistence verification is inconsistent

A safe round-trip writer exists (`putPageSafely`), but the main `savePage()` path uses `putPage()`. Critical user data should use the verified path or equivalent transaction/verification semantics before clearing editor/recovery state.

## Medium-severity findings

- No test script exists in `package.json`; core geometry, capture, eraser, persistence and export paths therefore lack automated regression coverage.
- No repository-level CI workflow was found during the audit pass, so build/lint/test status is not continuously enforced.
- YouTube `requestPictureInPicture()` is effectively a no-op because the PlayerHandle only has an HTMLVideoElement for non-YouTube sources. Capability should be exposed rather than silently doing nothing.
- `waitForFrame()` is best-effort and its double-rAF fallback does not guarantee that a just-seeked paused frame has decoded.
- `stepFrame()` on YouTube is a time nudge, not true frame stepping; it should be labeled accordingly.
- The current playback polling uses a 250 ms interval for current time; this is adequate for controls but not sufficient as a high-precision frame/timestamp clock.
- Direct URL playback depends on the remote host's playback/CORS policy. "Any live video link" should mean any browser-playable URL, not an unconditional guarantee for arbitrary hosts.
- Object URL cleanup for local files is present and should be retained.
- The app has a strong separation between renderer/geometry/recognition/erase/storage modules, which should be preserved.

## Ink audit

The ink engine has a strong foundation: coalesced pointer samples, smoothing, pressure curves, velocity response, per-profile rendering parameters, deterministic pencil grain, and `perfect-freehand` are already present.

The main correctness gap is the profile handoff from preferences to persisted Stroke data. The next ink pass should make every profile materially distinct while preserving one canonical stroke representation and identical preview/commit geometry.

Required regression matrix:

- mouse: slow, fast, short, long
- touch: tap, drag, accidental contact
- stylus: low/medium/high pressure, fast/slow, hover transitions
- pen, pencil, marker, fountain, brush, technical, highlighter
- undo/redo after strokes
- whole-object and partial erasing
- move/resize after stroke creation
- export and reload persistence
- DPR/zoom/fullscreen changes

## UX requirements captured during this audit

- Shape creation: Draw shape → automatically select it → switch to Move.
- Existing shape selection: selection remains directly draggable.
- Shape/rectangle tool set: hide/show toggle, preferably persistent.
- Blank note: immediate in-place editing, direct text/ink/shapes, debounced auto-save, recovery, no video pixels.
- Save Frame: canonical pixels only; no annotation, toolbar, browser chrome, desktop, or other windows.
- Frame timeline: saved frame linked to exact video timestamp/live capture state.
- Frame library: search, tags, timestamps, reorder, duplicate, compare.

## Product direction

The strongest product identity remains:

**Video → clean frame → editable annotation → organized lecture knowledge.**

AI should be layered on top of that core rather than replacing it.

## Current release assessment

**Architecture:** Good

**Core drawing foundation:** Good, but profile handoff needs correction

**Capture architecture:** Good separation, but provider/capability handling needs completion

**Persistence:** Good foundation, insufficient deep validation/testing

**Testing:** Insufficient for release

**Overall:** **Beta / active development, not production-ready**

## Audit conclusion

Do not merge this branch into `main` yet. Finish the release blockers, add automated regression tests, then run a clean build/lint/test pass and manually verify the capture matrix on Chromium desktop, Firefox, Safari, high-DPI displays, and at least one stylus-capable device.
