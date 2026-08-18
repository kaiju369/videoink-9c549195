import type { ContentRect } from "./geometry";
import type { PageObject, SnapshotInfo } from "./types";
import { youtubeThumbnail } from "./youtube";

/** Absolute safety cap to avoid OOM on huge displays; not a "quality" cap. */
const SAFETY_MAX_DIM = 4096;

/** Below this pixel count we prefer lossless PNG; above it, high-quality JPEG. */
const PNG_PIXEL_BUDGET = 1920 * 1080 * 1.2;

function clampDim(w: number, h: number): { w: number; h: number; scale: number } {
  const scale = Math.min(1, SAFETY_MAX_DIM / Math.max(1, w), SAFETY_MAX_DIM / Math.max(1, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale };
}

function makeCanvas(width: number, height: number) {
  const { w, h } = clampDim(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

/** Encode a canvas once, choosing lossless PNG when small enough, otherwise high-quality JPEG. */
function encodeOnce(canvas: HTMLCanvasElement): string | null {
  try {
    const pixels = canvas.width * canvas.height;
    if (pixels <= PNG_PIXEL_BUDGET) {
      return canvas.toDataURL("image/png");
    }
    return canvas.toDataURL("image/jpeg", 0.94);
  } catch {
    return null;
  }
}

/** Human-readable summary of a snapshot's provenance, for UI/error surfaces. */
export function describeSnapshot(
  status: SnapshotInfo["status"],
  method: SnapshotInfo["captureMethod"],
): string {
  switch (status) {
    case "captured":
      return method === "html5-video"
        ? "Captured directly from the video frame."
        : "Captured from the screen-share stream.";
    case "reference-only":
      return "Reference thumbnail only — not an actual video frame.";
    case "unavailable":
      return "Video frame unavailable; only ink was saved.";
    case "failed":
      return "Snapshot capture failed.";
    case "pending":
      return "Snapshot capture pending.";
    default:
      return "Unknown snapshot state.";
  }
}

/* ------------------------------------------------------------------ */
/* Viewport → captured-surface mapping                                 */
/* ------------------------------------------------------------------ */

export interface SurfaceMapping {
  /** crop rect in captured-surface pixel space, already clamped to bounds */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Map a DOM viewport rectangle to the pixel rectangle it corresponds to on
 * the captured surface (tab / window / monitor), accounting for DPR, browser
 * zoom, and — for window/monitor capture — the OS window position.
 */
export function mapViewportToSurface(
  viewportRect: DOMRect,
  surfaceWidth: number,
  surfaceHeight: number,
  displaySurface: string | undefined,
): SurfaceMapping {
  const dpr = window.devicePixelRatio || 1;
  const zoom = window.visualViewport?.scale || 1;
  const pxScale = dpr * zoom;

  let originX = 0;
  let originY = 0;

  if (displaySurface === "monitor" || displaySurface === "window") {
    // The captured surface is the whole screen (or an OS window). The
    // viewportRect is relative to our own window's viewport, so add the
    // window's screen position and chrome (outer - inner) to translate.
    const chromeX = window.screenX ?? 0;
    const chromeTop = (window.outerHeight - window.innerHeight) || 0;
    originX = chromeX;
    originY = (window.screenY ?? 0) + chromeTop;
  }
  // For "browser"/tab capture the surface is exactly our viewport, so
  // originX/originY stay 0 and we only need the pixel-ratio scale.

  // Derive the effective scale from the captured surface size vs. our
  // window's own logical size, rather than assuming DPR alone — some
  // browsers report the surface already in device pixels, others don't.
  const assumedWidth =
    displaySurface === "monitor" || displaySurface === "window"
      ? window.screen?.width || window.innerWidth
      : window.innerWidth;
  const assumedHeight =
    displaySurface === "monitor" || displaySurface === "window"
      ? window.screen?.height || window.innerHeight
      : window.innerHeight;

  const scaleX = assumedWidth > 0 ? surfaceWidth / assumedWidth : pxScale;
  const scaleY = assumedHeight > 0 ? surfaceHeight / assumedHeight : pxScale;

  const rawX = (originX + viewportRect.left) * scaleX;
  const rawY = (originY + viewportRect.top) * scaleY;
  const rawW = viewportRect.width * scaleX;
  const rawH = viewportRect.height * scaleY;

  const sx = Math.min(Math.max(0, rawX), Math.max(0, surfaceWidth - 1));
  const sy = Math.min(Math.max(0, rawY), Math.max(0, surfaceHeight - 1));
  const sw = Math.min(Math.max(1, rawW), surfaceWidth - sx);
  const sh = Math.min(Math.max(1, rawH), surfaceHeight - sy);

  return { sx, sy, sw, sh };
}

/** A live screen-capture session the user explicitly authorised. */
export class ScreenCaptureSession {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private onEndedCb: (() => void) | null = null;
  private ended = false;
  displaySurface: string | undefined;

  get active() {
    return !!this.stream && this.stream.getVideoTracks()[0]?.readyState === "live";
  }

  static get supported() {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getDisplayMedia
    );
  }

  async start(onEnded?: () => void) {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
    });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    this.stream = stream;
    this.video = video;
    this.onEndedCb = onEnded ?? null;
    this.ended = false;
    const track = stream.getVideoTracks()[0];
    this.displaySurface = (track?.getSettings() as MediaTrackSettings & { displaySurface?: string })
      ?.displaySurface;
    track?.addEventListener("ended", () => this.handleEnded());
  }

  private handleEnded() {
    if (this.ended) return;
    this.ended = true;
    this.stop();
    this.onEndedCb?.();
  }

  /** Explicitly detect end-of-capture (e.g. polling readyState) and clean up. */
  checkEnded() {
    const track = this.stream?.getVideoTracks()[0];
    if (track && track.readyState !== "live") this.handleEnded();
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) {
      try {
        this.video.pause();
      } catch {
        /* ignore */
      }
      this.video.srcObject = null;
      this.video.removeAttribute("src");
      this.video.load();
    }
    this.video = null;
  }

  /** Crop the captured surface to a viewport rectangle, in native surface resolution. */
  grab(viewportRect: DOMRect): HTMLCanvasElement | null {
    const video = this.video;
    if (!video || !video.videoWidth) return null;
    const { sx, sy, sw, sh } = mapViewportToSurface(
      viewportRect,
      video.videoWidth,
      video.videoHeight,
      this.displaySurface,
    );
    const { canvas, ctx } = makeCanvas(sw, sh);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface CaptureContext {
  rect: ContentRect;
  objects: PageObject[];
  videoEl: HTMLVideoElement | null;
  youtubeVideoId?: string | undefined;
  /** viewport rect of the visible video content, for screen capture cropping */
  viewportRect: DOMRect | null;
  session: ScreenCaptureSession | null;
  /**
   * Hide the ink/UI overlay for exactly one grab. Screen-capture snapshots
   * would otherwise bake the on-screen ink and cursor into the "clean" frame.
   * If omitted, capture still proceeds but inkBaked is set true as a
   * last-resort (legacy behaviour).
   */
  hideOverlay?: (() => Promise<void> | void) | undefined;
  /** Restore the overlay after the grab (always called if hideOverlay ran). */
  restoreOverlay?: (() => Promise<void> | void) | undefined;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function captureSnapshot(ctxIn: CaptureContext): Promise<SnapshotInfo> {
  const { rect, videoEl, youtubeVideoId, viewportRect, session, hideOverlay, restoreOverlay } =
    ctxIn;

  // 1. Direct HTML5 video frame capture — always clean, native resolution.
  if (videoEl && videoEl.videoWidth) {
    try {
      const { canvas, ctx } = makeCanvas(videoEl.videoWidth, videoEl.videoHeight);
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const dataUrl = encodeOnce(canvas);
      if (dataUrl) {
        return {
          status: "captured",
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          captureMethod: "html5-video",
          inkBaked: false,
        };
      }
    } catch {
      /* fall through */
    }
  }

  // 2. User-authorised screen capture, cropped to the player region.
  if (session?.active && viewportRect) {
    let hidOverlay = false;
    try {
      if (hideOverlay) {
        await hideOverlay();
        hidOverlay = true;
        // give the browser one paint cycle to actually remove the overlay
        // before the video frame reflects it.
        await nextFrame();
        await nextFrame();
      }
      const grabbed = session.grab(viewportRect);
      const dataUrl = grabbed ? encodeOnce(grabbed) : null;
      if (grabbed && dataUrl) {
        return {
          status: "captured",
          dataUrl,
          width: grabbed.width,
          height: grabbed.height,
          captureMethod: "html5-video",
          // If we could hide the overlay before grabbing, the frame is clean.
          // Otherwise fall back to the legacy assumption that ink is baked in.
          inkBaked: !hideOverlay,
        };
      }
    } finally {
      if (hidOverlay) {
        try {
          await restoreOverlay?.();
        } catch {
          /* ignore */
        }
      }
    }
  }

  // 3. Reference-only: YouTube thumbnail behind the ink (never a real frame).
  if (youtubeVideoId) {
    try {
      const img = await loadImage(youtubeThumbnail(youtubeVideoId));
      const { canvas, ctx } = makeCanvas(img.naturalWidth || rect.width, img.naturalHeight || rect.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = encodeOnce(canvas);
      if (dataUrl) {
        return {
          status: "reference-only",
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          captureMethod: "youtube-thumbnail",
          inkBaked: false,
        };
      }
    } catch {
      /* fall through */
    }
  }

  // 4. Ink only — a flat placeholder background; no frame data available.
  try {
    const { canvas, ctx } = makeCanvas(rect.width, rect.height);
    ctx.fillStyle = "#11100e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const dataUrl = encodeOnce(canvas);
    if (dataUrl) {
      return {
        status: "unavailable",
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        captureMethod: "ink-only",
        inkBaked: false,
      };
    }
  } catch {
    /* ignore */
  }
  return { status: "failed", captureMethod: "none" };
}
