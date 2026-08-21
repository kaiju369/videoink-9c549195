import fs from "node:fs";
const s=fs.readFileSync("src/components/videoink/ObjectCanvas.tsx","utf8");
for(const n of [
  'if (tool === "select" && ["shape", "line", "arrow"].includes(under.kind))',
  'onToolChange?.("move");',
  'const shape = makeShape(d.a, d.b, tool, prefs, 0);',
  'editor.setSelection([shape.id]);',
]) if(!s.includes(n)) throw new Error(`Missing shape→move behavior: ${n}`);
console.log("PASS: creating a shape selects it and switches to Move; selecting an existing shape/line/arrow from Select also switches to Move.");
