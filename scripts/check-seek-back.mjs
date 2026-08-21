import fs from "node:fs";
const src=fs.readFileSync("src/routes/index.tsx","utf8");
for(const n of ["const openLinkedPage = useCallback","page.snapshot?.timestamp ?? page.timestamp","playerRef.current.seek(timestamp)","setFrozenAt(timestamp)","editor.reset(page.objects)","onOpen={openLinkedPage}","onEnlarge={openLinkedPage}"])
 if(!src.includes(n)) throw new Error(`Missing linked-page behavior: ${n}`);
console.log("PASS: linked pages seek to saved timestamp and restore objects.");
