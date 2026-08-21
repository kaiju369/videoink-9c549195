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

function encodeOnce(canvas: HTMLCanvasElement): string | null {
  try {
    const pixels = canvas.width * canvas.height;
    if (pixels <= PNG_PIXEL_BUDGET) return canvas.toDataURL("image/png");
    return canvas.toDataURL("image/jpeg", 0.94);
  } catch {
    return null;
  }
}

export function describeSnapshot(
  status: SnapshotInfo["status"],
  method: SnapshotInfo["captureMethod"],
): string {
  switch (status) {
    case "captured":
      return method === "html5-video"
        ? "Captured directly from the video frame."
        : method === "screen-capture"
          ? "Captured from the authorised screen-share stream."
          : "Captured from the video source.";
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

export interface SurfaceMapping {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

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
    const chromeX = window.screenX ?? 0;
    const chromeTop = window.outerHeight - window.innerHeight || 0;
    originX = chromeX;
    originY = (window.screenY ?? 0) + chromeTop;
  }

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
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  }

  async start(onEnded?: () => void) {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
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
    this.displaySurface = (track?.getSettings() as MediaTrackSettings & { displaySurface?: string })?.displaySurface;
    track?.addEventListener("ended", () => this.handleEnded());
  }

  private handleEnded() {
    if (this.ended) return;
    this.ended = true;
    this.stop();
    this.onEndedCb?.();
  }

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

export type VideoCaptureCapability =
  | "direct-html5"
  | "screen-capture"
  | "youtube-reference"
  | "unavailable";

export interface VideoCaptureCapabilities {
  directHtml5: boolean;
  screenCapture: boolean;
  youtubeReference: boolean;
}

export function getVideoCaptureCapabilities(
  video: HTMLVideoElement | null,
  youtubeVideoId: string | undefined,
): VideoCaptureCapabilities {
  return {
    directHtml5: canCaptureDecodedVideoFrame(video),
    screenCapture: ScreenCaptureSession.supported,
    youtubeReference: !!youtubeVideoId,
  };
}



export interface CaptureDecision {
  method: VideoCaptureCapability;
  actualFramePossible: boolean;
  reason: string;
}

export function explainVideoCapture(
  video: HTMLVideoElement | null,
  youtubeVideoId?: string,
): CaptureDecision {
  const capabilities = getVideoCaptureCapabilities(video, youtubeVideoId);
  if (capabilities.directHtml5) {
    return {
      method: "direct-html5",
      actualFramePossible: true,
      reason: "The browser exposes decoded video pixels, so the frame can be captured directly without screen capture.",
    };
  }
  if (capabilities.screenCapture) {
    return {
      method: "screen-capture",
      actualFramePossible: true,
      reason: "Direct media pixels are unavailable; authorised display capture can capture the visible video surface.",
    };
  }
  if (capabilities.youtubeReference) {
    return {
      method: "youtube-reference",
      actualFramePossible: false,
      reason: "Only a YouTube thumbnail/reference image is available; this is not the exact playback frame.",
    };
  }
  return {
    method: "unavailable",
    actualFramePossible: false,
    reason: "No supported frame-capture path is currently available.",
  };
}

export function preferredVideoCaptureMethod(
  capabilities: VideoCaptureCapabilities,
): VideoCaptureCapability {
  if (capabilities.directHtml5) return "direct-html5";
  if (capabilities.screenCapture) return "screen-capture";
  if (capabilities.youtubeReference) return "youtube-reference";
  return "unavailable";
}

export function canCaptureDecodedVideoFrame(video: HTMLVideoElement | null): boolean {
  return !!video &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0;
}

export interface CaptureContext {
  rect: ContentRect;
  objects: PageObject[];
  videoEl: HTMLVideoElement | null;
  youtubeVideoId?: string | undefined;
  sourceKey?: string | undefined;
  timestamp?: number | undefined;
  viewportRect: DOMRect | null;
  session: ScreenCaptureSession | null;
  hideOverlay?: (() => Promise<void> | void) | undefined;
  restoreOverlay?: (() => Promise<void> | void) | undefined;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Wait until the decoded video frame is current before drawing it. This avoids
 * capturing the previous decoded frame after a seek. requestVideoFrameCallback
 * is preferred because it is tied to the media decoder rather than the UI
 * refresh loop; the animation-frame fallback keeps older browsers working.
 */
async function waitForDecodedVideoFrame(video: HTMLVideoElement): Promise<void> {
  type VideoWithRVFC = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, metadata: VideoFrameCallbackMetadata) => void) => number;
  };
  const v = video as VideoWithRVFC;
  if (typeof v.requestVideoFrameCallback === "function") {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      v.requestVideoFrameCallback(() => finish());
      // A paused frame may already be decoded and never advance. Do not hang.
      window.setTimeout(finish, 120);
    });
  } else {
    await nextFrame();
    await nextFrame();
  }
}

