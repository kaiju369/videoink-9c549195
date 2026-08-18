import { renderObjects } from "./objects";
import type { Page } from "./types";

/* ------------------------------------------------------------------ */
/* bounded LRU image cache — keys are (large) data URLs                */
/* ------------------------------------------------------------------ */

const IMAGE_CACHE_MAX = 30;
const imageCache = new Map<string, HTMLImageElement>();

function cacheGet(key: string): HTMLImageElement | undefined {
  const img = imageCache.get(key);
  if (img) {
    // refresh recency
    imageCache.delete(key);
    imageCache.set(key, img);
  }
  return img;
}

function cacheSet(key: string, img: HTMLImageElement) {
  imageCache.set(key, img);
  while (imageCache.size > IMAGE_CACHE_MAX) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey === undefined) break;
    imageCache.delete(oldestKey);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = cacheGet(src);
  if (cached?.complete) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      cacheSet(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export interface RenderMetadata {
  title?: string | undefined;
  timestamp?: string | undefined;
  pageNumber?: string | undefined;
}

export interface RenderOptions {
  /** target output width; defaults to the snapshot's native width when present */
  width?: number;
  background?: string;
  /** allow upscaling past the snapshot's native resolution (default: false) */
  allowUpscale?: boolean;
  /** optional caption burned into the corner; nothing is drawn unless provided */
  metadata?: RenderMetadata;
}

const DEFAULT_WIDTH = 1600;

function drawCaption(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  metadata: RenderMetadata,
) {
  const parts = [metadata.title, metadata.timestamp, metadata.pageNumber].filter(
    (v): v is string => !!v && v.length > 0,
  );
  if (!parts.length) return;
  const text = parts.join("  ·  ");
  const fontSize = Math.max(10, Math.round(width * 0.014));
  ctx.save();
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  const padX = Math.round(fontSize * 0.6);
  const padY = Math.round(fontSize * 0.5);
  const metrics = ctx.measureText(text);
  const boxW = Math.min(width - 16, metrics.width + padX * 2);
  const boxH = fontSize + padY * 2;
  const x = 8;
  const y = height - boxH - 8;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = "#f5f1e8";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + boxH / 2, boxW - padX * 2);
  ctx.restore();
}

/** Render a canonical page (snapshot + all objects) to an offscreen canvas. */
export async function renderPageToCanvas(
  page: Page,
  opts: RenderOptions = {},
): Promise<HTMLCanvasElement> {
  const ar = page.aspectRatio || 16 / 9;
  const nativeWidth = page.snapshot?.width;
  const nativeHeight = page.snapshot?.height;

  let width = Math.round(opts.width ?? nativeWidth ?? DEFAULT_WIDTH);
  if (!opts.allowUpscale && nativeWidth && width > nativeWidth) {
    width = nativeWidth;
  }
  width = Math.max(120, width);

  // Preserve aspect ratio exactly: prefer the native snapshot AR when present
  // (it may differ slightly from page.aspectRatio due to letterboxing),
  // otherwise fall back to the page's declared aspect ratio.
  const effectiveAr = nativeWidth && nativeHeight ? nativeWidth / nativeHeight : ar;
  const height = Math.max(1, Math.round(width / effectiveAr));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = opts.background ?? (page.type === "video" ? "#0c0b0a" : "#11100e");
  ctx.fillRect(0, 0, width, height);

  const src = page.snapshot?.dataUrl;
  if (src && page.type === "video") {
    try {
      const img = await loadImage(src);
      // object-fit: contain — never stretch when source AR differs.
      const iw = img.naturalWidth || width;
      const ih = img.naturalHeight || height;
      const srcAr = iw / ih;
      let dw = width;
      let dh = height;
      if (srcAr > width / height) {
        dw = width;
        dh = width / srcAr;
      } else {
        dh = height;
        dw = height * srcAr;
      }
      const dx = (width - dw) / 2;
      const dy = (height - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } catch {
      /* keep flat background */
    }
  } else if (page.type !== "video") {
    // subtle ruled background for blank / custom pages
    ctx.strokeStyle = "rgba(245,241,232,0.07)";
    ctx.lineWidth = 1;
    const step = height / 18;
    for (let y = step; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  // Legacy snapshots (inkBaked !== false) already contain the flattened ink —
  // drawing the objects again would double every stroke in the export.
  const baked = src && page.type === "video" && page.snapshot?.inkBaked !== false;
  if (!baked) {
    renderObjects(ctx, page.objects ?? [], { left: 0, top: 0, width, height });
  }

  if (opts.metadata) drawCaption(ctx, width, height, opts.metadata);

  return canvas;
}

export async function renderPageDataUrl(
  page: Page,
  width: number,
  format: "png" | "jpeg" = "png",
  quality = 0.92,
): Promise<string> {
  const canvas = await renderPageToCanvas(page, { width });
  const dataUrl = canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", quality);
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}

/** Small cached preview used by the library. */
export async function makeThumbnail(page: Page): Promise<string | undefined> {
  try {
    return await renderPageDataUrl(page, 480, "jpeg", 0.72);
  } catch {
    return page.snapshot?.dataUrl;
  }
}
