export const SCHEMA_VERSION = 2;

export type SourceType = "youtube" | "file" | "url";

/** Drawing / editing tools. */
export type ToolId =
  | "select" | "lasso" | "lassoEraser" | "move" | "pen" | "highlighter"
  | "eraser" | "freehandEraser" | "rectEraser" | "circleEraser" | "text"
  | "line" | "arrow" | "shape";
export type ToolKind = "pen" | "highlighter" | "eraser";

export type ShapeKind =
  | "line" | "arrow" | "doubleArrow" | "rect" | "roundRect" | "square"
  | "circle" | "ellipse" | "triangle" | "rightTriangle" | "diamond"
  | "star" | "polygon" | "arc" | "bracket" | "curlyBracket" | "callout";
export type LineStyle = "solid" | "dashed" | "dotted";
export type CapStyle = "none" | "arrow" | "filledArrow";
export type SnapshotStatus = "captured" | "reference-only" | "unavailable" | "pending" | "failed";

export interface InkPoint { x: number; y: number; pressure: number; }
interface ObjectBase { id: string; z: number; createdAt: number; }

export interface Stroke extends ObjectBase {
  kind: "stroke"; tool: "pen" | "highlighter"; color: string; opacity: number; size: number;
  pressureMode: "real" | "simulated"; thinning?: number; smoothing?: number;
  profile?: string;
  pressureExponent?: number; velocityResponse?: number;
  startTaper?: number; endTaper?: number;
  points: InkPoint[];
}

export interface ShapeObject extends ObjectBase {
  kind: "shape"; shape: ShapeKind; a: { x: number; y: number }; b: { x: number; y: number };
  color: string; fill?: string; opacity: number; size: number; lineStyle: LineStyle;
  startCap: CapStyle; endCap: CapStyle; sides?: number;
}

export interface TextObject extends ObjectBase {
  kind: "text"; x: number; y: number; w: number; h: number; text: string; fontSize: number;
  fontFamily: string; bold: boolean; italic: boolean; underline: boolean;
  align: "left" | "center" | "right"; color: string; background: string; border: string; opacity: number;
}
export type PageObject = Stroke | ShapeObject | TextObject;

export interface SnapshotInfo {
  status: SnapshotStatus;
  /** Video position represented by this captured frame, in seconds. */
  timestamp?: number;
  /** Stable source identity so a frame can be reopened against the same video. */
  sourceKey?: string;
  /** Clean frame/reference pixels only. Vector annotations are stored separately. */
  dataUrl?: string;
  width?: number;
  height?: number;
  captureMethod?: "html5-video" | "screen-capture" | "youtube-thumbnail" | "ink-only" | "none";
  /** True only for legacy/imported snapshots whose pixels already contain annotations. */
  inkBaked?: boolean;
}

export type PageType = "video" | "blank" | "custom";
export interface Page {
  id: string; schemaVersion: number; type: PageType; createdRank: number; currentOrder: number;
  title: string; notes?: string; sourceType?: SourceType; sourceKey?: string; sourceUrl?: string;
  youtubeVideoId?: string; videoTitle?: string; timestamp?: number; duration?: number;
  aspectRatio: number; objects: PageObject[]; snapshot: SnapshotInfo; thumbnail?: string;
  createdAt: number; updatedAt: number;
}

export interface Annotation {
  id: string; schemaVersion: number; sourceType: SourceType; sourceKey: string; sourceUrl?: string;
  youtubeVideoId?: string; title: string; timestamp: number; duration: number; videoAspectRatio: number;
  strokes: Stroke[]; snapshot: SnapshotInfo; createdAt: number; updatedAt: number;
}

export interface RecoveryDoc {
  id: "active"; pageId?: string; title: string; sourceType?: SourceType; sourceKey?: string;
  youtubeVideoId?: string; timestamp: number; duration: number; videoAspectRatio: number;
  objects: PageObject[]; updatedAt: number;
}

export interface VideoRecord {
  key: string; title: string; sourceType: SourceType; youtubeVideoId?: string;
  lastPosition: number; duration: number; updatedAt: number;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}
export function uid(): string { return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); }
