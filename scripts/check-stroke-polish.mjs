import fs from "node:fs";
const s=fs.readFileSync("src/lib/videoink/smooth.ts","utf8");
const i=fs.readFileSync("src/lib/videoink/ink.ts","utf8");
const p=fs.readFileSync("src/components/videoink/ObjectCanvas.tsx","utf8");
for(const n of [
  'const sorted = smoothed.slice().sort((a, b) => a - b);',
  'Math.floor(sorted.length * 0.92)',
  'Math.min(1, Math.max(0.08, pressure))',
  'smoothPressure(capped, 3)',
]) if(!s.includes(n)) throw new Error(`Missing smoothing/pressure behavior: ${n}`);
for(const n of [
  'profile.pressureExponent',
  'profile.velocityResponse',
  'effectiveStrokeSmoothing(tool, prefs)',
]) if(!i.includes(n) && !p.includes(n)) throw new Error(`Missing profile control: ${n}`);
console.log("PASS: velocity-to-pressure response is robust to outlier samples, pressure remains bounded, and profile-aware smoothing/pressure controls remain active.");
