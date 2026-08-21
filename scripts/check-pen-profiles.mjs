import fs from "node:fs";
const src = fs.readFileSync("src/components/videoink/ObjectCanvas.tsx", "utf8");
for (const needle of [
  "PEN_PROFILES, pressureThinning",
  "const profile = highlighter ? PEN_PROFILES.highlighter : PEN_PROFILES[prefs.penProfile]",
  "opacity: highlighter ? prefs.highlighterOpacity : profile.opacity",
  "thinning: highlighter ? 0 : profile.thinning",
  "smoothing: profile.smoothing",
  'profile: highlighter ? "highlighter" : prefs.penProfile',
]) {
  if (!src.includes(needle)) throw new Error(`Missing profile integration: ${needle}`);
}
console.log("PASS: all pen strokes consume persisted profile properties.");
