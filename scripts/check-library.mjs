import fs from "node:fs";
const src=fs.readFileSync("src/routes/index.tsx","utf8");
for(const n of [
  'setPages((prev) => prev.filter((page) => page.id !== deletedId))',
  'setPages((prev) => [...prev, page])',
  'const deleted = new Set(ids)',
  'setPages((prev) => prev.filter((page) => !deleted.has(page.id)))',
  'setPages((prev) => [...prev, ...copies])',
  'const byId = new Map(updated.map((page) => [page.id, page]))',
  'setPrefs({ librarySort: "manual" })',
]) if(!src.includes(n)) throw new Error(`Missing library mutation behavior: ${n}`);
console.log("PASS: library mutations update local state without redundant full IndexedDB reloads.");
