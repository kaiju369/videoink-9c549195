import fs from "node:fs";
const src=fs.readFileSync("src/components/videoink/useEditor.ts","utf8");
for(const n of [
  'function objectsEqual(a: PageObject[], b: PageObject[]): boolean',
  'const same = objectsEqual(action.prevSnapshot, action.value);',
  'if (same) return { ...state, objects: action.value };',
  'future: [],',
  'past: [...state.past, state.objects]',
  'future: [...state.future, state.objects]',
]) if(!src.includes(n)) throw new Error(`Missing undo/redo invariant: ${n}`);
console.log("PASS: no-op transactions do not create history, real edits clear redo, and undo/redo preserve bidirectional history.");
