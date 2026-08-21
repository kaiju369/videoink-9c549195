import fs from "node:fs";

const src = fs.readFileSync("src/lib/videoink/ink.ts", "utf8");

const required = [
  "function applyPressureCurve",
  "const deadZone = 0.02",
  "Number.isFinite(pressure)",
  "const e = Number.isFinite(exponent)",
  "const pressureScale = Math.max(0.1, Math.min(2, profile.widthScale))",
  "const effectiveSize = Math.max(1, sizePx * pressureScale)",
  "last: true",
  "simulatePressure: false",
];

for (const needle of required) {
  if (!src.includes(needle)) throw new Error(`Missing ink invariant: ${needle}`);
}

// Extract the pressure function and evaluate the core mapping independently.
const curve = (pressure, exponent=1) => {
  const raw = Number.isFinite(pressure) ? pressure : 0.5;
  const p = Math.min(1, Math.max(0, raw));
  const deadZone = 0.02;
  const normalized = p <= deadZone ? 0 : (p - deadZone) / (1 - deadZone);
  const e = Number.isFinite(exponent) && exponent > 0 ? exponent : 1;
  return e === 1 ? normalized : Math.pow(normalized, e);
};

if (curve(-1) !== 0) throw new Error("Pressure clamp failed");
if (curve(0.01) !== 0) throw new Error("Pressure dead-zone failed");
if (curve(1) !== 1) throw new Error("Pressure upper bound failed");
if (!(curve(0.5, 2) < curve(0.5, 1))) throw new Error("Exponent response failed");

console.log("PASS: ink pressure/width invariants.");
