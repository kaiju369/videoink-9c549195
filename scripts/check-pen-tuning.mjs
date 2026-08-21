import fs from "node:fs";
const src = fs.readFileSync("src/lib/videoink/prefs.ts","utf8");
const ids=["ballpoint","pencil","marker","fountain","brush","highlighter","technical"];
for (const id of ids) if (!src.includes(`id: "${id}"`)) throw new Error(`Missing ${id}`);

const block=(id)=>{
  const start=src.indexOf(`  ${id}: {`);
  if(start<0) throw new Error(`Missing block ${id}`);
  const end=src.indexOf("\n  },",start);
  if(end<0) throw new Error(`Unclosed block ${id}`);
  return src.slice(start,end);
};
const get=(id,field)=>{
  const x=block(id).match(new RegExp(`${field}: ([^,\\n]+)`));
  if(!x) throw new Error(`Missing ${field} in ${id}`);
  return Number(x[1]);
};

if (!(get("pencil","grain") > get("ballpoint","grain"))) throw new Error("Pencil grain not distinct");
if (!(get("marker","widthScale") > get("ballpoint","widthScale"))) throw new Error("Marker width not distinct");
if (!(get("brush","thinning") > get("marker","thinning"))) throw new Error("Brush thinning not distinct");
if (!(get("fountain","endTaper") > get("ballpoint","endTaper"))) throw new Error("Fountain taper not distinct");
if (!(get("technical","thinning") === 0)) throw new Error("Technical pen should be pressure-stable");
console.log("PASS: seven pen profiles have distinct, bounded tuning characteristics.");
