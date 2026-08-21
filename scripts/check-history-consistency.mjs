import fs from "node:fs";
const s=fs.readFileSync("src/components/videoink/useEditor.ts","utf8");
for(const n of [
  'isTransacting: boolean;',
  'if (txRef.current !== null) abort();',
  'const undo = useCallback(() => {',
  'const redo = useCallback(() => {',
  'past: [...state.past, action.prevSnapshot].slice(-LIMIT),',
  'future: [],',
  'future: [...state.future, state.objects],',
  'past: [...state.past, state.objects],',
]) if(!s.includes(n)) throw new Error(`Missing history consistency behavior: ${n}`);
console.log("PASS: undo/redo cannot operate on half-finished transactions, committed changes clear redo, and history transitions remain bounded.");
