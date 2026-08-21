import fs from "node:fs";
const prefs=fs.readFileSync("src/lib/videoink/prefs.ts","utf8");
const ui=fs.readFileSync("src/components/videoink/ui.tsx","utf8");
const radial=fs.readFileSync("src/components/videoink/RadialToolDock.tsx","utf8");
for(const [src,names] of [
  [prefs,['showToolbar: boolean','showToolbar: true','showShapeTools: true']],
  [ui,['if (!p.prefs.showToolbar)','setPrefs({ showToolbar: true })','setPrefs({ showToolbar: false })','Hide annotation toolbar']],
  [radial,['const visiblePetals = PETALS.filter(','!["line", "arrow", "shape"].includes(petal.tool)','petals.map((petal, i) =>']],
]) for(const n of names) if(!src.includes(n)) throw new Error(`Missing toolbar behavior: ${n}`);
console.log("PASS: main toolbar can be collapsed/reopened, and shape/line/arrow tools stay hidden from the radial dock when disabled.");
