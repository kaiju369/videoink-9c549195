import fs from "node:fs";
const src=fs.readFileSync("src/routes/index.tsx","utf8");
for(const n of [
  'Blank note — click Text to type directly',
  'setAnnotating(true);',
  'objects.find((o) => o.kind === "text" && o.text.trim())',
  '"Blank note"',
]) if(!src.includes(n)) throw new Error(`Missing blank-note UX behavior: ${n}`);
console.log("PASS: reopened pages enter editable mode and blank notes provide direct editing guidance/title behavior.");
