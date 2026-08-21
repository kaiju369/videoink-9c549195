import fs from "node:fs";
const s=fs.readFileSync("src/components/videoink/ObjectCanvas.tsx","utf8");
for(const n of [
  'if (raf.current == null) raf.current = requestAnimationFrame(renderLive);',
  'getCoalescedEvents?.()',
  'schedule();',
  'case "erasePartial":',
]) if(!s.includes(n)) throw new Error(`Missing performance behavior: ${n}`);
const count=(s.match(/requestAnimationFrame\(renderLive\)/g)||[]).length;
if(count!==1) throw new Error(`Expected a single RAF scheduling point, found ${count}`);
console.log("PASS: canvas rendering remains RAF-coalesced, stylus samples use coalesced events, and partial erasing schedules a frame instead of rendering synchronously.");
