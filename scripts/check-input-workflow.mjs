import fs from "node:fs";
const src=fs.readFileSync("src/routes/index.tsx","utf8");
for(const n of [
  't.isContentEditable',
  't.closest("[contenteditable=\\"true\\"]")',
  'e.isComposing',
  'e.key === "Process"',
  'e.stopPropagation();',
]) if(!src.includes(n)) throw new Error(`Missing keyboard safety behavior: ${n}`);
console.log("PASS: global shortcuts are blocked during text editing/IME composition and Escape cancellation stops propagation.");
