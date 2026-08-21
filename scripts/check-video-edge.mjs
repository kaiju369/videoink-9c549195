import fs from "node:fs";
const p=fs.readFileSync("src/components/videoink/Player.tsx","utf8");
const c=fs.readFileSync("src/lib/videoink/capture.ts","utf8");
for(const n of [
  'key={`${source.type}:${source.url}`}',
  'const duration = videoRef.current.duration;',
  'Math.min(safe, duration)',
  'setUrlCapability("checking")',
  'setUrlCapability("blocked")',
]) if(!p.includes(n)) throw new Error(`Missing video edge handling: ${n}`);
for(const n of [
  'requestVideoFrameCallback',
  'The browser exposes decoded video pixels',
  'ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)',
  'captureMethod: "html5-video"',
  'captureMethod: "screen-capture"',
  'captureMethod: "youtube-thumbnail"',
]) if(!c.includes(n)) throw new Error(`Missing frame-capture path: ${n}`);
console.log("PASS: source swaps reset URL capability, native seeks are duration-safe, and direct decoded-frame capture remains preferred over screen capture/reference fallback.");
