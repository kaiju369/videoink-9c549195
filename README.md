# Lecture Canvas Pro

PROJECT:



I am working on an existing Lovable application:



https://yt-lecture.lovable.app/



GitHub source repository:



https://github.com/kaiju369/yt-lecture.git



The existing application is a VideoInk-style lecture annotation application: a user loads a YouTube/video lecture, freezes a frame, draws handwritten notes/shapes/text over the video, saves annotated pages, manages them in a local library, and exports them.



IMPORTANT:



DO NOT rebuild the application from scratch.



DO NOT remove existing functionality.



DO NOT replace the existing normal toolbar.



DO NOT simplify the current drawing engine.



Work from the existing codebase and preserve the current architecture wherever practical, while refactoring weak parts where necessary.



First inspect the entire repository and understand the existing implementation before changing anything.



The goal is to make the existing application production-quality, reliable, responsive, high-quality, and logically correct.



==================================================

PHASE 1 — FULL CODEBASE AUDIT

==================================================



Perform a complete audit of the entire repository.



Inspect:



- React components

- hooks

- drawing engine

- object model

- shape recognition

- pointer/stylus handling

- pressure handling

- smoothing

- undo/redo

- selection

- resizing

- erasing

- lasso

- video player

- YouTube integration

- local video integration

- screen capture

- snapshot generation

- rendering

- thumbnails

- IndexedDB

- recovery

- export

- PDF generation

- ZIP generation

- JSON export

- keyboard shortcuts

- responsive layout

- mobile/touch behavior

- accessibility

- memory management

- URL handling

- file handling

- security

- error handling

- performance



Do not merely identify problems.



Fix the problems.



Preserve working behavior unless it is objectively incorrect.



==================================================

PHASE 2 — CRITICAL LOGIC FIXES

==================================================



Fix all incorrect or fragile logic.



Especially inspect:



1. Video/frame coordinate mapping

2. YouTube iframe geometry

3. Screen capture cropping

4. DevicePixelRatio

5. browser zoom

6. multi-monitor capture

7. fullscreen capture

8. video aspect ratio

9. object normalization

10. save/reload behavior

11. page ordering

12. duplicate page behavior

13. undo/redo transactions

14. recovery

15. export cancellation

16. IndexedDB failures

17. stale state

18. async race conditions

19. object URL cleanup

20. memory leaks



Do not silently swallow errors when doing so can cause data loss.



Never clear/reset the user's editor state until persistence has succeeded.



If saving fails, keep the user's current work intact and show a clear error.



==================================================

PHASE 3 — NORMAL TOOLBAR

==================================================



KEEP THE EXISTING NORMAL TOOLBAR.



Do not remove or replace it.



All existing tools should remain available.



Improve its behavior and consistency where necessary.



==================================================

PHASE 4 — FLOATING RADIAL TOOLSET

==================================================



Add a SECOND tool interface:



FLOATING TOOLSET.



The existing toolbar remains unchanged.



The floating toolset should consist of:



- a small draggable floating button

- clicking/tapping the button expands a radial/circular tool menu

- smooth animation

- smooth open/close transition

- no layout jumping

- 60 FPS target

- touch friendly

- stylus friendly

- mouse friendly

- keyboard accessible



The floating button must be draggable anywhere inside the viewport.



Prevent it from being dragged outside the viewport.



Use transform-based movement for smoothness.



Do not use expensive React state updates on every pointer movement if they can be avoided.



Persist:



- floating button position

- open/closed state

- selected tool

- selected color



in local preferences.



The radial menu should intelligently reposition itself if it is near a screen edge.



==================================================

PHASE 5 — COLOR SYSTEM

==================================================



Add a dedicated color control.



One color button should open a color palette.



Include:



- black

- white

- red

- orange

- yellow

- green

- cyan

- blue

- purple

- pink



Also include:



- recent colors

- custom color picker

- HEX

- RGB/HSL where practical



The color system must work consistently for:



- pen

- highlighter

- shapes

- text



Do not make the UI cluttered.



==================================================

PHASE 6 — ERASER SYSTEM

==================================================



Create a professional eraser system with clearly separated modes.



Required modes:



1. Stroke Eraser



Touch a stroke and remove the entire logical stroke/object.



