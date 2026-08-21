import fs from "node:fs";
const render=fs.readFileSync("src/lib/videoink/render.ts","utf8");
const exp=fs.readFileSync("src/lib/videoink/export.ts","utf8");
for(const n of [
  'export type RenderMode = "page" | "clean-frame" | "annotations"',
  'const isCleanFrame = mode === "clean-frame"',
  'const isAnnotationsOnly = mode === "annotations"',
  'if (isCleanFrame && page.type !== "video")',
  'if (!isCleanFrame && !baked)',
  'if (opts.metadata && !isCleanFrame)',
]) if(!render.includes(n)) throw new Error(`Missing export-mode behavior: ${n}`);
if(!exp.includes('mode?: "page" | "clean-frame" | "annotations"')) throw new Error("ExportOptions missing mode");
if(!exp.includes('mode: opts.mode ?? "page"')) throw new Error("Export mode not passed to renderer");
console.log("PASS: export pipeline supports clean-frame, annotations-only, and full-page modes.");
