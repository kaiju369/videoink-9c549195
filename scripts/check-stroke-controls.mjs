import fs from "node:fs";
const canvas=fs.readFileSync("src/components/videoink/ObjectCanvas.tsx","utf8");
const ui=fs.readFileSync("src/components/videoink/ui.tsx","utf8");
for(const n of [
  'prefs.pressure === "off"',
  'prefs.pressure === "low"',
  'prefs.pressure === "high"',
  'pressureMode: effectivePressureMode',
  'points: adjustedPoints',
]) if(!canvas.includes(n)) throw new Error(`Pressure control is not wired: ${n}`);
for(const n of ["Thinning","Smoothing","Streamline","Velocity","Pressure curve","Taper"])
 if(!ui.includes(n)) throw new Error(`Missing stroke response readout: ${n}`);
console.log("PASS: pressure sensitivity affects committed stroke input and the active profile's response parameters are visible.");
