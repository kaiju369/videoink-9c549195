import fs from "node:fs";
const src=fs.readFileSync("src/routes/index.tsx","utf8");
for(const n of [
 "const framePages = useMemo",
 'page.type === "video"',
 'sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))',
 "const navigateSavedFrame = useCallback",
 "openLinkedPage(framePages[targetIndex])",
 'title="Previous saved frame"',
 'title="Next saved frame"',
 'e.altKey && e.key === "ArrowLeft"',
 'e.altKey && e.key === "ArrowRight"',
]) if(!src.includes(n)) throw new Error(`Missing frame navigation: ${n}`);
console.log("PASS: current-video saved-frame timeline, buttons, and keyboard navigation are wired.");