/**
 * Hide canvas overlays that occupy the captured viewport when the caller did
 * not provide explicit callbacks. This is a defensive fallback for the
 * existing UI and prevents canonical screen captures from baking annotations.
 */
function hideCanvasOverlays(viewportRect: DOMRect): () => void {
  const changed: Array<{ el: HTMLElement; visibility: string }> = [];
  const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas"));
  for (const canvas of canvases) {
    const box = canvas.getBoundingClientRect();
    const overlaps =
      box.width > 0 &&
      box.height > 0 &&
      box.left < viewportRect.right &&
      box.right > viewportRect.left &&
      box.top < viewportRect.bottom &&
      box.bottom > viewportRect.top;
    if (!overlaps) continue;
    changed.push({ el: canvas, visibility: canvas.style.visibility });
    canvas.style.visibility = "hidden";
  }
  return () => {
    for (const item of changed) item.el.style.visibility = item.visibility;
  };
}

export async function captureSnapshot(ctxIn: CaptureContext): Promise<SnapshotInfo> {
  const { rect, videoEl, youtubeVideoId, viewportRect, session, hideOverlay, restoreOverlay } = ctxIn;

  if (videoEl && videoEl.videoWidth && videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    try {
      await waitForDecodedVideoFrame(videoEl);
      const { canvas, ctx } = makeCanvas(videoEl.videoWidth, videoEl.videoHeight);
      // Draw only the decoded media surface. No browser chrome, player UI,
      // annotations, controls, or surrounding window pixels can enter this
      // canvas.
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const dataUrl = encodeOnce(canvas);
      if (dataUrl) {
        return {
          status: "captured",
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          captureMethod: "html5-video",
          timestamp,
          sourceKey,
          inkBaked: false,
        };
      }
    } catch {
      /* fall through */
    }
  }

  if (session?.active && viewportRect) {
    let restore: (() => void) | null = null;
    let explicitHide = false;
    try {
      if (hideOverlay) {
        await hideOverlay();
        explicitHide = true;
      } else {
        restore = hideCanvasOverlays(viewportRect);
      }
      await nextFrame();
      await nextFrame();

      const grabbed = session.grab(viewportRect);
      const dataUrl = grabbed ? encodeOnce(grabbed) : null;
      if (grabbed && dataUrl) {
        return {
          status: "captured",
          dataUrl,
          width: grabbed.width,
          height: grabbed.height,
          captureMethod: "screen-capture",
          timestamp,
          sourceKey,
          inkBaked: false,
        };
      }
    } finally {
      try {
        if (explicitHide) await restoreOverlay?.();
      } finally {
        restore?.();
      }
    }
  }

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
          timestamp,
          sourceKey,
          inkBaked: false,
        };
      }
    } catch {
      /* fall through */
    }
  }

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


/**
 * Export a previously captured clean video frame as an image.
 * This operates on the stored frame data, never on the DOM/screen.
 */
export function downloadCleanFrame(
  snapshot: SnapshotInfo,
  filename = "videoink-frame",
): boolean {
  if (!snapshot.dataUrl || snapshot.status !== "captured") return false;
  const a = document.createElement("a");
  a.href = snapshot.dataUrl;
  a.download = `${filename.replace(/[^a-z0-9._-]+/gi, "_")}.png`;
  a.click();
  return true;
}

export function captureStatusLabel(decision: CaptureDecision): string {
  if (decision.method === "direct-html5") return "Direct frame capture";
  if (decision.method === "screen-capture") return "Screen capture fallback";
  if (decision.method === "youtube-reference") return "YouTube thumbnail fallback (not exact frame)";
  return "Frame capture unavailable";
}
