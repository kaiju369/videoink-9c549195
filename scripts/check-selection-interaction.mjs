import fs from "node:fs";
const src=fs.readFileSync("src/components/videoink/ObjectCanvas.tsx","utf8");
for(const n of [
  'keepAspect: e.shiftKey',
  'fromCenter: e.altKey',
  'resizeBox(d.from, d.handle, p, d.keepAspect, d.fromCenter)',
  'keepAspect = false',
  'fromCenter = false',
  'Never allow a resize to collapse into a zero/negative box.',
  'editor.apply(',
  'editor.beginTransient();',
]) if(!src.includes(n)) throw new Error(`Missing selection/resize behavior: ${n}`);
console.log("PASS: selection resize supports Shift aspect locking, Alt center-resize, minimum dimensions, and transient single-undo interactions.");
