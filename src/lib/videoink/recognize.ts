import type { Pt } from "./objects";
import type { ShapeKind, Stroke } from "./types";

/* ==================================================================== *
 * Shared geometry helpers
 * ==================================================================== */

/** Perpendicular-distance polyline simplification (Douglas–Peucker). */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  let maxD = -1;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const den = Math.hypot(dx, dy) || 1e-9;
    const d = Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / den;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [first, last];
  return [
    ...simplify(pts.slice(0, idx + 1), tol).slice(0, -1),
    ...simplify(pts.slice(idx), tol),
  ];
}

export interface Recognized {
  shape: ShapeKind;
  a: Pt;
  b: Pt;
}

export interface RecognizedDetailed {
  shape: ShapeKind;
  a: Pt;
  b: Pt;
  confidence: number;
  rotation?: number;
  sides?: number;
}

function bbox(pts: Pt[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
}

function pathLength(pts: Pt[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++)
    l += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return l;
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Uniform arc-length resample of a (possibly open) polyline into `n` points. */
function resamplePath(pts: Pt[], n: number): Pt[] {
  const total = pathLength(pts);
  if (total <= 0) return new Array(n).fill(pts[0]!);
  const step = total / (n - 1);
  const out: Pt[] = [pts[0]!];
  let d = 0;
  let i = 1;
  let prev = pts[0]!;
  while (i < pts.length && out.length < n) {
    const cur = pts[i]!;
    const seg = dist(cur, prev);
    if (seg <= 1e-12) {
      i++;
      continue;
    }
    if (d + seg >= step) {
      const t = (step - d) / seg;
      const np = lerp(prev, cur, t);
      out.push(np);
      prev = np;
      d = 0;
    } else {
      d += seg;
      prev = cur;
      i++;
    }
  }
  while (out.length < n) out.push(pts[pts.length - 1]!);
  return out;
}

/** Median filter over x/y — kills single-sample stylus noise spikes. */
function medianFilter(pts: Pt[], window = 3): Pt[] {
  if (pts.length < 5) return pts.slice();
  const half = Math.floor(window / 2);
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = -half; k <= half; k++) {
      const p = pts[Math.min(pts.length - 1, Math.max(0, i + k))]!;
      xs.push(p.x);
      ys.push(p.y);
    }
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    out.push({ x: xs[half]!, y: ys[half]! });
  }
  return out;
}

/** Chaikin corner-cutting smoothing pass (open polyline, endpoints kept). */
function chaikinOpen(pts: Pt[], iterations = 1): Pt[] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) return cur;
    const next: Pt[] = [cur[0]!];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i]!;
      const b = cur[i + 1]!;
      next.push(lerp(a, b, 0.25), lerp(a, b, 0.75));
    }
    next.push(cur[cur.length - 1]!);
    cur = next;
  }
  return cur;
}

/** Shoelace area of a closed polygon. */
function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Andrew monotone-chain convex hull. */
function convexHull(pts: Pt[]): Pt[] {
  const uniq = Array.from(new Map(pts.map((p) => [`${p.x.toFixed(6)},${p.y.toFixed(6)}`, p])).values());
  if (uniq.length < 3) return uniq;
  uniq.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/* ==================================================================== *
 * Normalisation
 * ==================================================================== */

interface NormResult {
  pts: Pt[];
  toWorld: (p: Pt) => Pt;
  cx: number;
  cy: number;
  scale: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  diagWorld: number;
}

/** Translate to centroid, scale by bbox diagonal; keep the inverse transform. */
function normalize(pts: Pt[]): NormResult {
  const box = bbox(pts);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const diag = Math.hypot(box.x1 - box.x0, box.y1 - box.y0) || 1e-9;
  const scale = 1 / diag;
  const norm = pts.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
  return {
    pts: norm,
    toWorld: (p: Pt) => ({ x: p.x / scale + cx, y: p.y / scale + cy }),
    cx,
    cy,
    scale,
    box,
    diagWorld: diag,
  };
}

/* ==================================================================== *
 * Preprocessing pipeline: resample -> denoise -> smooth
 * ==================================================================== */

const RESAMPLE_N = 96;

function preprocess(raw: Pt[]): Pt[] {
  let pts = raw;
  // Trim near-duplicate points caused by slightly overlapping start/end.
  pts = pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]!) > 1e-7);
  if (pts.length < 12) {
    // Too few samples: interpolate up before fitting.
    pts = resamplePath(pts.length >= 2 ? pts : [pts[0] ?? { x: 0, y: 0 }, pts[0] ?? { x: 0, y: 0 }], 24);
  }
  pts = medianFilter(pts, 3);
  const fixed = resamplePath(pts, RESAMPLE_N);
  return chaikinOpen(fixed, 1);
}

