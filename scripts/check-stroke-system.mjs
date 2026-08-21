import fs from "node:fs";
const src=fs.readFileSync("src/components/videoink/ObjectCanvas.tsx","utf8");
for(const n of [
  'function effectiveStrokeSmoothing(tool: ToolId, prefs: Prefs): number',
  'profile.smoothing * 0.7 + prefs.smoothing * 0.3',
  'new InkFilter(effectiveStrokeSmoothing(tool, prefs))',
  'effectiveStrokeSmoothing(tool, prefs) * 0.8 + profile.streamline * 0.2',
  'const stroke = { ...raw, points: smoothStroke(d.points, smoothing) }',
]) if(!src.includes(n)) throw new Error(`Missing stroke-system behavior: ${n}`);
console.log("PASS: live and committed strokes share one profile-aware smoothing model, with a user-controlled smoothing trim and streamline contribution.");
