import type { CapStyle, LineStyle, ShapeKind, ToolId } from "./types";

export interface PenPreset {
  id: string;
  label: string;
  size: number; // fraction of content height
}

export const PEN_PRESETS: PenPreset[] = [
  { id: "fine", label: "Fine", size: 0.004 },
  { id: "medium", label: "Medium", size: 0.008 },
  { id: "bold", label: "Bold", size: 0.016 },
];

export const INK_COLORS = [
  "#f5f1e8",
  "#ffd166",
  "#7ec8ff",
  "#ff8a7a",
  "#8ce99a",
  "#c79bff",
  "#111111",
];

/** Canonical palette shared by pen, highlighter, shapes and text. */
export const PALETTE: { name: string; hex: string }[] = [
  { name: "Black", hex: "#111111" },
  { name: "White", hex: "#f5f1e8" },
  { name: "Red", hex: "#ef4444" },
  { name: "Orange", hex: "#f97316" },
  { name: "Yellow", hex: "#ffd166" },
  { name: "Green", hex: "#22c55e" },
  { name: "Cyan", hex: "#22d3ee" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Pink", hex: "#ec4899" },
];

/* ------------------------------------------------------------------ */
/* pen profiles                                                        */
/* ------------------------------------------------------------------ */

export type PenProfileId =
  | "ballpoint"
  | "pencil"
  | "marker"
  | "fountain"
  | "brush"
  | "highlighter"
  | "technical";

export interface PenProfile {
  id: PenProfileId;
  label: string;
  /** multiplier applied to the configured pen size */
  widthScale: number;
  opacity: number;
  /** perfect-freehand thinning at pressure sensitivity "medium" */
  thinning: number;
  smoothing: number;
  streamline: number;
  /** pressure curve exponent: <1 boosts light touches, >1 needs more force */
  pressureExponent: number;
  /** how much stroke speed thins the line (0 = none) */
  velocityResponse: number;
  startTaper: number;
  endTaper: number;
  cap: boolean;
  /** subtle grain, used by the pencil profile */
  grain: number;
}

export const PEN_PROFILES: Record<PenProfileId, PenProfile> = {
  ballpoint: {
    id: "ballpoint",
    label: "Ballpoint",
    widthScale: 1.00,
    opacity: 1,
    thinning: 0.28,
    smoothing: 0.48,
    streamline: 0.24,
    pressureExponent: 1.00,
    velocityResponse: 0.08,
    startTaper: 0,
    endTaper: 0,
    cap: true,
    grain: 0,
  },
  pencil: {
    id: "pencil",
    label: "Pencil",
    widthScale: 0.90,
    opacity: 0.82,
    thinning: 0.48,
    smoothing: 0.32,
    streamline: 0.16,
    pressureExponent: 0.78,
    velocityResponse: 0.22,
    startTaper: 0,
    endTaper: 0,
    cap: true,
    grain: 0.48,
  },
  marker: {
    id: "marker",
    label: "Marker",
    widthScale: 1.55,
    opacity: 1,
    thinning: 0.05,
    smoothing: 0.68,
    streamline: 0.48,
    pressureExponent: 1.05,
    velocityResponse: 0,
    startTaper: 0,
    endTaper: 0,
    cap: true,
    grain: 0,
  },
  fountain: {
    id: "fountain",
    label: "Fountain pen",
    widthScale: 1.10,
    opacity: 1,
    thinning: 0.68,
    smoothing: 0.52,
    streamline: 0.24,
    pressureExponent: 0.78,
    velocityResponse: 0.28,
    startTaper: 0.28,
    endTaper: 0.62,
    cap: true,
    grain: 0,
  },
  brush: {
    id: "brush",
    label: "Brush",
    widthScale: 1.75,
    opacity: 1,
    thinning: 0.78,
    smoothing: 0.62,
    streamline: 0.38,
    pressureExponent: 0.68,
    velocityResponse: 0.42,
    startTaper: 0.42,
    endTaper: 0.82,
    cap: true,
    grain: 0,
  },
  highlighter: {
    id: "highlighter",
    label: "Highlighter",
    widthScale: 3.0,
    opacity: 0.32,
    thinning: 0,
    smoothing: 0.58,
    streamline: 0.28,
    pressureExponent: 1,
    velocityResponse: 0,
    startTaper: 0,
    endTaper: 0,
    cap: false,
    grain: 0,
  },
  technical: {
    id: "technical",
    label: "Technical pen",
    widthScale: 0.78,
    opacity: 1,
    thinning: 0,
    smoothing: 0.44,
    streamline: 0.56,
    pressureExponent: 1.0,
    velocityResponse: 0,
    startTaper: 0,
    endTaper: 0,
    cap: true,
    grain: 0,
  },
};

export const PEN_PROFILE_LIST = Object.values(PEN_PROFILES);

export type PressureLevel = "off" | "low" | "medium" | "high";

export interface ToolPreset {
  id: string;
  name: string;
  tool: ToolId;
  color: string;
  size: number;
  opacity: number;
  pressure: PressureLevel;
}

export interface Prefs {
  tool: ToolId;
  penSize: number;
  penColor: string;
  highlighterSize: number;
  highlighterColor: string;
  highlighterOpacity: number;
  shapeSize: number;
  shapeKind: ShapeKind;
  /** Whether shape/line/arrow tools are shown in the main toolbar. */
  showShapeTools: boolean;
  /** Whether the main annotation toolbar is visible. */
  showToolbar: boolean;
  lineStyle: LineStyle;
  startCap: CapStyle;
  endCap: CapStyle;
  shapeFill: boolean;
  eraserMode: "stroke" | "freehand" | "rect" | "circle" | "lasso";
  eraserSize: number;
  pressure: PressureLevel;
  smoothing: number;
  recognize: boolean;
  /** show a toast/label whenever a stroke is converted to a shape */
  recognizeFeedback: boolean;
  touchDrawing: boolean;
  /** active pen profile for the pen tool */
  penProfile: PenProfileId;
  text: {
    fontSize: number;
    fontFamily: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    align: "left" | "center" | "right";
    color: string;
    background: string;
    border: string;
  };
  recentColors: string[];
  favoriteColors: string[];
  presets: ToolPreset[];
  libraryView: "smallGrid" | "largeGrid" | "list" | "detail";
  librarySort: "creation" | "newest" | "oldest" | "manual" | "timestamp" | "modified";
  exportFormat: "png" | "jpeg" | "pdf" | "zip" | "json";
  filenameTemplate: string;
  captureReminder: boolean;
  /** export resolution: "native" keeps the stored frame resolution */
  exportResolution: "native" | "720" | "1080" | "1440" | "2160" | "custom";
  exportCustomWidth: number;
  jpegQuality: number;
  /** optional metadata burned into exports; all off by default */
  exportMeta: {
    title: boolean;
    timestamp: boolean;
    pageNumbers: boolean;
  };
  /** floating radial tool dock */
  dock: {
    enabled: boolean;
    /** normalized viewport position 0..1 of the button centre */
    x: number;
    y: number;
    open: boolean;
    tool: ToolId;
    color: string;
  };
}


export const DEFAULT_PREFS: Prefs = {
  tool: "pen",
  penSize: PEN_PRESETS[1]!.size,
  penColor: INK_COLORS[0]!,
  highlighterSize: 0.012,
  highlighterColor: "#ffd166",
  highlighterOpacity: 0.35,
  shapeSize: 0.005,
  shapeKind: "rect",
  showShapeTools: true,
  showToolbar: true,
  lineStyle: "solid",
  startCap: "none",
  endCap: "none",
  shapeFill: false,
  eraserMode: "stroke",
  eraserSize: 0.02,
  pressure: "medium",
  smoothing: 0.5,
  recognize: false,
  recognizeFeedback: true,
  touchDrawing: true,
  penProfile: "ballpoint",
  exportResolution: "native",
  exportCustomWidth: 1920,
  jpegQuality: 0.92,
  exportMeta: { title: false, timestamp: false, pageNumbers: false },
  dock: {
    enabled: true,
    x: 0.92,
    y: 0.62,
    open: false,
    tool: "pen",
    color: "#f5f1e8",
  },
  text: {
    fontSize: 0.05,
    fontFamily: "Inter, system-ui, sans-serif",
    bold: false,
    italic: false,
    underline: false,
    align: "left",
    color: "#f5f1e8",
    background: "transparent",
    border: "transparent",
  },
  recentColors: [],
  favoriteColors: INK_COLORS.slice(0, 5),
  presets: [
    {
      id: "p-lecture",
      name: "Lecture pen",
      tool: "pen",
      color: "#f5f1e8",
      size: 0.008,
      opacity: 1,
      pressure: "high",
    },
    {
      id: "p-highlight",
      name: "Highlight",
      tool: "highlighter",
      color: "#ffd166",
      size: 0.014,
      opacity: 0.35,
      pressure: "off",
    },
    {
      id: "p-diagram",
      name: "Diagram arrow",
      tool: "arrow",
      color: "#7ec8ff",
      size: 0.005,
      opacity: 1,
      pressure: "off",
    },
  ],
  libraryView: "smallGrid",
  librarySort: "manual",
  exportFormat: "pdf",
  filenameTemplate: "{videoTitle}_{date}_{type}",
  captureReminder: true,
};

const KEY = "videoink.prefs.v1";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Accept only safe CSS colour literals coming from storage or imported data. */
export function isSafeColor(value: unknown): value is string {
  return typeof value === "string" && (HEX_RE.test(value) || value === "transparent");
}

const clamp01 = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFS;
    const merged: Prefs = {
      ...DEFAULT_PREFS,
      ...parsed,
      text: { ...DEFAULT_PREFS.text, ...parsed.text },
      exportMeta: { ...DEFAULT_PREFS.exportMeta, ...parsed.exportMeta },
      dock: { ...DEFAULT_PREFS.dock, ...parsed.dock },
    };
    // Sanitise anything that is fed straight into canvas / CSS.
    if (!isSafeColor(merged.penColor)) merged.penColor = DEFAULT_PREFS.penColor;
    if (!isSafeColor(merged.highlighterColor))
      merged.highlighterColor = DEFAULT_PREFS.highlighterColor;
    if (!isSafeColor(merged.text.color)) merged.text.color = DEFAULT_PREFS.text.color;
    if (!isSafeColor(merged.text.background))
      merged.text.background = DEFAULT_PREFS.text.background;
    if (!isSafeColor(merged.text.border)) merged.text.border = DEFAULT_PREFS.text.border;
    if (!isSafeColor(merged.dock.color)) merged.dock.color = DEFAULT_PREFS.dock.color;
    merged.recentColors = (Array.isArray(merged.recentColors) ? merged.recentColors : [])
      .filter(isSafeColor)
      .slice(0, 12);
    merged.favoriteColors = (Array.isArray(merged.favoriteColors) ? merged.favoriteColors : [])
      .filter(isSafeColor)
      .slice(0, 12);
    if (!PEN_PROFILES[merged.penProfile]) merged.penProfile = DEFAULT_PREFS.penProfile;
    merged.dock.x = clamp01(merged.dock.x, DEFAULT_PREFS.dock.x);
    merged.dock.y = clamp01(merged.dock.y, DEFAULT_PREFS.dock.y);
    merged.smoothing = clamp01(merged.smoothing, DEFAULT_PREFS.smoothing);
    merged.jpegQuality = Math.min(
      1,
      Math.max(0.3, clamp01(merged.jpegQuality, DEFAULT_PREFS.jpegQuality)),
    );
    merged.exportCustomWidth = Math.min(
      7680,
      Math.max(240, Math.round(Number(merged.exportCustomWidth) || DEFAULT_PREFS.exportCustomWidth)),
    );
    merged.eraserSize = Math.min(0.25, Math.max(0.004, Number(merged.eraserSize) || 0.02));
    return merged;
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Push a colour to the front of the recent list (deduped, capped). */
export function pushRecentColor(list: string[], color: string): string[] {
  if (!isSafeColor(color)) return list;
  return [color, ...list.filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, 10);
}


export function savePrefs(p: Prefs): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    // Preferences are non-critical; the editor must continue working even when
    // storage is disabled, private-mode restricted, or quota-limited.
    return false;
  }
}

/** Remove only VideoInk preferences; used by recovery/reset flows. */
export function clearPrefs(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

export function pressureFactor(level: PressureLevel, pressure: number): number {
  if (level === "off") return 1;
  const amount = level === "low" ? 0.25 : level === "medium" ? 0.5 : 0.85;
  return 1 - amount + amount * (pressure * 2);
}

/**
 * How strongly stylus pressure modulates stroke width (perfect-freehand
 * `thinning`). Applied per point, not as a whole-stroke scale factor.
 */
export function pressureThinning(level: PressureLevel): number {
  switch (level) {
    case "off":
      return 0;
    case "low":
      return 0.25;
    case "high":
      return 0.72;
    default:
      return 0.48;
  }
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 120) || "VideoInk";
}

export function applyTemplate(
  template: string,
  vars: { videoTitle: string; date: string; type: string },
): string {
  return sanitizeFilename(
    template
      .replace(/\{videoTitle\}/g, vars.videoTitle)
      .replace(/\{date\}/g, vars.date)
      .replace(/\{type\}/g, vars.type),
  );
}
