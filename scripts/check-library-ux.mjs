import fs from "node:fs";
const src=fs.readFileSync("src/components/videoink/ui.tsx","utf8");
for(const n of [
  'all: "All"',
  'current: "This video"',
  'annotations: "Video frames"',
  'blank: "Blank notes"',
  'Clear filters',
  'No pages match the current search/filter.',
  '{items.length} shown',
]) if(!src.includes(n)) throw new Error(`Missing library UX improvement: ${n}`);
console.log("PASS: library filters have clear labels, result count, reset action, and contextual empty state.");
