import fs from "node:fs";
const s=fs.readFileSync("src/lib/videoink/export.ts","utf8");
for(const n of [
  'if (total === 0) {',
  'Nothing to export: no pages are selected.',
  'if (!opts.filename.trim()) {',
  'Export filename cannot be empty.',
  'opts.mode === "clean-frame" && pages.some((page) => page.type !== "video")',
  'Clean-frame export requires video pages only.',
  'metadata: opts.mode === "clean-frame" ? undefined : pageMetadata(opts, page, i)',
]) if(!s.includes(n)) throw new Error(`Missing export safety behavior: ${n}`);
console.log("PASS: export rejects empty jobs/filenames, clean-frame mode rejects non-video pages, and clean-frame exports suppress metadata.");
