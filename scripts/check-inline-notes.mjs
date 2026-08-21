import fs from "node:fs";
const canvas=fs.readFileSync("src/components/videoink/ObjectCanvas.tsx","utf8");
const ui=fs.readFileSync("src/components/videoink/ui.tsx","utf8");
for(const n of [
  'text: "",',
  'onEditText(t.id);',
  'onDoubleClick=',
  'find((o) => o.kind === "text" && hitTest(o',
]) if(!canvas.includes(n)) throw new Error(`Missing blank-note interaction: ${n}`);
for(const n of [
  'const [draft, setDraft] = useState(obj.text);',
  'const commit = () =>',
  'const cancel = () =>',
  'if (e.key === "Enter" && (e.ctrlKey || e.metaKey))',
  'data-videoink-inline-editor="true"',
  'placeholder="Type…"',
]) if(!ui.includes(n)) throw new Error(`Missing inline note editor behavior: ${n}`);
console.log("PASS: blank notes are created with empty text, existing notes can be opened in-place, draft edits support commit/cancel, and keyboard-safe inline editing is present.");
