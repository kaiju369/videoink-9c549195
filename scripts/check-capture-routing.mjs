import fs from "node:fs";
const src=fs.readFileSync("src/lib/videoink/capture.ts","utf8");
for (const n of [
  'export type VideoCaptureCapability',
  'getVideoCaptureCapabilities',
  'preferredVideoCaptureMethod',
  'if (capabilities.directHtml5) return "direct-html5"',
  'if (capabilities.screenCapture) return "screen-capture"',
  'if (capabilities.youtubeReference) return "youtube-reference"',
  'captureMethod: "youtube-thumbnail"',
]) if(!src.includes(n)) throw new Error(`Missing capture routing invariant: ${n}`);
console.log("PASS: capture capability classification and preference order are wired.");
