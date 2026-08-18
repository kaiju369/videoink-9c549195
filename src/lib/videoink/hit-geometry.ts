/**
 * Real-geometry intersection helpers used by the eraser tools. Everything
 * here operates in normalized (0..1) content space and is defensive against
 * NaN/Infinity/empty input so malformed strokes never throw.
 */
import type { Box, Pt } from "./objects";

const finite = (n: number) => Number.isFinite(n);
const validPt = (p: Pt | undefined | null): p is Pt =>
  !!p && finite(p.x) && finite(p.y);

export function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return Math.hypot(p.x - qx, p.y - qy);
}

/** Closed segment-segment intersection test. */
export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1x = b.x - a.x;
  const d1y = b.y - a.y;
  const d2x = d.x - c.x;
  const d2y = d.y - c.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return false;
  const t = ((c.x - a.x) * d2y - (c.y - a.y) * d2x) / denom;
  const u = ((c.x - a.x) * d1y - (c.y - a.y) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function segmentIntersectsBox(a: Pt, b: Pt, box: Box): boolean {
  if (!validPt(a) || !validPt(b)) return false;
  // Either endpoint inside the box…
  const inside = (p: Pt) => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;
  if (inside(a) || inside(b)) return true;
  // …or the segment crosses one of the four box edges.
  const c1 = { x: box.x0, y: box.y0 };
  const c2 = { x: box.x1, y: box.y0 };
  const c3 = { x: box.x1, y: box.y1 };
  const c4 = { x: box.x0, y: box.y1 };
  return (
    segmentsIntersect(a, b, c1, c2) ||
    segmentsIntersect(a, b, c2, c3) ||
    segmentsIntersect(a, b, c3, c4) ||
    segmentsIntersect(a, b, c4, c1)
  );
}

export function segmentIntersectsCircle(a: Pt, b: Pt, c: Pt, r: number): boolean {
  if (!validPt(a) || !validPt(b) || !validPt(c) || !finite(r)) return false;
  return segmentDistance(c, a, b) <= r;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  if (!validPt(p) || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (!validPt(a) || !validPt(b)) continue;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function segmentIntersectsPolygon(a: Pt, b: Pt, poly: Pt[]): boolean {
  if (!validPt(a) || !validPt(b) || poly.length < 2) return false;
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i]!;
    const p1 = poly[(i + 1) % poly.length]!;
    if (!validPt(p0) || !validPt(p1)) continue;
    if (segmentsIntersect(a, b, p0, p1)) return true;
  }
  return false;
}

/** True if any consecutive pair of `pts` touches the given box/circle/polygon. */
export function polylineIntersectsBox(pts: Pt[], box: Box, closed = false): boolean {
  const valid = pts.filter(validPt);
  if (!valid.length) return false;
  if (valid.length === 1) {
    const p = valid[0]!;
    return p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;
  }
  for (let i = 1; i < valid.length; i++) {
    if (segmentIntersectsBox(valid[i - 1]!, valid[i]!, box)) return true;
  }
  if (closed && segmentIntersectsBox(valid[valid.length - 1]!, valid[0]!, box)) return true;
  return false;
}

export function polylineIntersectsCircle(pts: Pt[], c: Pt, r: number, closed = false): boolean {
  const valid = pts.filter(validPt);
  if (!valid.length) return false;
  if (valid.length === 1) return Math.hypot(valid[0]!.x - c.x, valid[0]!.y - c.y) <= r;
  for (let i = 1; i < valid.length; i++) {
    if (segmentIntersectsCircle(valid[i - 1]!, valid[i]!, c, r)) return true;
  }
  if (closed && segmentIntersectsCircle(valid[valid.length - 1]!, valid[0]!, c, r)) return true;
  return false;
}

export function polylineIntersectsPolygon(pts: Pt[], poly: Pt[], closed = false): boolean {
  const valid = pts.filter(validPt);
  if (!valid.length || poly.length < 3) return false;
  if (valid.length === 1) return pointInPolygon(valid[0]!, poly);
  for (let i = 1; i < valid.length; i++) {
    if (segmentIntersectsPolygon(valid[i - 1]!, valid[i]!, poly)) return true;
  }
  if (closed && segmentIntersectsPolygon(valid[valid.length - 1]!, valid[0]!, poly)) return true;
  return false;
}
