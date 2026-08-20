import type { InkPoint } from "./types";

/**
 * Ink smoothing pipeline modelled on the feel of OneNote / Xournal++ / rnote:
 *   live low-pass filter  ->  distance gate  ->  arc-length resample  ->  Chaikin
 * The result is a dense, evenly spaced polyline that perfect-freehand can turn
 * into a clean tapered outline without visible wobble or corner artefacts.
 */

/**
 * Sub-pixel input gate. On a 1080-tall stage 0.0004 normalized units is well
 * under half a device pixel, so we keep essentially every distinct sample the
 * digitiser reports and let the filter (not a coarse distance gate) remove
 * jitter. A large gate was the source of visible faceting on slow strokes.
 */
const MIN_STEP = 0.0004;

export function pointDistance(a: InkPoint, b: InkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * One-euro filter: adaptive low-pass whose cutoff rises with speed. Slow
 * motion gets heavy smoothing (kills stylus tremor at pixel scale), fast
 * motion gets almost none (no lag, no corner rounding).
 */
export class InkFilter {
  private last: InkPoint | null = null;
  private lastRaw: InkPoint | null = null;
  private lastSpeed = 0;

  constructor(private strength = 0.5) {}

  reset() {
    this.last = null;
    this.lastRaw = null;
    this.lastSpeed = 0;
  }

  /** Returns the filtered point, or null when the sample is too close to keep. */
  push(p: InkPoint, force = false): InkPoint | null {
    if (!this.last || !this.lastRaw) {
      this.last = { ...p };
      this.lastRaw = { ...p };
      return this.last;
    }
    const raw = pointDistance(p, this.lastRaw);
    if (!force && raw < MIN_STEP) return null;
    this.lastRaw = { ...p };

    // Smooth the speed estimate itself, otherwise the adaptive cutoff jitters
    // and reintroduces the wobble we are trying to remove.
    this.lastSpeed = this.lastSpeed * 0.6 + raw * 0.4;

    const s = Math.min(1, Math.max(0, this.strength));
    // minCutoff -> how much a stationary pen is smoothed; beta -> how fast the
    // filter opens up as the pen accelerates.
    const minAlpha = 0.08 + 0.22 * (1 - s);
    const beta = 55 + 35 * (1 - s);
    const alpha = Math.min(1, minAlpha + this.lastSpeed * beta);

    const out: InkPoint = {
      x: this.last.x + alpha * (p.x - this.last.x),
      y: this.last.y + alpha * (p.y - this.last.y),
      pressure: this.last.pressure + 0.25 * (p.pressure - this.last.pressure),
    };
    this.last = out;
    return out;
  }
}


/** Remove duplicate / near-duplicate samples. */
export function dedupe(points: InkPoint[], eps = 1e-5): InkPoint[] {
  const out: InkPoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || pointDistance(last, p) > eps) out.push(p);
  }
  return out;
}

/** Uniform arc-length resampling with linear pressure interpolation. */
export function resample(points: InkPoint[], spacing: number): InkPoint[] {
  if (points.length < 2 || spacing <= 0) return points.slice();
  const out: InkPoint[] = [{ ...points[0]! }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    let seg = pointDistance(a, b);
    if (seg <= 0) continue;
    let t = 0;
    while (carry + seg >= spacing) {
      const need = (spacing - carry) / seg;
      t += need * (1 - t);
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        pressure: a.pressure + (b.pressure - a.pressure) * t,
      });
      seg = pointDistance(out[out.length - 1]!, b);
      carry = 0;
    }
    carry += seg;
  }
  const last = points[points.length - 1]!;
  if (pointDistance(out[out.length - 1]!, last) > spacing * 0.35) out.push({ ...last });
  return out;
}

/** Chaikin corner cutting; endpoints preserved. */
export function chaikin(points: InkPoint[], iterations = 1): InkPoint[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) return pts;
    const next: InkPoint[] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      next.push(
        {
          x: a.x * 0.75 + b.x * 0.25,
          y: a.y * 0.75 + b.y * 0.25,
          pressure: a.pressure * 0.75 + b.pressure * 0.25,
        },
        {
          x: a.x * 0.25 + b.x * 0.75,
          y: a.y * 0.25 + b.y * 0.75,
          pressure: a.pressure * 0.25 + b.pressure * 0.75,
        },
      );
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
  }
  return pts;
}

/** Moving-average pass over pressure only, so width changes stay gradual. */
export function smoothPressure(points: InkPoint[], window = 4): InkPoint[] {
  if (points.length < 3) return points;
  return points.map((p, i) => {
    let sum = 0;
    let n = 0;
    for (let k = i - window; k <= i + window; k++) {
      const q = points[k];
      if (!q) continue;
      sum += q.pressure;
      n++;
    }
    return { ...p, pressure: n ? sum / n : p.pressure };
  });
}

/**
 * Synthesise a pressure signal from local speed for mouse/touch input:
 * slower motion -> higher (wider) pressure, faster motion -> lower (thinner).
 * `response` (0..1, profile.velocityResponse) controls how strongly speed
 * affects the synthesised pressure; 0 leaves pressure untouched.
 */
export function velocityPressure(points: InkPoint[], response = 0.3): InkPoint[] {
  if (response <= 0 || points.length < 2) return points;
  const speeds: number[] = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    speeds[i] = pointDistance(points[i]!, points[i - 1]!);
  }
  speeds[0] = speeds[1] ?? 0;
  // Smooth the speed signal so width changes stay gradual rather than jittery.
  const win = 3;
  const smoothed = speeds.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = i - win; k <= i + win; k++) {
      const s = speeds[k];
      if (s === undefined) continue;
      sum += s;
      n++;
    }
    return n ? sum / n : 0;
  });
  const maxSpeed = Math.max(...smoothed, 1e-6);
  return points.map((p, i) => {
    const norm = Math.min(1, smoothed[i]! / maxSpeed);
    // slower (norm near 0) -> pressure boosted toward 1; faster -> thinner.
    const synth = 1 - norm;
    const pressure = p.pressure * (1 - response) + synth * response;
    return { ...p, pressure: Math.min(1, Math.max(0.05, pressure)) };
  });
}

/**
 * Final commit-time smoothing. `amount` is 0..1 (prefs.smoothing or a pen
 * profile's `smoothing`/`streamline` blend). Idempotent-ish: running it twice
 * on an already-smoothed stroke produces a near-identical result because
 * spacing and iteration count are derived purely from `amount`, not from the
 * input density.
 */
export function smoothStroke(points: InkPoint[], amount = 0.5): InkPoint[] {
  const clean = dedupe(points, 2e-6);
  if (clean.length < 3) return clean;
  const clampedAmount = Math.min(1, Math.max(0, amount));
  // Dense, sub-pixel resampling: ~1px at 1080p even at max smoothing, so the
  // committed outline matches the live preview curve exactly.
  const spacing = 0.0009 + 0.0016 * clampedAmount;
  const resampled = resample(clean, spacing);
  const iterations = clampedAmount > 0.66 ? 2 : clampedAmount > 0.15 ? 1 : 0;
  const smoothed = iterations ? chaikin(resampled, iterations) : resampled;
  // Bound extremely long strokes so perfect-freehand / rendering stays cheap.
  const MAX_POINTS = 2600;

  const capped =
    smoothed.length > MAX_POINTS
      ? resample(smoothed, spacing * (smoothed.length / MAX_POINTS))
      : smoothed;
  return smoothPressure(capped, 3);
}
