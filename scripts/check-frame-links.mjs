import fs from "node:fs";
const types=fs.readFileSync("src/lib/videoink/types.ts","utf8");
const cap=fs.readFileSync("src/lib/videoink/capture.ts","utf8");
const route=fs.readFileSync("src/routes/index.tsx","utf8");
for (const [src,needles] of [
  [types,["timestamp?: number","sourceKey?: string"]],
  [cap,["sourceKey?: string | undefined;","timestamp?: number | undefined;","timestamp,","sourceKey,"]],
  [route,["sourceKey: sourceKey(source)","timestamp: source ? frozenAt : undefined","snapshotWithLink"]]
]) for(const n of needles) if(!src.includes(n)) throw new Error(`Missing frame-link invariant: ${n}`);
console.log("PASS: saved snapshots carry timestamp + source identity.");