2. Pixel/Partial Eraser



Erase only the portion of a stroke touched by the eraser.



The stroke must be split into surviving segments rather than simply deleting the entire object.



3. Lasso Eraser



Draw an arbitrary closed polygon.



Everything inside/intersecting the lasso should be erased according to the selected eraser behavior.



4. Rectangle Eraser



Preserve and improve the existing rectangular eraser.



5. Circle Eraser



Preserve and improve the existing circular eraser.



6. Lasso Select



Keep lasso selection separate from lasso erasing.



Do NOT overload the same tool with ambiguous behavior.



The eraser size must be adjustable.



Show a live eraser cursor/indicator.



All erasing operations must integrate correctly with undo/redo.



==================================================

PHASE 7 — SHAPE RECOGNITION

==================================================



The current shape recognition system is heuristic and needs to become substantially more reliable.



Do not merely adjust one or two thresholds.



Build a robust multi-stage recognizer.



Pipeline:



raw pointer samples

→ resampling

→ noise filtering

→ normalization

→ smoothing

→ candidate generation

→ geometric fitting

→ confidence scoring

→ best candidate

→ conservative conversion



Support at minimum:



- line

- arrow

- rectangle

- square

- circle

- ellipse

- triangle

- right triangle

- diamond

- polygon



Improve recognition for:



- rotated shapes

- imperfect shapes

- fast drawing

- slow drawing

- low sample counts

- noisy stylus input

- different aspect ratios

- incomplete closure

- slightly overlapping endpoints



Use modern, well-maintained geometry/recognition libraries where they provide real benefit.



Do not add a library just for the sake of adding one.



Use robust geometric fitting algorithms.



Most important rule:



IF CONFIDENCE IS LOW:



keep the original user stroke.



Never replace handwriting with a bad guessed shape.



Show optional recognition feedback.



==================================================

PHASE 8 — PROFESSIONAL PEN ENGINE

==================================================



Improve the stroke engine substantially.



Preserve the current perfect-freehand foundation where appropriate.



Support multiple pen profiles:



- Ballpoint

- Pencil

- Marker

- Fountain pen

- Brush

- Highlighter

- Technical pen



Each profile may have different:



- width

- opacity

- pressure response

- thinning

- smoothing

- streamline

- taper

- velocity response

- cap style

- join style



Support real stylus pressure when available.



For mouse/touch input use a sensible simulated pressure fallback.



Implement configurable pressure curves.



The stroke should feel natural at:



- slow speed

- medium speed

- high speed



Use PointerEvent coalesced samples where supported.



Avoid jitter.



Avoid delayed rendering.



Avoid sudden width changes when the pen is lifted.



The live stroke preview and committed stroke must use the same rendering pipeline.



==================================================

PHASE 9 — PERFORMANCE

==================================================



Target smooth 60 FPS interaction.



Especially optimize:



- drawing

- moving

- resizing

- lasso

- erasing

- floating tool dragging

- radial menu animation



During object movement/resizing:



use transient visual transforms.



Do not generate unnecessary undo history entries on every pointer movement.



Commit one logical undo operation on pointer-up.



Use requestAnimationFrame appropriately.



Avoid unnecessary React rerenders.



Use refs/local transient state for high-frequency pointer operations where appropriate.



==================================================

PHASE 10 — VIDEO PLAYER

==================================================



Preserve the existing YouTube/video functionality.



Improve the custom player controls.



Provide, where supported by the underlying player/API:



- play/pause

- seek

- timeline

- current time

- duration

- volume

- mute

- playback speed

- fullscreen

- captions/subtitles where supported

- quality controls where actually supported

- picture-in-picture where supported

- keyboard controls

- responsive sizing



Do not claim to support a YouTube feature if the YouTube API does not permit reliable control.



The custom controls must behave consistently for:



- YouTube

- local video

- direct video URL



Handle source switching cleanly.



Revoke old object URLs when replacing local files.



Prevent stale player state after changing videos.



==================================================

PHASE 11 — FRAME SAVING

==================================================



THIS IS CRITICAL.



When the user saves a lecture slide/page:



DO NOT save a screenshot of the entire application.



DO NOT include:



- YouTube controls

- pause button

- seek bar