/* ==================================================================== *
 * Line / arrow fitting (open strokes)
 * ==================================================================== */

interface LineFit {
  a: Pt;
  b: Pt;
  rms: number;
}

/** Total-least-squares (PCA) line fit through a point set. */
function fitLineTLS(pts: Pt[]): LineFit {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  // Principal direction from the 2x2 covariance matrix.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dirx = Math.cos(theta);
  const diry = Math.sin(theta);
  let tMin = Infinity;
  let tMax = -Infinity;
  let ss = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    const t = dx * dirx + dy * diry;
    const perp = -dx * diry + dy * dirx;
    ss += perp * perp;
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  const rms = Math.sqrt(ss / n);
  const a = { x: mx + dirx * tMin, y: my + diry * tMin };
  const b = { x: mx + dirx * tMax, y: my + diry * tMax };
  return { a, b, rms };
}

interface Candidate extends RecognizedDetailed {}

function tryLineOrArrow(raw: Pt[], norm: NormResult): Candidate[] {
  const out: Candidate[] = [];
  const first = raw[0]!;
  const last = raw[raw.length - 1]!;
  const fit = fitLineTLS(norm.pts);
  const len = pathLength(norm.pts);
  const straightLen = dist(fit.a, fit.b);
  if (straightLen > 1e-6) {
    const confidence = Math.max(0, 1 - fit.rms / 0.06) * Math.min(1, straightLen / (len * 0.85 || 1));
    if (confidence > 0.4) {
      out.push({
        shape: "line",
        a: norm.toWorld(fit.a),
        b: norm.toWorld(fit.b),
        confidence: Math.min(1, confidence),
      });
    }
  }

  // Arrow: simplify to find a dominant shaft + small V head near one end.
  const tol = 0.03;
  const simp = simplify(raw, tol * norm.diagWorld);
  if (simp.length >= 3 && simp.length <= 8) {
    const segs = simp.slice(1).map((p, i) => ({
      p0: simp[i]!,
      p1: p,
      len: dist(simp[i]!, p),
      angle: Math.atan2(p.y - simp[i]!.y, p.x - simp[i]!.x),
    }));
    segs.sort((a, b) => b.len - a.len);
    const shaft = segs[0]!;
    const shaftIdx = simp.findIndex((p) => p === shaft.p0);
    // Head candidates: short segments near either extremity of the polyline.
    const head = segs.slice(1).filter((s) => s.len < shaft.len * 0.6 && s.len > shaft.len * 0.04);
    const nearStart = head.some((s) => simp.indexOf(s.p0) <= 1 || simp.indexOf(s.p1) <= 1);
    const nearEnd = head.some(
      (s) => simp.indexOf(s.p0) >= simp.length - 2 || simp.indexOf(s.p1) >= simp.length - 2,
    );
    if (shaft.len > 0.3 && head.length >= 1 && (nearStart || nearEnd)) {
      // Check divergence angle between the two head strokes (if two exist).
      let angleOk = true;
      if (head.length >= 2) {
        const a1 = head[0]!.angle;
        const a2 = head[1]!.angle;
        let diff = Math.abs(a1 - a2);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        const deg = (diff * 180) / Math.PI;
        angleOk = deg >= 15 && deg <= 75;
      }
      if (angleOk) {
        const conf = Math.min(1, 0.55 + shaft.len * 0.4);
        void shaftIdx;
        out.push({
          shape: "arrow",
          a: norm.toWorld(shaft.p0),
          b: norm.toWorld(shaft.p1),
          confidence: conf,
        });
      }
    }
  }
  void first;
  void last;
  return out;
}

