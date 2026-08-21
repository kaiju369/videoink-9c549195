import fs from "node:fs";
const files = {
  editor: fs.readFileSync("src/components/videoink/useEditor.ts","utf8"),
  canvas: fs.readFileSync("src/components/videoink/ObjectCanvas.tsx","utf8"),
  player: fs.readFileSync("src/components/videoink/Player.tsx","utf8"),
  export: fs.readFileSync("src/lib/videoink/export.ts","utf8"),
  prefs: fs.readFileSync("src/lib/videoink/prefs.ts","utf8"),
  ui: fs.readFileSync("src/components/videoink/ui.tsx","utf8"),
};
const must = [
  [files.editor, 'const undo = useCallback(() => {'],
  [files.editor, 'const redo = useCallback(() => {'],
  [files.canvas, 'onToolChange?.("move");'],
  [files.canvas, 'requestAnimationFrame(renderLive)'],
  [files.player, 'key={`${source.type}:${source.url}`}'],
  [files.player, 'Math.min(safe, duration)'],
  [files.export, 'opts.mode === "clean-frame"'],
  [files.prefs, 'export function clearPrefs(): boolean'],
  [files.ui, 'data-videoink-inline-editor="true"'],
];
for (const [text, needle] of must) if (!text.includes(needle)) throw new Error(`Missing integration contract: ${needle}`);
console.log("PASS: critical cross-feature contracts are present together.");
