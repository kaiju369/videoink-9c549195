import fs from "node:fs";
const r=fs.readFileSync("src/components/videoink/RadialToolDock.tsx","utf8");
const u=fs.readFileSync("src/components/videoink/ui.tsx","utf8");
for(const n of [
  'role="menu"',
  'role="menuitemradio"',
  'aria-checked={selected}',
  'aria-expanded={panel === k}',
  'aria-pressed={activeColor === c.hex}',
  'aria-pressed={p.prefs.penProfile === pr.id}',
  'focus-visible:ring-2',
  'aria-hidden="true" focusable="false"',
]) if(!r.includes(n)) throw new Error(`Missing accessible tool control: ${n}`);
if(!u.includes('aria-label="Edit note"')) throw new Error("Inline note editor lost accessible label");
console.log("PASS: quick-tool semantics, state announcements, keyboard focus styling, decorative icon hiding, and inline note labeling are present.");
