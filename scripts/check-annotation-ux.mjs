import fs from "node:fs";
const canvas=fs.readFileSync("src/components/videoink/ObjectCanvas.tsx","utf8");
for(const n of [
  'onRecognized?.(rec.shape);',
  'editor.setSelection([shape.id]);',
  'onToolChange?.("move");'
]) if(!canvas.includes(n)) throw new Error(`Missing annotation behavior: ${n}`);

const recognized = canvas.indexOf('onRecognized?.(rec.shape);');
const moveNearRecognized = canvas.slice(Math.max(0, recognized-500), recognized+200);
if(!moveNearRecognized.includes('onToolChange?.("move")'))
  throw new Error("Recognized shape does not switch to Move.");

const selected = canvas.indexOf('editor.setSelection([shape.id]);');
const moveNearSelected = canvas.slice(selected, selected+300);
if(!moveNearSelected.includes('onToolChange?.("move")'))
  throw new Error("Created shape does not switch to Move.");

console.log("PASS: recognized and newly-created shapes switch to Move mode after selection.");
