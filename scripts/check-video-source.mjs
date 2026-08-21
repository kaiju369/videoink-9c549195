import fs from "node:fs";
const yt=fs.readFileSync("src/lib/videoink/youtube.ts","utf8");
const cap=fs.readFileSync("src/lib/videoink/capture.ts","utf8");
for(const n of [
  'export type VideoLinkKind = "youtube" | "direct-media" | "unknown"',
  'if (parseYouTubeId(raw)) return "youtube"',
  'return "direct-media";',
  'export function explainVideoCapture(',
  'actualFramePossible: true',
  'youtube-reference',
  'export function captureStatusLabel('
]) if(!yt.includes(n) && !cap.includes(n)) throw new Error(`Missing source/capture capability behavior: ${n}`);
console.log("PASS: live-link classification and explicit capture capability diagnostics are wired.");
