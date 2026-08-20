export const SCHEMA_VERSION = 2;

export type SourceType = "youtube" | "file" | "url";

/** Drawing / editing tools. */
export type ToolId =
  | "select"
  | "lasso"
  | "lassoEraser"
  | "move"
  | "pen"
  | "highlighter"
  | "eraser"
  | "freehandEraser"
  | "rectEraser"
  | "circleEraser"
  | "text"
  | "line"
  | "arrow"
  | "shape";

/** Legacy alias kept so older modules keep compiling. */
export type ToolKind = "pen" | "highlighter" | "eraser";

export type ShapeKind =
  | "line"
  | "arrow"
  | "doubleArrow"
  | "rect"
  | "roundRect"
  | "square"
  | "circle"
  | "ellipse"
  | "triangle"
  | "rightTriangle"
  | "diamond"
  | "star"
  | "polygon"
  | "arc"
  | "bracket"
  | "curlyBracket"
  | "callout";

export type LineStyle = "solid" | "dashed" | "dotted";
export type CapStyle = "none" | "arrow" | "filledArrow";

export type SnapshotStatus =
  | "captured"
  | "reference-only"
  | "unavailable"
  | "pending"
  | "failed";

export interface InkPoint {
  /** normalized 0..1 relative to the visible video content rect */
  x: number;
  y: number;
  pressure: number;
}

interface ObjectBase {
  id: string;
  /** z-order within the page; higher paints later */
  z: number;
  createdAt: number;
}

export interface Stroke extends ObjectBase {
  kind: "stroke";
  tool: "pen" | "highlighter";
  color: string;
  opacity: number;
  /** normalized size: fraction of the video content height */
  size: number;
  pressureMode: "real" | "simulated";
  /** perfect-freehand thinning (0..1); derived from the pressure setting */
  thinning?: number | undefined;
  /** extra outline smoothing (0..1) */
  smoothing?: number | undefined;
  /** pen profile id (ballpoint, pencil, marker, fountain, brush, technical…) */
  profile?: string | undefined;
  points: InkPoint[];
}

export interface ShapeObject extends ObjectBase {
  kind: "shape";
  shape: ShapeKind;
  /** normalized bounding corners (a may be > b; render handles it) */
  a: { x: number; y: number };
  b: { x: number; y: number };
  color: string;
  fill?: string | undefined;
  opacity: number;
  size: number;
  lineStyle: LineStyle;
  startCap: CapStyle;
  endCap: CapStyle;
  sides?: number | undefined;
}

export interface TextObject extends ObjectBase {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** font size as a fraction of content height */
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  color: string;
  background: string;
  border: string;
  opacity: number;
}

export type PageObject = Stroke | ShapeObject | TextObject;

export type SnapshotCaptureMethod =
  | "html5-video"
  | "screen-capture"
  | "youtube-thumbnail"
  | "ink-only"
  | "none";

export interface SnapshotInfo {
  status: SnapshotStatus;
  /** data URL containing ONLY the captured/reference frame pixels; annotations are stored separately */
  dataUrl?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  captureMethod?: SnapshotCaptureMethod | undefined;
  /** True only for legacy/imported snapshots whose pixels already contain annotations. */
  inkBaked?: boolean | undefined;
}

export type PageType = "video" | "blank" | "custom";

/** The single canonical document every view references. */
export interface Page {
  id: string;
  schemaVersion: number;
  type: PageType;
  /** permanent, never changes once assigned */
  createdRank: number;
  /** manual ordering, changed by drag & drop */
  currentOrder: number;
  title: string;
  notes?: string | undefined;
  sourceType?: SourceType | undefined;
  sourceKey?: string | undefined;
  sourceUrl?: string | undefined;
  sourceVideoId?: string | undefined;
  videoTitle?: string | undefined;
  timestamp?: number | undefined;
  duration?: number | undefined;
  aspectRatio?: number | undefined;
  snapshot: SnapshotInfo;
  objects: PageObject[];
  createdAt: number;
  updatedAt: number;
}

export interface VideoRecord {
  key: string;
  sourceType: SourceType;
  sourceUrl: string;
  title: string;
  duration?: number | undefined;
  lastUsedAt: number;
  createdAt: number;
}

export interface RecoveryDoc {
  version: 1;
  savedAt: number;
  pages: Page[];
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