- browser UI

- floating toolbar

- normal toolbar

- side panels

- unrelated UI



The saved page must contain ONLY:



VIDEO FRAME

+

USER ANNOTATIONS



Nothing else.



The canonical saved page should consist of:



1. clean video frame

2. vector/object annotations



where technically possible.



Do not bake UI into the saved page.



Separate:



FRAME DATA



from:



ANNOTATION DATA.



The renderer should combine them only during display/export.



==================================================

PHASE 12 — YOUTUBE FRAME CAPTURE

==================================================



YouTube iframe video cannot be treated like a normal HTML5 video element.



Implement a reliable frame acquisition strategy.



Preferred:



1. User-authorized display capture.

2. Crop precisely to the actual video-content rectangle.

3. Remove all player controls/UI.

4. Account correctly for:

   - devicePixelRatio

   - browser zoom

   - display scaling

   - fullscreen

   - multi-monitor layouts

   - capture surface dimensions



Never silently substitute a YouTube thumbnail for the actual current frame.



If the actual frame cannot be captured:



clearly mark the snapshot as unavailable/reference-only.



Do not falsely present a thumbnail as the exact frame.



==================================================

PHASE 13 — SCREEN CAPTURE

==================================================



Improve the existing screen capture system.



The capture should:



- capture only the actual video content

- correctly map DOM coordinates to captured-display coordinates

- account for DPI scaling

- account for display scaling

- account for browser zoom

- work as reliably as browser APIs allow

- detect when capture has ended

- clean up tracks

- avoid memory leaks



Do not capture the toolbar or other UI.



==================================================

PHASE 14 — EXPORT QUALITY

==================================================



The current export pipeline is too restrictive.



Do NOT hard-limit saved snapshots to 960px.



Separate:



PREVIEW RESOLUTION



from:



SAVED FRAME RESOLUTION



and:



EXPORT RESOLUTION.



For saved frames, preserve the highest reliable source/capture resolution.



Provide export resolution controls:



- Native/source

- 720p

- 1080p

- 1440p

- 2160p

- Custom



Do not upscale unless explicitly requested.



Preserve aspect ratio.



Avoid unnecessary JPEG recompression.



For PNG:



use PNG.



For JPEG:



allow quality selection.



For PDF:



do not unnecessarily convert a high-quality source to a low-quality JPEG first.



Use the best practical image pipeline.



==================================================

PHASE 15 — CLEAN EXPORT

==================================================



Exports must contain ONLY the page content.



No:



- pause button

- YouTube controls

- toolbar

- browser UI

- floating toolset

- application chrome



Metadata overlays must be optional.



Default:



NO metadata burned into the image.



If metadata is enabled, allow:



- title

- timestamp

- page number



as optional export settings.



==================================================

PHASE 16 — PAGE SYSTEM

==================================================



Preserve the existing page library.



Fix:



- ordering

- duplicate behavior

- deletion

- selection

- manual ordering

- timestamp handling

- page reopening

- source association



Opening a saved page should restore:



- annotations

- frame

- video source

- timestamp

- aspect ratio



where available.



==================================================

PHASE 17 — LOCAL STORAGE / RECOVERY

==================================================



Keep local-first behavior.



Improve IndexedDB handling.



Add:



- schema migrations

- quota handling

- transaction failure handling

- corruption handling

- recovery validation

- graceful recovery after browser crash



Never lose annotation data because a save operation failed.



Recovery should preserve the user's work until the user explicitly saves or discards it.



==================================================

PHASE 18 — UNDO / REDO

==================================================



Every logical user action should be one undoable operation.



Examples:



Draw stroke

→ one undo.



Erase stroke

→ one undo.



Partial erase

→ one undo.



Move 10 objects together

→ one undo.



Resize object

→ one undo.



Lasso erase

→ one undo.



Shape recognition conversion

→ one undo.



Do not create dozens/hundreds of undo entries during dragging.



==================================================

PHASE 19 — RESPONSIVE DESIGN

==================================================



Make the entire application responsive.



Desktop:



- full toolbar

- side library

- full player



Tablet:



- compact toolbar

- floating tools

- adaptive library



Mobile:



- touch-friendly controls

- radial floating toolbar

- responsive player

