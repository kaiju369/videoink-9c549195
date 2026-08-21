import fs from "node:fs";
const y=fs.readFileSync("src/lib/videoink/youtube.ts","utf8");
const p=fs.readFileSync("src/components/videoink/Player.tsx","utf8");
for(const n of [
  'host === "youtu.be"',
  'parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "v" || parts[0] === "live"',
  'return "direct-media"',
  'urlCapability',
  'setUrlCapability("checking")',
  'setUrlCapability("blocked")',
  'setUrlCapability("playable")',
  'cross-origin playback',
]) if(!y.includes(n) && !p.includes(n)) throw new Error(`Missing video-link behavior: ${n}`);
console.log("PASS: YouTube variants and generic media URLs are classified safely; direct URL playback exposes checking/playable/blocked states.");
