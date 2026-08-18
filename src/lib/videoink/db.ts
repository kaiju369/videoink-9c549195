import { openDB, type IDBPDatabase } from "idb";
import type { Annotation, Page, PageObject, RecoveryDoc, Stroke, VideoRecord } from "./types";
import { SCHEMA_VERSION } from "./types";

const DB_NAME = "videoink";
const DB_VERSION = 3;

/** Typed storage failure so callers can show useful, differentiated errors. */
export class StorageError extends Error {
  kind: "quota" | "blocked" | "corrupt" | "unavailable";
  cause2?: unknown;
  constructor(kind: StorageError["kind"], message: string, cause?: unknown) {
    super(message);
    this.name = "StorageError";
    this.kind = kind;
    this.cause2 = cause;
  }
}

function classifyError(err: unknown): StorageError {
  if (err instanceof StorageError) return err;
  const name = (err as { name?: string } | null)?.name;
  const message = err instanceof Error ? err.message : String(err);
  if (name === "QuotaExceededError" || /quota/i.test(message)) {
    return new StorageError("quota", "Storage quota exceeded.", err);
  }
  if (name === "InvalidStateError" || /blocked/i.test(message)) {
    return new StorageError("blocked", "Database is blocked by another tab.", err);
  }
  if (name === "DataError" || name === "DataCloneError") {
    return new StorageError("corrupt", "Data could not be stored (corrupt record).", err);
  }
  return new StorageError("unavailable", message || "Storage is unavailable.", err);
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw classifyError(err);
  }
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/** Upgrade legacy v1 annotations (flat strokes) into canonical pages. */
export function annotationToPage(a: Annotation, rank: number): Page {
  const objects: PageObject[] = (a.strokes ?? []).map((s, i) => ({
    ...(s as Stroke),
    kind: "stroke" as const,
    tool: (s as Stroke).tool === "highlighter" ? ("highlighter" as const) : ("pen" as const),
    z: i + 1,
    createdAt: a.createdAt,
  }));
  return {
    id: a.id,
    schemaVersion: SCHEMA_VERSION,
    type: "video",
    createdRank: rank,
    currentOrder: rank,
    title: `${a.title}`,
    sourceType: a.sourceType,
    sourceKey: a.sourceKey,
    sourceUrl: a.sourceUrl,
    youtubeVideoId: a.youtubeVideoId,
    videoTitle: a.title,
    timestamp: a.timestamp,
    duration: a.duration,
    aspectRatio: a.videoAspectRatio,
    objects,
    snapshot: a.snapshot,
    thumbnail: a.snapshot?.dataUrl,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function getDb() {
  if (typeof window === "undefined") {
    throw new StorageError("unavailable", "IndexedDB is only available in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains("annotations")) {
          const s = db.createObjectStore("annotations", { keyPath: "id" });
          s.createIndex("sourceKey", "sourceKey");
          s.createIndex("createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("videos")) {
          db.createObjectStore("videos", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("recovery")) {
          db.createObjectStore("recovery", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("pages")) {
          const p = db.createObjectStore("pages", { keyPath: "id" });
          p.createIndex("createdRank", "createdRank");
          p.createIndex("currentOrder", "currentOrder");
          p.createIndex("sourceKey", "sourceKey");
        }
        if (oldVersion === 1) {
          // migrate existing annotations into pages, preserving order by creation
          const legacy = (await tx.objectStore("annotations").getAll()) as Annotation[];
          legacy.sort((a, b) => a.createdAt - b.createdAt);
          const store = tx.objectStore("pages");
          legacy.forEach((a, i) => {
            void store.put(annotationToPage(a, i + 1));
          });
          // legacy recovery docs are dropped (schema changed)
          void tx.objectStore("recovery").clear();
        }
        if (oldVersion > 0 && oldVersion < 3) {
          // v2 -> v3: no structural change, just a schema-version bump that
          // future migrations can key off of. Kept as an explicit no-op so
          // the upgrade path stays additive and auditable.
        }
      },
      blocked() {
        // Another (older) connection is open and refuses to close; surface
        // via a thrown StorageError on next operation rather than hanging.
        console.warn("[videoink] IndexedDB upgrade blocked by another tab.");
      },
      blocking() {
        // We are the old connection blocking a newer one elsewhere — close
        // so the other tab can proceed instead of deadlocking both tabs.
        dbPromise
          ?.then((db) => db.close())
          .catch(() => void 0);
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/* ------------------------------- validation -------------------------- */

export interface LoadReport {
  total: number;
  skipped: number;
}

/** Mutated after every `listPages()` call so callers can surface skipped rows. */
export let lastLoadReport: LoadReport = { total: 0, skipped: 0 };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Reject malformed page records rather than letting them crash the editor. */
export function sanitizePage(raw: unknown): Page | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Page>;
  if (typeof p.id !== "string" || !p.id) return null;
  if (typeof p.type !== "string") return null;
  if (!isFiniteNumber(p.createdRank) || !isFiniteNumber(p.currentOrder)) return null;
  if (!isFiniteNumber(p.aspectRatio) || p.aspectRatio <= 0) return null;
  if (!Array.isArray(p.objects)) return null;
  if (!p.snapshot || typeof p.snapshot !== "object") return null;
  if (!isFiniteNumber(p.createdAt) || !isFiniteNumber(p.updatedAt)) return null;
  if (typeof p.title !== "string") return null;
  return p as Page;
}

/* ------------------------------- pages ------------------------------ */

export async function listPages(): Promise<Page[]> {
  return guarded(async () => {
    const db = await getDb();
    const all = await db.getAll("pages");
    const clean: Page[] = [];
    let skipped = 0;
    for (const row of all) {
      const page = sanitizePage(row);
      if (page) clean.push(page);
      else skipped++;
    }
    lastLoadReport = { total: all.length, skipped };
    return clean.sort((a, b) => a.currentOrder - b.currentOrder);
  });
}

export async function putPage(p: Page) {
  return guarded(async () => {
    const db = await getDb();
    await db.put("pages", p);
  });
}

export async function putPages(pages: Page[]) {
  return guarded(async () => {
    const db = await getDb();
    const tx = db.transaction("pages", "readwrite");
    for (const p of pages) void tx.store.put(p);
    await tx.done;
  });
}

/**
 * Write a page and verify it round-trips before resolving, so callers can
 * only clear unsaved editor state once persistence is actually proven.
 */
export async function putPageSafely(p: Page): Promise<Page> {
  return guarded(async () => {
    const db = await getDb();
    await db.put("pages", p);
    const readBack = await db.get("pages", p.id);
    const sanitized = sanitizePage(readBack);
    if (!sanitized) {
      throw new StorageError("corrupt", "Page failed to verify after write.");
    }
    return sanitized;
  });
}

export async function getPage(id: string): Promise<Page | undefined> {
  return guarded(async () => {
    const db = await getDb();
    const raw = await db.get("pages", id);
    return sanitizePage(raw) ?? undefined;
  });
}

export async function deletePage(id: string) {
  return guarded(async () => {
    const db = await getDb();
    await db.delete("pages", id);
  });
}

export async function nextRanks(): Promise<{ rank: number; order: number }> {
  const pages = await listPages();
  return {
    rank: pages.reduce((m, p) => Math.max(m, p.createdRank), 0) + 1,
    order: pages.reduce((m, p) => Math.max(m, p.currentOrder), 0) + 1,
  };
}

/* ------------------------------ videos ------------------------------ */

export async function putVideo(v: VideoRecord) {
  return guarded(async () => {
    const db = await getDb();
    await db.put("videos", v);
  });
}

export async function getVideo(key: string): Promise<VideoRecord | undefined> {
  return guarded(async () => {
    const db = await getDb();
    return (await db.get("videos", key)) as VideoRecord | undefined;
  });
}

/* ----------------------------- recovery ----------------------------- */

export async function saveRecovery(doc: RecoveryDoc) {
  return guarded(async () => {
    const db = await getDb();
    await db.put("recovery", doc);
  });
}

export async function loadRecovery(): Promise<RecoveryDoc | undefined> {
  return guarded(async () => {
    const db = await getDb();
    return (await db.get("recovery", "active")) as RecoveryDoc | undefined;
  });
}

export async function clearRecovery() {
  return guarded(async () => {
    const db = await getDb();
    await db.delete("recovery", "active");
  });
}

/** Clear the recovery doc only if it still refers to the given page, so a
 * stale recovery from a different page isn't accidentally wiped. */
export async function clearRecoveryIfMatches(pageId: string) {
  return guarded(async () => {
    const db = await getDb();
    const doc = (await db.get("recovery", "active")) as RecoveryDoc | undefined;
    if (doc && doc.pageId === pageId) {
      await db.delete("recovery", "active");
    }
  });
}

/* ----------------------------- settings ----------------------------- */

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return guarded(async () => {
    const db = await getDb();
    const row = await db.get("settings", key);
    return row?.value as T | undefined;
  });
}

export async function setSetting<T>(key: string, value: T) {
  return guarded(async () => {
    const db = await getDb();
    await db.put("settings", { key, value });
  });
}

/* ----------------------------- diagnostics --------------------------- */

export interface StorageEstimate {
  usage: number | undefined;
  quota: number | undefined;
  usageRatio: number | undefined;
}

/** Best-effort storage usage/quota report via the Storage API. */
export async function estimateStorage(): Promise<StorageEstimate> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      return { usage: undefined, quota: undefined, usageRatio: undefined };
    }
    const { usage, quota } = await navigator.storage.estimate();
    return {
      usage,
      quota,
      usageRatio: usage != null && quota ? usage / quota : undefined,
    };
  } catch {
    return { usage: undefined, quota: undefined, usageRatio: undefined };
  }
}