- no clipped controls

- no horizontal overflow



The floating tool button must remain accessible in all orientations.



==================================================

PHASE 20 — ACCESSIBILITY

==================================================



Add:



- keyboard navigation

- ARIA labels

- focus states

- tooltips

- sufficient hit targets

- accessible color picker

- keyboard access to floating toolset

- reduced-motion support



Do not make animations unusable for reduced-motion users.



==================================================

PHASE 21 — SECURITY / ROBUSTNESS

==================================================



Audit all user-controlled input.



Validate video URLs.



Reject dangerous URL schemes.



Validate uploaded file types.



Add sensible file-size limits.



Prevent malformed data from crashing the editor.



Do not expose secrets in client code.



Audit:



- localStorage

- IndexedDB

- URL parsing

- imported JSON

- file uploads

- external images

- YouTube URLs



Sanitize imported data before rendering.



Do not execute arbitrary imported content.



==================================================

PHASE 22 — ERROR HANDLING

==================================================



Replace silent failures with meaningful errors where appropriate.



Examples:



- video failed to load

- unsupported browser feature

- capture denied

- capture ended

- storage unavailable

- export failed

- invalid file

- invalid URL

- corrupted page

- insufficient memory

- unsupported format



Errors should not destroy existing user work.



==================================================

PHASE 23 — CODE QUALITY

==================================================



Refactor oversized components where appropriate.



In particular, inspect the main workstation component and separate concerns into reusable hooks/components where this improves maintainability.



Potential architecture:



Workstation

├── VideoWorkspace

├── AnnotationCanvas

├── NormalToolbar

├── FloatingToolDock

├── RadialToolMenu

├── VideoControls

├── PageLibrary

├── ExportController

└── Settings



Hooks:



useVideoPlayer

useAnnotationSession

useFloatingToolDock

useCapture

useExport

usePageLibrary

useRecovery



Do not refactor purely for aesthetics.



Only refactor when it reduces complexity or prevents bugs.



==================================================

PHASE 24 — TESTING

==================================================



After implementation, test all major workflows.



Test:



1. Open YouTube video

2. Play/pause

3. Seek

4. Change speed

5. Change volume

6. Annotate

7. Draw slowly

8. Draw quickly

9. Stylus pressure

10. Mouse drawing

11. Touch drawing

12. Shape recognition

13. Shape rejection

14. Stroke erasing

15. Partial erasing

16. Rectangle erasing

17. Circle erasing

18. Lasso selection

19. Lasso erasing

20. Move

21. Resize

22. Undo

23. Redo

24. Save page

25. Reopen page

26. Duplicate page

27. Delete page

28. Reorder page

29. Crash/recovery

30. Screen capture

31. Export PNG

32. Export JPEG

33. Export PDF

34. Export ZIP

35. Export JSON

36. High-resolution export

37. Responsive desktop

38. Responsive tablet

39. Responsive mobile

40. Floating toolbar dragging

41. Radial toolbar animation

42. Color picker

43. Keyboard shortcuts

44. Browser refresh

45. Multiple videos

46. Local video file

47. Video URL

48. Large annotation documents



==================================================

PHASE 25 — DO NOT REGRESS

==================================================



Do not remove:



- existing normal toolbar

- existing page library

- existing annotation types

- existing keyboard shortcuts

- existing local persistence

- existing recovery

- existing export formats

- existing video loading

- existing selection

- existing shape tools



Improve them instead.



==================================================

FINAL REQUIREMENT

==================================================



Before considering the task complete:



Run the project build.



Run lint/type checking.



Fix all resulting errors.



Then perform a final code audit for:



- broken logic

- race conditions

- memory leaks

- stale state

- bad coordinate transforms

- export quality problems

- accidental UI capture

- incorrect shape recognition

- eraser bugs

- undo/redo bugs

- responsive layout problems

- security vulnerabilities

- data-loss scenarios



Do not merely tell me what should be fixed.



Actually implement the fixes.



The result should feel like a polished professional lecture annotation application rather than a prototype.



Prioritize correctness, drawing quality, frame fidelity, export quality, responsiveness, and data safety over adding unnecessary visual effects.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://videoink.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/00451761-dd8f-49f5-a794-8568641ba607).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
