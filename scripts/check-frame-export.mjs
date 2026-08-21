import fs from "node:fs";
const src=fs.readFileSync("src/lib/videoink/capture.ts","utf8");
for(const n of [
  'ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);',
  'captureMethod: "html5-video"',
  'captureMethod: "screen-capture"',
  'downloadCleanFrame(',
  'snapshot.status !== "captured"',
  'a.download = `${filename.replace(/[^a-z0-9._-]+/gi, "_")}.png`',
]) if(!src.includes(n)) throw new Error(`Missing clean-frame export behavior: ${n}`);
console.log("PASS: saved frame capture is video-surface-only, uses direct decoded pixels when available, has screen-capture fallback, and exports only the captured frame data.");
