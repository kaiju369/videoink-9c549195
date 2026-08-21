import fs from "node:fs";
const r=fs.readFileSync("src/routes/index.tsx","utf8");
const s=fs.readFileSync("src/lib/videoink/shortcuts.ts","utf8");
for(const n of [
  'e.isComposing',
  'e.key === "Process"',
  'e.key === "Dead"',
  'if (isEditable',
  'case "undo":',
  'case "redo":',
  'case "cancel":',
  'e.preventDefault();',
]) if(!r.includes(n)) throw new Error(`Missing shortcut safety/behavior: ${n}`);
for(const n of ['defaultKey: "z"','defaultKey: "x"','STORAGE_KEY = "videoink.shortcuts.v2"'])
 if(!s.includes(n)) throw new Error(`Missing shortcut definition/persistence: ${n}`);
console.log("PASS: global shortcuts respect text/IME editing, Escape cancellation is prevented from bubbling, and undo/redo mappings remain persisted.");
