import fs from "node:fs";
const oc = fs.readFileSync("src/components/videoink/ObjectCanvas.tsx","utf8");
const types = fs.readFileSync("src/lib/videoink/types.ts","utf8");
for (const n of [
  "effectiveStrokeSmoothing(tool, prefs) * 0.8 + profile.streamline * 0.2",
  "pressureExponent: profile.pressureExponent",
  "velocityResponse: profile.velocityResponse",
  "startTaper: profile.startTaper",
  "endTaper: profile.endTaper",
]) if (!oc.includes(n)) throw new Error(`Missing profile feel integration: ${n}`);
for (const n of ["pressureExponent?: number;","velocityResponse?: number;","startTaper?: number;","endTaper?: number;"])
  if (!types.includes(n)) throw new Error(`Missing Stroke field: ${n}`);
console.log("PASS: stroke profile smoothing, streamline, pressure, velocity and taper metadata are wired.");