/* ==================================================================== *
 * Minimum-area bounding rectangle via rotating calipers
 * ==================================================================== */

interface MinRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number; // radians
  area: number;
  corners: Pt[];
}

function minAreaRect(hull: Pt[]): MinRect | null {
  if (hull.length < 3) return null;
  let best: MinRect | null = null;
  for (let i = 0; i < hull.length; i++) {
    const p0 = hull[i]!;
    const p1 = hull[(i + 1) % hull.length]!;
    const edgeAngle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const cos = Math.cos(-edgeAngle);
    const sin = Math.sin(-edgeAngle);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of hull) {
      const x = p.x * cos - p.y * sin;
      const y = p.x * sin + p.y * cos;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const area = w * h;
    if (!best || area < best.area) {
      const cosBack = Math.cos(edgeAngle);
      const sinBack = Math.sin(edgeAngle);
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      const cx = midX * cosBack - midY * sinBack;
      const cy = midX * sinBack + midY * cosBack;
      const corners: Pt[] = [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
      ].map(([x, y]) => ({
        x: x! * cosBack - y! * sinBack,
        y: x! * sinBack + y! * cosBack,
      }));
      best = { cx, cy, w, h, angle: edgeAngle, area, corners };
    }
  }
  return best;
}

/** Mean distance of sample points to the nearest edge of a (possibly rotated) rectangle. */
function rectEdgeResidual(pts: Pt[], rect: MinRect): number {
  const cos = Math.cos(-rect.angle);
  const sin = Math.sin(-rect.angle);
  const hw = rect.w / 2;
  const hh = rect.h / 2;
  let sum = 0;
  for (const p of pts) {
    const dx = p.x - rect.cx;
    const dy = p.y - rect.cy;
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    const dLeft = Math.abs(Math.abs(lx) - hw);
    const dTop = Math.abs(Math.abs(ly) - hh);
    sum += Math.min(dLeft, dTop);
  }
  return sum / pts.length;
}

function tryRect(raw: Pt[], norm: NormResult): Candidate[] {
  const hull = convexHull(norm.pts);
  const rect = minAreaRect(hull);
  if (!rect) return [];
  const hullArea = polygonArea(hull);
  const fillRatio = hullArea / (rect.area || 1e-9);
  const residual = rectEdgeResidual(norm.pts, rect);
  const confidence = Math.max(0, 1 - residual / 0.05) * Math.min(1, fillRatio / 0.82);
  if (confidence < 0.35) return [];
  // Normalise rotation to 0..90 for the "close to axis-aligned" test.
  let deg = ((rect.angle * 180) / Math.PI) % 90;
  if (deg < 0) deg += 90;
  const distToAxis = Math.min(deg, 90 - deg);
  if (distToAxis > 8) return []; // rotated too far — reject rather than mis-box it.
  const worldCorners = rect.corners.map((c) => norm.toWorld(c));
  const xs = worldCorners.map((c) => c.x);
  const ys = worldCorners.map((c) => c.y);
  const a = { x: Math.min(...xs), y: Math.min(...ys) };
  const b = { x: Math.max(...xs), y: Math.max(...ys) };
  const ratio = rect.w / (rect.h || 1e-9);
  const isSquare = ratio > 0.88 && ratio < 1.14;
  return [
    {
      shape: isSquare ? "square" : "rect",
      a,
      b,
      confidence: Math.min(1, confidence),
      rotation: rect.angle,
    },
  ];
  void raw;
}

/* ==================================================================== *
 * Ellipse / circle fitting: Fitzgibbon direct least-squares ellipse fit
 * ==================================================================== */

interface EllipseFit {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
}

