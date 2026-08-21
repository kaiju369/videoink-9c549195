import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/components/videoink/ObjectCanvas.tsx");
const src = fs.readFileSync(file, "utf8");

const required = [
  'profile: highlighter ? "highlighter" : prefs.penProfile',
  "prefs.penProfile",
];

for (const needle of required) {
  if (!src.includes(needle)) {
    throw new Error(`Missing stroke profile persistence: ${needle}`);
  }
}

console.log("PASS: makeStroke persists the selected pen profile.");
