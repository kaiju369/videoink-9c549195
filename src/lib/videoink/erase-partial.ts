/**
 * Partial (pixel) eraser: splits strokes around a swept eraser path instead
 * of a single point, so fast pointer motion doesn't leave un-erased gaps.
 * Shapes/text are removed whole when touched.
 */
import type { Pt } from "./objects";
import { hitTest, outlinePoints, type EraseResult } from "./objects";
import { segmentIntersectsCircle } from "./hit-geometry";
import type { InkPoint, PageObject, Stroke } from "./types";

const MIN_SURVIVOR_SAMPLES = 2;

/**
 * Erase along the segment from `from` to `to` (the eraser's swept path this
 * frame), with the given radius. Returns objects removed and their surviving
 * fragments (for strokes only).
 */
export function erasePartialSweep(
  objs: PageObject[],
  from: Pt,
  to: Pt,
  radius: number,
): EraseResult {
  const removed: PageObject[] = [];
  const added: Stroke[] = [];
  const r = Number.isFinite(radius) ? Math.max(0.0005, radius) : 0.01;
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y)) from = to;
  if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) return { removed, added };

  const touchesSweep = (p: Pt) =>
    segmentIntersectsCircle(from, to, p, r) ||
    Math.hypot(p.x - to.x, p.y - to.y) <= r;

  for (const o of objs) {
    if (o.kind !== "stroke") {
      const pts = outlinePoints(o);
      const touched = pts.some(touchesSweep) || hitTest(o, to.x, to.y, r);
      if (touched) removed.push(o);
      continue;
    }
    if (!o.points || o.points.length === 0) continue;
    let any = false;
    for (let i = 0; i < o.points.length; i++) {
      const p = o.points[i]!;
      const prev = o.points[i - 1] ?? p;
      if (
        touchesSweep(p) ||
        segmentIntersectsCircle(prev, p, to, r) ||
        segmentIntersectsCircle(prev, p, from, r)
      ) {
        any = true;
        break;
      }
    }
    if (!any) continue;
    removed.push(o);
    let run: InkPoint[] = [];
    const flush = () => {
      if (run.length >= MIN_SURVIVOR_SAMPLES) {
        added.push({
          ...o,
          id: `${o.id}-${added.length}-${Math.random().toString(36).slice(2, 7)}`,
          points: run,
        });
      }
      run = [];
    };
    for (let i = 0; i < o.points.length; i++) {
      const p = o.points[i]!;
      const prev = o.points[i - 1] ?? p;
      const erased =
        touchesSweep(p) ||
        segmentIntersectsCircle(prev, p, to, r) ||
        segmentIntersectsCircle(prev, p, from, r);
      if (erased) flush();
      else run.push(p);
    }
    flush();
  }
  return { removed, added };
}

/** Accumulator used for a whole freehand-erase drag so it commits once. */
export class PartialEraseSession {
  private removedIds = new Set<string>();
  private survivors = new Map<string, Stroke[]>();
  private base: PageObject[];

  constructor(base: PageObject[]) {
    this.base = base;
  }

  /** Apply one incremental sweep segment against the *current* working set. */
  step(from: Pt, to: Pt, radius: number): boolean {
    const working = this.working();
    const { removed, added } = erasePartialSweep(working, from, to, radius);
    if (!removed.length) return false;

    // A later sweep can hit only one of several fragments produced by an
    // earlier sweep. Keep every untouched fragment for the original stroke;
    // replace only the fragments that were actually removed this step.
    const removedByOrigin = new Map<string, Set<string>>();
    for (const o of removed) {
      const origin = this.originalIdOf(o.id);
      this.removedIds.add(origin);
      let ids = removedByOrigin.get(origin);
      if (!ids) {
        ids = new Set<string>();
        removedByOrigin.set(origin, ids);
      }
      ids.add(o.id);

      if (o.kind !== "stroke") this.survivors.delete(origin);
    }

    for (const [origin, ids] of removedByOrigin) {
      const existing = this.survivors.get(origin) ?? [];
      const kept = existing.filter((fragment) => !ids.has(fragment.id));
      const replacement = added.filter(
        (fragment) => this.originalIdOf(fragment.id) === origin,
      );
      if (kept.length || replacement.length) {
        this.survivors.set(origin, [...kept, ...replacement]);
      } else {
        this.survivors.delete(origin);
      }
    }

    return true;
  }

  private originalIdOf(id: string): string {
    // Fragment ids look like `${originalId}-${n}-${rand}`. Resolve against
    // the immutable base IDs so an original ID containing dashes is handled
    // safely as well.
    for (const o of this.base) if (id === o.id || id.startsWith(`${o.id}-`)) return o.id;
    return id;
  }

  private working(): PageObject[] {
    const out: PageObject[] = [];
    for (const o of this.base) {
      if (this.removedIds.has(o.id)) {
        const frags = this.survivors.get(o.id);
        if (frags) out.push(...frags);
        continue;
      }
      out.push(o);
    }
    return out;
  }

  /** Final object list to commit as a single undo entry (or null if no-op). */
  result(): PageObject[] | null {
    if (this.removedIds.size === 0) return null;
    return this.working();
  }
}
