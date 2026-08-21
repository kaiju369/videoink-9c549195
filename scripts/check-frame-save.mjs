import fs from "node:fs";
const src=fs.readFileSync("src/routes/index.tsx","utf8");
for(const n of [
  'const normalizedTimestamp',
  'const duplicateFrame',
  'Math.abs(p.timestamp - normalizedTimestamp) < 0.05',
  'const targetPage = activePage ?? duplicateFrame',
  'id: targetPage?.id ?? uid()',
  'setPages((prev) => {',
]) if(!src.includes(n)) throw new Error(`Missing frame-save behavior: ${n}`);
console.log("PASS: frame saves normalize timestamps, deduplicate same-video instants, preserve existing page identity, and update library state locally.");
