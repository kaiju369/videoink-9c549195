import { renderPageToCanvas } from "./render";
import { sanitizeFilename } from "./prefs";
import { formatTime, type Page } from "./types";

export type ExportFormat = "png" | "jpeg" | "pdf" | "zip" | "json";

/** Thrown when an export is cancelled mid-flight so callers can distinguish
 * a deliberate cancellation from a real failure. */
export class ExportCancelled extends Error {
  constructor(message = "Export cancelled") {
    super(message);
    this.name = "ExportCancelled";
  }
}

export interface ExportOptions {
  format: ExportFormat;
  filename: string;
  /** Output content mode: full page, clean video frame, or annotations only. */
  mode?: "page" | "clean-frame" | "annotations";
  includeDate: boolean;
  includePageNumbers: boolean;
  /** @deprecated use `resolution` instead; kept for backwards compatibility */
  resolutionWidth?: number;
  /** "native" keeps each page's own snapshot resolution; a number targets that width */
  resolution?: "native" | number;
  jpegQuality: number;
  /** when true (PDF only), prefer lossless PNG pages over JPEG */
  lossless?: boolean;
  /** burn-in metadata; all default to off */
  metadata?: {
    title?: boolean;
    timestamp?: boolean;
    pageNumbers?: boolean;
  };
}

export interface ExportProgress {
  phase: string;
  done: number;
  total: number;
}

function resolveWidth(opts: ExportOptions, page: Page): number | undefined {
  const res = opts.resolution ?? opts.resolutionWidth ?? "native";
  if (res === "native") return page.snapshot?.width ?? opts.resolutionWidth;
  return typeof res === "number" ? res : opts.resolutionWidth;
}

function pageMetadata(opts: ExportOptions, page: Page, index: number) {
  const m = opts.metadata;
  if (!m) return undefined;
  const out: { title?: string; timestamp?: string; pageNumber?: string } = {};
  if (m.title && page.title) out.title = page.title;
  if (m.timestamp && page.timestamp != null) out.timestamp = formatTime(page.timestamp);
  if (m.pageNumbers) out.pageNumber = `Page ${index + 1}`;
  return Object.keys(out).length ? out : undefined;
}

function freeCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Encode a canvas to a Blob using the async toBlob API (falls back to a
 * dataURL-derived blob if toBlob is unavailable, e.g. in some test runners). */