function fitEllipseDirect(pts: Pt[]): EllipseFit | null {
  // Build design matrix and solve the generalized eigenproblem via a
  // numerically simple scatter-matrix approach (sufficient for our normalised,
  // resampled point sets — no need for a full sparse SVD implementation).
  const n = pts.length;
  if (n < 6) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  // Use a simple, robust approach: fit via covariance of centred coordinates,
  // approximating the ellipse as the equal-mass covariance ellipse. This is
  // stable for near-elliptical closed curves (what we actually receive here)
  // and avoids the conditioning issues of the raw conic design matrix.
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= n;
  syy /= n;
  sxy /= n;
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const l1 = trace / 2 + disc;
  const l2 = trace / 2 - disc;
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  // Point mass on a uniform ellipse boundary has variance r^2/2 along each
  // axis, so r = sqrt(2*lambda).
  const rx = Math.sqrt(Math.max(1e-9, 2 * l1));
  const ry = Math.sqrt(Math.max(1e-9, 2 * l2));
  return { cx: mx, cy: my, rx, ry, angle };
}

function ellipseResidual(pts: Pt[], fit: EllipseFit): number {
  const cos = Math.cos(-fit.angle);
  const sin = Math.sin(-fit.angle);
  let sum = 0;
  for (const p of pts) {
    const dx = p.x - fit.cx;
    const dy = p.y - fit.cy;
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    const r = Math.hypot(lx / fit.rx, ly / fit.ry);
    sum += Math.abs(r - 1);
  }
  return sum / pts.length;
}

function tryEllipse(norm: NormResult): Candidate[] {
  const fit = fitEllipseDirect(norm.pts);
  if (!fit) return [];
  const residual = ellipseResidual(norm.pts, fit);
  const confidence = Math.max(0, 1 - residual / 0.35);
  if (confidence < 0.4) return [];
  let deg = ((fit.angle * 180) / Math.PI) % 90;
  if (deg < 0) deg += 90;
  const distToAxis = Math.min(deg, 90 - deg);
  if (distToAxis > 8) return [];
  const a = norm.toWorld({ x: fit.cx - fit.rx, y: fit.cy - fit.ry });
  const b = norm.toWorld({ x: fit.cx + fit.rx, y: fit.cy + fit.ry });
  const box = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  const ratio = fit.rx / (fit.ry || 1e-9);
  const isCircle = ratio > 0.85 && ratio < 1.18;
  return [
    {
      shape: isCircle ? "circle" : "ellipse",
      a: { x: box.x0, y: box.y0 },
      b: { x: box.x1, y: box.y1 },
      confidence: Math.min(1, confidence),
      rotation: fit.angle,
    },
  ];
}

/* ==================================================================== *
 * Polygon fitting: simplify + corner detection -> k-gon
 * ==================================================================== */

function findCornersClosed(pts: Pt[], threshold = 0.75): number[] {
  const n = pts.length;
  const w = Math.max(2, Math.round(n / 16));
  const turn: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = pts[(i - w + n) % n]!;
    const b = pts[i]!;
    const c = pts[(i + w) % n]!;
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = Math.PI * 2 - d;
    turn[i] = d;
  }
  const corners: number[] = [];
  const suppress = Math.max(2, Math.round(n / 10));
  for (let i = 0; i < n; i++) {
    const t = turn[i]!;
    if (t < threshold) continue;
    let isMax = true;
    for (let k = -suppress; k <= suppress; k++) {
      const j = (i + k + n) % n;
      if (turn[j]! > t) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    if (corners.some((c) => Math.min(Math.abs(c - i), n - Math.abs(c - i)) < suppress)) continue;
    corners.push(i);
  }
  return corners;
}

function angleAt(a: Pt, b: Pt, c: Pt): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1e-9;
  return Math.acos(Math.min(1, Math.max(-1, dot / mag)));
}

