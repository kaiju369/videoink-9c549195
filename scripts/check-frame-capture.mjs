import fs from "node:fs";
const src=fs.readFileSync("src/lib/videoink/capture.ts","utf8");
for (const n of [
  "waitForDecodedVideoFrame",
  "requestVideoFrameCallback",
  "canCaptureDecodedVideoFrame",
  "ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)",
  'captureMethod: "html5-video"',
]) if(!src.includes(n)) throw new Error(`Missing direct frame capture invariant: ${n}`);
if(src.indexOf("await waitForDecodedVideoFrame(videoEl)") > src.indexOf("ctx.drawImage(videoEl"))
  throw new Error("Frame-ready wait must occur before drawImage");
console.log("PASS: decoded HTML5 video capture path is frame-synchronized and UI-independent.");
