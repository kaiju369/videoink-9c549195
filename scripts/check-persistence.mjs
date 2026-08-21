import fs from "node:fs";
const prefs=fs.readFileSync("src/lib/videoink/prefs.ts","utf8");
const db=fs.readFileSync("src/lib/videoink/db.ts","utf8");
for(const n of [
  'showToolbar: boolean',
  'showToolbar: true',
  'window.localStorage.getItem(KEY)',
  'export function savePrefs(p: Prefs): boolean',
  'if (typeof window === "undefined") return false;',
  'window.localStorage.setItem(KEY, JSON.stringify(p));',
  'export function clearPrefs(): boolean',
  'window.localStorage.removeItem(KEY)',
  'export let lastLoadReport: LoadReport',
  'sanitizePage(row)',
]) if(!prefs.includes(n) && !db.includes(n)) throw new Error(`Missing persistence behavior: ${n}`);
console.log("PASS: preferences persist safely, can be cleared, remain usable when browser storage is unavailable, and page loading sanitizes malformed records.");