function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("toBlob returned null"));
        },
        mime,
        quality,
      );
    } else {
      try {
        const dataUrl = canvas.toDataURL(mime, quality);
        resolve(dataUrlToBlob(dataUrl));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(head ?? "")?.[1] ?? "image/png";
  const bin = atob(body ?? "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function canvasToDataUrl(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<string> {
  try {
    const blob = await canvasToBlob(canvas, mime, quality);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    // dataUrl fallback path
    return canvas.toDataURL(mime, quality);
  }
}

function pageFileName(page: Page, index: number, opts: ExportOptions, ext: string) {
  const parts = [opts.filename];
  if (opts.includePageNumbers) parts.push(String(index + 1).padStart(2, "0"));
  const label = page.title || (page.timestamp != null ? formatTime(page.timestamp) : "page");
  parts.push(sanitizeFilename(label));
  return `${parts.join("_")}.${ext}`;
}

export interface ExportHandle {
  cancelled: boolean;
}

function checkCancelled(handle?: ExportHandle) {
  if (handle?.cancelled) throw new ExportCancelled();
}

/** Rough colour-count heuristic to decide if a frame is a good PNG candidate
 * (screenshots / slides tend to have few distinct colours; video frames don't). */
function looksLowColour(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const sampleW = Math.min(64, canvas.width);
    const sampleH = Math.min(64, canvas.height);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
      seen.add(key);
      if (seen.size > 256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function exportPages(
  pages: Page[],
  opts: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
  handle?: ExportHandle,
): Promise<void> {
  const total = pages.length;
  if (total === 0) {
    throw new Error("Nothing to export: no pages are selected.");
  }
  if (!opts.filename.trim()) {
    throw new Error("Export filename cannot be empty.");
  }
  if (opts.mode === "clean-frame" && pages.some((page) => page.type !== "video")) {
    throw new Error("Clean-frame export requires video pages only.");
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const base = opts.includeDate ? `${opts.filename}_${stamp}` : opts.filename;

  const revokeUrls: string[] = [];
  const cleanupUrls = () => {
    revokeUrls.forEach((u) => URL.revokeObjectURL(u));
    revokeUrls.length = 0;
  };

  try {
    if (opts.format === "json") {
      onProgress?.({ phase: "Serialising pages", done: total, total });
      const blob = new Blob([JSON.stringify({ version: 2, pages }, null, 2)], {
        type: "application/json",
      });
      download(blob, `${base}.json`);
      return;
    }

    if (opts.format === "pdf") {
      const { jsPDF } = await import("jspdf");
      let doc: import("jspdf").jsPDF | null = null;
      for (let i = 0; i < pages.length; i++) {
        checkCancelled(handle);
        const page = pages[i]!;
        onProgress?.({ phase: `Rendering page ${i + 1} / ${total}`, done: i, total });
        const width = resolveWidth(opts, page);
        const canvas = await renderPageToCanvas(page, {
          width,
          mode: opts.mode ?? "page",
          metadata: opts.mode === "clean-frame" ? undefined : pageMetadata(opts, page, i),
        });
        checkCancelled(handle);
        const useLossless = opts.lossless || looksLowColour(canvas);
        const mime = useLossless ? "image/png" : "image/jpeg";
        const imgFormat = useLossless ? "PNG" : "JPEG";
        const quality = useLossless ? undefined : opts.jpegQuality;
        const img = await canvasToDataUrl(canvas, mime, quality);
        const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
        if (!doc) {
          doc = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
        } else {
          doc.addPage([canvas.width, canvas.height], orientation);
        }
        doc.addImage(img, imgFormat, 0, 0, canvas.width, canvas.height);
        freeCanvas(canvas);
      }
      if (!doc) return;
      checkCancelled(handle);
      onProgress?.({ phase: "Creating PDF…", done: total, total });
      download(doc.output("blob"), `${base}.pdf`);
      return;
    }

    const imgFormat = opts.format === "jpeg" ? "jpeg" : "png";
    const ext = imgFormat === "jpeg" ? "jpg" : "png";
    const mime = imgFormat === "jpeg" ? "image/jpeg" : "image/png";
    const images: { name: string; blob: Blob }[] = [];
    for (let i = 0; i < pages.length; i++) {
      checkCancelled(handle);
      const page = pages[i]!;
      onProgress?.({ phase: `Rendering page ${i + 1} / ${total}`, done: i, total });
      const width = resolveWidth(opts, page);
      const canvas = await renderPageToCanvas(page, {
        width,
        mode: opts.mode ?? "page",
        metadata: pageMetadata(opts, page, i),
      });
      checkCancelled(handle);
      const blob = await canvasToBlob(canvas, mime, imgFormat === "jpeg" ? opts.jpegQuality : undefined);
      freeCanvas(canvas);
      images.push({ name: pageFileName(page, i, opts, ext), blob });
    }

    const wantsZip = opts.format === "zip" || images.length > 1;
    if (wantsZip) {
      checkCancelled(handle);
      onProgress?.({ phase: "Packaging ZIP…", done: total, total });
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      images.forEach((f) => zip.file(f.name, f.blob));
      zip.file(
        "manifest.json",
        JSON.stringify(
          {
            note:
              opts.format === "zip"
                ? "Requested ZIP export."
                : "Multi-page export automatically packaged as a ZIP of individual images.",
            pages: pages.map((p, i) => ({
              file: images[i]?.name,
              id: p.id,
              title: p.title,
              type: p.type,
              createdRank: p.createdRank,
              currentOrder: p.currentOrder,
              timestamp: p.timestamp,
              video: p.videoTitle,
              snapshotStatus: p.snapshot?.status ?? "unavailable",
            })),
          },
          null,
          2,
        ),
      );
      const blob = await zip.generateAsync({ type: "blob" });
      onProgress?.({ phase: "Finalising…", done: total, total });
      download(blob, `${base}.zip`);
      return;
    }

    const only = images[0];
    if (only) download(only.blob, `${base}.${ext}`);
  } finally {
    cleanupUrls();
  }
}
