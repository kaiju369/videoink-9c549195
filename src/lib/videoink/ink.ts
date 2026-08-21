import getStroke from "perfect-freehand";
import type { Stroke } from "./types";
import type { ContentRect } from "./geometry";
import { PEN_PROFILES, type PenProfile } from "./prefs";
import { velocityPressure } from "./smooth";

export { PEN_PRESETS, INK_COLORS, type PenPreset } from "./prefs";

export const HIGHLIGHTER_COLORS = ["#ffd166", "#7ec8ff", "#8ce99a", "#ff8a7a"];

/**
 * Configurable pressure response curve. `exponent` < 1 boosts light touches
 * (more of the width range is used early), `exponent` > 1 requires more force
 * before the stroke widens. Exposed standalone so it stays unit-testable and
 * so callers (live preview + commit) always apply the identical curve.
 */
export function applyPressureCurve(pressure: number, exponent = 1): number {
  // Keep pressure finite and normalized. A tiny dead-zone prevents pointer
  // noise near zero from producing accidental hairline strokes, while still
  // preserving the full stylus range.
  const raw = Number.isFinite(pressure) ? pressure : 0.5;
  const p = Math.min(1, Math.max(0, raw));
  const deadZone = 0.02;
  const normalized = p <= deadZone ? 0 : (p - deadZone) / (1 - deadZone);
  const e = Number.isFinite(exponent) && exponent > 0 ? exponent : 1;
  if (e === 1) return normalized;
  return Math.pow(normalized, e);
}

const FALLBACK_PROFILE: PenProfile = PEN_PROFILES.ballpoint;

function resolveProfile(stroke: Stroke): PenProfile {
  if (stroke.tool === "highlighter") return PEN_PROFILES.highlighter;
  const id = stroke.profile as keyof typeof PEN_PROFILES | undefined;
  return (id && PEN_PROFILES[id]) || FALLBACK_PROFILE;
}

/**
 * INVARIANT: the exact same options object shape (including `last: true`) is
 * produced here for both the live in-progress preview and the final commit
 * render. If live preview ever passed `last: false` the tip of the stroke
 * would visibly jump in width the instant the pen lifts. Both drawStroke's
 * live and committed paths call this same function with `last: true`.
 */
function strokeOptions(stroke: Stroke, sizePx: number) {
  const profile = resolveProfile(stroke);
  // Keep profile response centralized so every pen uses the same pressure
  // semantics and tuning remains deterministic across preview/commit.
  const pressureScale = Math.max(0.1, Math.min(2, profile.widthScale));
  const effectiveSize = Math.max(1, sizePx * pressureScale);
  if (stroke.tool === "highlighter") {
    return {
      size: effectiveSize,
      thinning: 0,
      smoothing: profile.smoothing,
      streamline: profile.streamline,
      simulatePressure: false,
      easing: (t: number) => t,
      last: true,
    };
  }

  const thinning = stroke.thinning ?? profile.thinning;
  const smoothing = stroke.smoothing ?? profile.smoothing;

  return {
    size: effectiveSize,
    thinning,
    smoothing,
    streamline: profile.streamline,
    // Pressure is pre-computed (real stylus curve applied, or synthesised
    // from velocity) before being handed to perfect-freehand, so we never
    // let perfect-freehand's own simulation double up on our curve.
    simulatePressure: false,
    easing: (t: number) => Math.sin((t * Math.PI) / 2),
    start: { taper: Math.max(0, profile.startTaper) * effectiveSize * 4, cap: profile.cap },
    end: { taper: Math.max(0, profile.endTaper) * effectiveSize * 4, cap: profile.cap },
    last: true,
  };
}

/** Deterministic per-stroke PRNG (mulberry32) seeded from the stroke id. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pre-computed pressure pipeline shared by the live preview and the commit path. */
function computedPressurePoints(stroke: Stroke) {
  const profile = resolveProfile(stroke);
  const real = stroke.pressureMode === "real";
  let pts = stroke.points;
  if (!real && stroke.tool !== "highlighter" && profile.velocityResponse > 0) {
    pts = velocityPressure(pts, profile.velocityResponse);
  }
  return pts.map((p) => ({
    ...p,
    pressure: applyPressureCurve(p.pressure, profile.pressureExponent),
  }));
}

export function strokeToPath2D(
  stroke: Stroke,
  rect: ContentRect,
  opts?: { live?: boolean },
): Path2D | null {
  void opts;
  if (stroke.points.length === 0) return null;
  const profile = resolveProfile(stroke);
  const sizePx =
    stroke.tool === "highlighter"
      ? Math.max(1, stroke.size * rect.height) * profile.widthScale
      : Math.max(1, stroke.size * rect.height) * profile.widthScale;
  const pressurePts = computedPressurePoints(stroke);
  const input = pressurePts.map((p) => [
    rect.left + p.x * rect.width,
    rect.top + p.y * rect.height,
    p.pressure,
  ]);
  const outline = getStroke(input, strokeOptions(stroke, sizePx));
  if (outline.length < 2) return null;
  const path = new Path2D();
  const first = outline[0]!;
  path.moveTo(first[0]!, first[1]!);
  // Quadratic segments through midpoints — removes the faceted look that plain
  // lineTo() leaves on the outline.
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    path.quadraticCurveTo(a[0]!, a[1]!, (a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2);
  }
  path.closePath();
  return path;
}

/** Cheap, deterministic stippled grain texture — no per-frame randomness. */
function drawGrain(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  rect: ContentRect,
  path: Path2D,
  grain: number,
) {
  const rng = seededRandom(stroke.id);
  ctx.save();
  ctx.clip(path);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = stroke.opacity * grain * 0.5;
  ctx.fillStyle = "#000000";
  const bx0 = rect.left;
  const by0 = rect.top;
  const bw = rect.width;
  const bh = rect.height;
  const speckCount = Math.min(600, Math.round(stroke.points.length * 6 * grain));
  for (let i = 0; i < speckCount; i++) {
    const x = bx0 + rng() * bw;
    const y = by0 + rng() * bh;
    const r = 0.4 + rng() * 0.8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  rect: ContentRect,
  opts?: { live?: boolean },
) {
  const path = strokeToPath2D(stroke, rect, opts);
  if (!path) return;
  const profile = resolveProfile(stroke);
  ctx.save();
  ctx.globalAlpha = stroke.opacity * profile.opacity;
  ctx.globalCompositeOperation =
    stroke.tool === "highlighter" ? "multiply" : "source-over";
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
  ctx.restore();

  if (stroke.tool !== "highlighter" && profile.grain > 0) {
    drawGrain(ctx, stroke, rect, path, profile.grain);
  }
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  rect: ContentRect,
  opts?: { live?: boolean },
) {
  for (const s of strokes) drawStroke(ctx, s, rect, opts);
}

/** Hit test used by the stroke eraser. */
export function strokeHitsPoint(
  stroke: Stroke,
  x: number,
  y: number,
  radius: number,
): boolean {
  const r = radius + stroke.size * 0.8;
  for (const p of stroke.points) {
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}