function tryPolygon(norm: NormResult): Candidate[] {
  const poly = norm.pts;
  const area = polygonArea(poly);
  const box = bbox(poly);
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const bboxArea = Math.max(w * h, 1e-9);
  const fill = area / bboxArea;
  if (fill < 0.25) return []; // scribble / open loopy handwriting

  const corners = findCornersClosed(poly, 0.7);
  const out: Candidate[] = [];
  const toWorldBox = () => ({
    a: norm.toWorld({ x: box.x0, y: box.y0 }),
    b: norm.toWorld({ x: box.x1, y: box.y1 }),
  });

  const cornerPts = corners.map((i) => poly[i]!);

  if (cornerPts.length === 3) {
    const [p0, p1, p2] = cornerPts as [Pt, Pt, Pt];
    const angles = [angleAt(p2, p0, p1), angleAt(p0, p1, p2), angleAt(p1, p2, p0)];
    const sumDeg = angles.reduce((s, a) => s + (a * 180) / Math.PI, 0);
    const residual = Math.abs(sumDeg - 180) / 180;
    const confidence = Math.max(0, 1 - residual) * Math.min(1, fill / 0.4) * (fill < 0.75 ? 1 : 0.7);
    if (confidence > 0.4) {
      const isRight = angles.some((a) => Math.abs((a * 180) / Math.PI - 90) < 8);
      const { a, b } = toWorldBox();
      out.push({ shape: isRight ? "rightTriangle" : "triangle", a, b, confidence, sides: 3 });
    }
  } else if (cornerPts.length === 4) {
    // Diamond vs rectangle: diamond has corners near the midpoints of the
    // bbox edges (roughly 45° rotated square).
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const onAxis = cornerPts.every((p) => {
      const dx = Math.abs(p.x - cx) / (w / 2 || 1e-9);
      const dy = Math.abs(p.y - cy) / (h / 2 || 1e-9);
      return dx < 0.35 || dy < 0.35;
    });
    if (onAxis && fill > 0.35 && fill < 0.65) {
      const confidence = Math.min(1, fill / 0.5) * 0.85;
      const { a, b } = toWorldBox();
      out.push({ shape: "diamond", a, b, confidence, sides: 4 });
    }
  } else if (cornerPts.length >= 5 && cornerPts.length <= 10 && fill > 0.55) {
    const confidence = Math.min(1, fill) * 0.75;
    const { a, b } = toWorldBox();
    out.push({ shape: "polygon", a, b, confidence, sides: cornerPts.length });
  }
  return out;
}

/* ==================================================================== *
 * Top-level pipeline
 * ==================================================================== */

const CONFIDENCE_THRESHOLD = 0.78;
const MARGIN_REQUIRED = 0.08;

export function recognizeShapeDetailed(stroke: Stroke): RecognizedDetailed | null {
  const raw = stroke.points.map((p) => ({ x: p.x, y: p.y }));
  if (raw.length < 4) return null;
  const box = bbox(raw);
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const diag = Math.hypot(w, h);
  if (diag < 0.035) return null;

  const processed = preprocess(raw);
  const norm = normalize(processed);

  const first = processed[0]!;
  const last = processed[processed.length - 1]!;
  const len = pathLength(processed);
  const closeGap = dist(first, last);
  // Handle incomplete closure (gap up to ~25% of perimeter) and slightly
  // overlapping endpoints (already trimmed in preprocess via dedupe).
  const closed = closeGap < diag * 0.25 && len > diag * 1.5;

  const candidates: Candidate[] = [];

  if (closed) {
    // For closed-shape fits, work on a polygon resampled *without* trimming
    // the closing edge so corner detection wraps correctly.
    const closedRaw = processed.slice();
    const closedNorm = normalize(resamplePath(closedRaw, 64));
    candidates.push(...tryRect(closedRaw, closedNorm));
    candidates.push(...tryEllipse(closedNorm));
    candidates.push(...tryPolygon(closedNorm));
  } else {
    candidates.push(...tryLineOrArrow(processed, norm));
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.confidence - a.confidence);
  const bestC = candidates[0]!;
  const runnerUp = candidates[1];
  if (bestC.confidence < CONFIDENCE_THRESHOLD) return null;
  if (runnerUp && bestC.confidence - runnerUp.confidence < MARGIN_REQUIRED && bestC.shape !== runnerUp.shape) {
    // Ambiguous — bias toward rejection rather than guessing wrong.
    return null;
  }
  return bestC;
}

/**
 * Recognize a geometric intent from a completed freehand stroke.
 * Conservative enough that handwriting is never mangled, but reliable for
 * rectangles, triangles, ellipses, lines and arrows. Thin wrapper over
 * `recognizeShapeDetailed` for backward compatibility.
 */
export function recognizeShape(stroke: Stroke): Recognized | null {
  const detailed = recognizeShapeDetailed(stroke);
  if (!detailed) return null;
  return { shape: detailed.shape, a: detailed.a, b: detailed.b };
}
