import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContentRect } from "@/lib/videoink/geometry";
import {
  eraseObjectsAt,
  hitTest,
  nextZ,
  objectBounds,
  objectsInCircle,
  objectsInPolygon,
  objectsIntersectingBox,
  renderObjects,
  scaleObject,
  translateObject,
  unionBounds,
  type Box,
  type Pt,
} from "@/lib/videoink/objects";
import { drawObject } from "@/lib/videoink/objects";
import { erasePartialSweep, PartialEraseSession } from "@/lib/videoink/erase-partial";
import { recognizeShape } from "@/lib/videoink/recognize";
import { InkFilter, smoothStroke } from "@/lib/videoink/smooth";
import { pressureThinning, type Prefs } from "@/lib/videoink/prefs";
import {
  uid,
  type InkPoint,
  type PageObject,
  type ShapeObject,
  type Stroke,
  type TextObject,
  type ToolId,
} from "@/lib/videoink/types";
import type { Editor } from "./useEditor";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];

interface Props {
  rect: ContentRect;
  width: number;
  height: number;
  editor: Editor;
  tool: ToolId;
  prefs: Prefs;
  enabled: boolean;
  editingTextId: string | null;
  onEditText: (id: string | null) => void;
  onRecognized?: (label: string) => void;
}

type EraserMode = "stroke" | "freehand" | "rect" | "circle" | "lasso";

type Drag =
  | { mode: "ink"; id: number; points: InkPoint[]; pressureMode: "real" | "simulated" }
  | { mode: "shape"; id: number; a: Pt; b: Pt }
  | { mode: "eraseStroke"; id: number; cur: Pt }
  | { mode: "erasePartial"; id: number; cur: Pt; session: PartialEraseSession }
  | { mode: "eraseRect"; id: number; start: Pt; cur: Pt }
  | { mode: "eraseCircle"; id: number; start: Pt; cur: Pt }
  | { mode: "eraseLasso"; id: number; pts: Pt[] }
  | { mode: "marquee"; id: number; start: Pt; cur: Pt }
  | { mode: "lasso"; id: number; pts: Pt[] }
  | { mode: "move"; id: number; start: Pt; base: PageObject[] }
  | { mode: "resize"; id: number; handle: Handle; from: Box; base: PageObject[]; cur: Box }
  | { mode: "text"; id: number; start: Pt; cur: Pt };

const ERASER_TOOLS: ToolId[] = ["eraser", "lassoEraser", "freehandEraser", "rectEraser", "circleEraser"];

/** Resolve which eraser behaviour a given tool/prefs combination selects. */
function eraserModeOf(tool: ToolId, prefs: Prefs): EraserMode {
  if (tool === "lassoEraser") return "lasso";
  if (tool === "freehandEraser") return "freehand";
  if (tool === "rectEraser") return "rect";
  if (tool === "circleEraser") return "circle";
  return prefs.eraserMode;
}

export function ObjectCanvas({
  rect,
  width,
  height,
  editor,
  tool,
  prefs,
  enabled,
  editingTextId,
  onEditText,
  onRecognized,
}: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const raf = useRef<number | null>(null);
  const filter = useRef(new InkFilter(0.5));
  const [, force] = useState(0);
  const [dprTick, setDprTick] = useState(0);
  /** cached CSS bounding rect of the overlay canvas; invalidated on resize/scroll */
  const boundsRef = useRef<DOMRect | null>(null);
  /** last known pointer position in normalized content space, for the eraser cursor ring */
  const hoverRef = useRef<Pt | null>(null);
  const reducedMotionRef = useRef(false);
  /** true once begin()/beginTransient() has been called for the in-flight drag */
  const txOpenRef = useRef(false);

  const { objects, selection } = editor;

  const getBounds = useCallback(() => {
    if (!boundsRef.current && liveRef.current) {
      boundsRef.current = liveRef.current.getBoundingClientRect();
    }
    return boundsRef.current ?? new DOMRect(0, 0, width, height);
  }, [width, height]);

  useEffect(() => {
    const invalidate = () => {
      boundsRef.current = null;
    };
    invalidate();
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", invalidate, true);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && liveRef.current) {
      ro = new ResizeObserver(invalidate);
      ro.observe(liveRef.current);
    }
    return () => {
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate, true);
      ro?.disconnect();
    };
  }, [width, height, rect]);

  // Track prefers-reduced-motion so any animated affordance can be skipped.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const onChange = () => {
      reducedMotionRef.current = mq.matches;
    };
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
  }, []);

  // Watch for devicePixelRatio changes (moving window between monitors, OS
  // zoom, etc.) and resize the canvas backing stores to match.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const dpr = window.devicePixelRatio || 1;
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDprTick((n) => n + 1);
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
  }, [dprTick]);

  const setup = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return null;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(width * dpr));
      const h = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    },
    [width, height],
  );

  const visible = useMemo(
    () => objects.filter((o) => !(o.kind === "text" && o.id === editingTextId)),
    [objects, editingTextId],
  );

  useEffect(() => {
    const ctx = setup(baseRef.current);
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    renderObjects(ctx, visible, rect);
  }, [visible, rect, width, height, setup, dprTick]);

  const px = useCallback((p: Pt) => ({
    x: rect.left + p.x * rect.width,
    y: rect.top + p.y * rect.height,
  }), [rect]);

  const selBox = useMemo(() => unionBounds(editor.selected), [editor.selected]);

  /* --------------------------- overlay render --------------------------- */
  const renderLive = useCallback(() => {
    raf.current = null;
    const ctx = setup(liveRef.current);
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const d = drag.current;

    if (d?.mode === "ink" && d.points.length) {
      // Use the exact same sampling pipeline as the committed stroke, so the
      // ink never "jumps" bolder / thinner the moment the pen lifts.
      const raw = makeStroke(d.points, d.pressureMode, tool, prefs, 0);
      drawObject(
        ctx,
        { ...raw, points: smoothStroke(d.points, prefs.smoothing) },
        rect,
      );
    }
    if (d?.mode === "shape") {
      drawObject(ctx, makeShape(d.a, d.b, tool, prefs, 0), rect);
    }
    if (d?.mode === "text") {
      const a = px(d.start);
      const b = px(d.cur);
      ctx.save();
      ctx.strokeStyle = "#7ec8ff";
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.restore();
    }
    if (d?.mode === "marquee" || d?.mode === "eraseRect" || d?.mode === "eraseCircle") {
      const a = px(d.start);
      const b = px(d.cur);
      const isEraser = d.mode !== "marquee";
      ctx.save();
      ctx.strokeStyle = isEraser ? "#ff8a7a" : "#7ec8ff";
      ctx.fillStyle = isEraser ? "rgba(255,138,122,0.12)" : "rgba(126,200,255,0.12)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      if (d.mode === "eraseCircle") {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      }
      ctx.restore();
    }
    if ((d?.mode === "lasso" || d?.mode === "eraseLasso") && d.pts.length > 1) {
      const isEraser = d.mode === "eraseLasso";
      ctx.save();
      ctx.strokeStyle = isEraser ? "#ff8a7a" : "#7ec8ff";
      ctx.fillStyle = isEraser ? "rgba(255,138,122,0.10)" : "rgba(126,200,255,0.10)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const f = px(d.pts[0]!);
      ctx.moveTo(f.x, f.y);
      for (const p of d.pts.slice(1)) {
        const q = px(p);
        ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Live eraser radius indicator: a static ring at the last known pointer
    // position (no animation, so it respects prefers-reduced-motion trivially).
    if (enabled && hoverRef.current) {
      const mode = eraserModeOf(tool, prefs);
      const showRing =
        ERASER_TOOLS.includes(tool) && (mode === "stroke" || mode === "freehand");
      if (showRing) {
        const center = px(hoverRef.current);
        const radiusPx = prefs.eraserSize * rect.height;
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.25;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(center.x, center.y, Math.max(2, radiusPx), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // selection chrome
    if (selBox && Number.isFinite(selBox.x0)) {
      const a = px({ x: selBox.x0, y: selBox.y0 });
      const b = px({ x: selBox.x1, y: selBox.y1 });
      ctx.save();
      ctx.strokeStyle = "#7ec8ff";
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
      ctx.fillStyle = "#0c0b0a";
      for (const h of HANDLES) {
        const p = handlePoint(h, a, b);
        ctx.beginPath();
        ctx.rect(p.x - 4, p.y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [setup, width, height, tool, prefs, rect, px, selBox, dprTick]);

  useEffect(() => {
    renderLive();
  }, [renderLive]);

  const schedule = () => {
    if (raf.current == null) raf.current = requestAnimationFrame(renderLive);
  };

  /* ------------------------------ pointer ------------------------------ */
  const toNorm = (e: React.PointerEvent): InkPoint => {
    const box = getBounds();
    const x = (e.clientX - box.left - rect.left) / rect.width;
    const y = (e.clientY - box.top - rect.top) / rect.height;
    const real = e.pointerType === "pen" && e.pressure > 0;
    return { x, y, pressure: real ? e.pressure : 0.5 };
  };

  const hitHandle = (p: Pt): Handle | null => {
    if (!selBox || !Number.isFinite(selBox.x0)) return null;
    const a = px({ x: selBox.x0, y: selBox.y0 });
    const b = px({ x: selBox.x1, y: selBox.y1 });
    const q = px(p);
    for (const h of HANDLES) {
      const hp = handlePoint(h, a, b);
      if (Math.abs(hp.x - q.x) <= 7 && Math.abs(hp.y - q.y) <= 7) return h;
    }
    return null;
  };

  /** Whole-object eraser: remove anything touched, transient (no commit) so a
   *  whole drag collapses into a single undo entry via editor.commit(). */
  const eraseStrokeAt = (p: Pt) => {
    const radius = prefs.eraserSize;
    const hit = eraseObjectsAt(editor.objects, p.x, p.y, radius);
    if (!hit.length) return;
    const ids = new Set(hit.map((o) => o.id));
    editor.apply((prev) => prev.filter((o) => !ids.has(o.id)), false);
  };

  const abortDrag = () => {
    if (txOpenRef.current) {
      editor.abort();
      txOpenRef.current = false;
    }
    drag.current = null;
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    renderLive();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType === "touch" && !prefs.touchDrawing) return;
    if (e.button === 2) return;
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = toNorm(e);
    const tol = 0.012;

    if (tool === "select" || tool === "move") {
      const handle = tool === "select" ? hitHandle(p) : null;
      if (handle && selBox) {
        editor.beginTransient();
        drag.current = {
          mode: "resize",
          id: e.pointerId,
          handle,
          from: selBox,
          cur: selBox,
          base: editor.selected,
        };
        return;
      }
      const under = [...editor.objects]
        .sort((a, b) => b.z - a.z)
        .find((o) => hitTest(o, p.x, p.y, tol));
      const insideSelection =
        !!selBox &&
        p.x >= selBox.x0 &&
        p.x <= selBox.x1 &&
        p.y >= selBox.y0 &&
        p.y <= selBox.y1 &&
        editor.selection.length > 0;

      if (under && !editor.selection.includes(under.id) && !(insideSelection && e.shiftKey)) {
        editor.setSelection(e.shiftKey ? [...editor.selection, under.id] : [under.id]);
        editor.beginTransient();
        drag.current = {
          mode: "move",
          id: e.pointerId,
          start: p,
          base: e.shiftKey ? [...editor.selected, under] : [under],
        };
        return;
      }
      if (under || insideSelection) {
        editor.beginTransient();
        drag.current = { mode: "move", id: e.pointerId, start: p, base: editor.selected };
        return;
      }
      if (!e.shiftKey) editor.setSelection([]);
      drag.current = { mode: "marquee", id: e.pointerId, start: p, cur: p };
      schedule();
      return;
    }

    if (tool === "lasso") {
      drag.current = { mode: "lasso", id: e.pointerId, pts: [p] };
      schedule();
      return;
    }

    if (ERASER_TOOLS.includes(tool)) {
      const mode = eraserModeOf(tool, prefs);
      editor.begin();
      txOpenRef.current = true;
      if (mode === "rect") {
        drag.current = { mode: "eraseRect", id: e.pointerId, start: p, cur: p };
        schedule();
        return;
      }
      if (mode === "circle") {
        drag.current = { mode: "eraseCircle", id: e.pointerId, start: p, cur: p };
        schedule();
        return;
      }
      if (mode === "lasso") {
        drag.current = { mode: "eraseLasso", id: e.pointerId, pts: [p] };
        schedule();
        return;
      }
      if (mode === "freehand") {
        const session = new PartialEraseSession(editor.objects);
        session.step(p, p, prefs.eraserSize);
        const result = session.result();
        if (result) editor.apply(() => result, false);
        drag.current = { mode: "erasePartial", id: e.pointerId, cur: p, session };
        return;
      }
      drag.current = { mode: "eraseStroke", id: e.pointerId, cur: p };
      eraseStrokeAt(p);
      return;
    }

    if (tool === "text") {
      drag.current = { mode: "text", id: e.pointerId, start: p, cur: p };
      schedule();
      return;
    }

    if (tool === "line" || tool === "arrow" || tool === "shape") {
      drag.current = { mode: "shape", id: e.pointerId, a: p, b: p };
      schedule();
      return;
    }

    filter.current = new InkFilter(prefs.smoothing);
    const seed = filter.current.push(p, true) ?? p;
    drag.current = {
      mode: "ink",
      id: e.pointerId,
      points: [seed],
      pressureMode: e.pointerType === "pen" && e.pressure > 0 ? "real" : "simulated",
    };
    schedule();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (enabled && ERASER_TOOLS.includes(tool)) {
      hoverRef.current = toNorm(e);
      schedule();
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const p = toNorm(e);

    switch (d.mode) {
      case "ink": {
        // Consume every coalesced sample the OS buffered: this is what keeps
        // fast stylus strokes from turning into polygons.
        const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [];
        const box = getBounds();
        const samples: InkPoint[] =
          coalesced.length > 1
            ? coalesced.map((ev) => ({
                x: (ev.clientX - box.left - rect.left) / rect.width,
                y: (ev.clientY - box.top - rect.top) / rect.height,
                pressure: d.pressureMode === "real" && ev.pressure > 0 ? ev.pressure : 0.5,
              }))
            : [p];
        for (const s of samples) {
          const f = filter.current.push(s);
          if (f) d.points.push(f);
        }
        schedule();
        break;
      }
      case "shape":
        d.b = e.shiftKey ? square(d.a, p) : p;
        schedule();
        break;
      case "text":
      case "marquee":
        d.cur = p;
        schedule();
        break;
      case "eraseRect":
      case "eraseCircle":
        d.cur = p;
        schedule();
        break;
      case "eraseStroke":
        eraseStrokeAt(p);
        d.cur = p;
        break;
      case "erasePartial": {
        const prevPt = d.cur;
        d.cur = p;
        const changed = d.session.step(prevPt, p, prefs.eraserSize);
        if (changed) {
          const result = d.session.result();
          if (result) editor.apply(() => result, false);
        }
        break;
      }
      case "eraseLasso":
        d.pts.push(p);
        schedule();
        break;
      case "lasso":
        d.pts.push(p);
        schedule();
        break;
      case "move": {
        const dx = p.x - d.start.x;
        const dy = p.y - d.start.y;
        const ids = d.base.map((o) => o.id);
        editor.apply(
          (prev) =>
            prev.map((o) => {
              const idx = ids.indexOf(o.id);
              return idx === -1 ? o : translateObject(d.base[idx]!, dx, dy);
            }),
          false,
        );
        break;
      }
      case "resize": {
        const to = resizeBox(d.from, d.handle, p);
        d.cur = to;
        const ids = d.base.map((o) => o.id);
        editor.apply(
          (prev) =>
            prev.map((o) => {
              const idx = ids.indexOf(o.id);
              return idx === -1 ? o : scaleObject(d.base[idx]!, d.from, to);
            }),
          false,
        );
        break;
      }
    }
  };

  const finish = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }

    if (d.mode === "ink" && d.points.length) {
      const raw = makeStroke(d.points, d.pressureMode, tool, prefs, 0);
      const stroke = { ...raw, points: smoothStroke(d.points, prefs.smoothing) };
      if (prefs.recognize && tool === "pen") {
        const rec = recognizeShape(raw);
        if (rec) {
          editor.add(makeShapeFrom(rec.shape, rec.a, rec.b, prefs, stroke.color, stroke.size));
          onRecognized?.(rec.shape);
          renderLive();
          return;
        }
      }
      editor.add(stroke);
    } else if (d.mode === "shape") {
      const dist = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
      if (dist > 0.008) editor.add(makeShape(d.a, d.b, tool, prefs, 0));
    } else if (d.mode === "text") {
      const x0 = Math.min(d.start.x, d.cur.x);
      const y0 = Math.min(d.start.y, d.cur.y);
      const w = Math.max(Math.abs(d.cur.x - d.start.x), 0.22);
      const h = Math.max(Math.abs(d.cur.y - d.start.y), prefs.text.fontSize * 1.9);
      const t: TextObject = {
        kind: "text",
        id: uid(),
        z: nextZ(editor.objects),
        createdAt: Date.now(),
        x: x0,
        y: y0,
        w,
        h,
        text: "",
        fontSize: prefs.text.fontSize,
        fontFamily: prefs.text.fontFamily,
        bold: prefs.text.bold,
        italic: prefs.text.italic,
        underline: prefs.text.underline,
        align: prefs.text.align,
        color: prefs.text.color,
        background: prefs.text.background,
        border: prefs.text.border,
        opacity: 1,
      };
      editor.add(t);
      editor.setSelection([t.id]);
      onEditText(t.id);
    } else if (d.mode === "marquee") {
      const box = boxOf(d.start, d.cur);
      const hits = objectsIntersectingBox(editor.objects, box);
      editor.setSelection(hits.map((o) => o.id));
    } else if (d.mode === "lasso") {
      const hits = objectsInPolygon(editor.objects, d.pts);
      editor.setSelection(hits.map((o) => o.id));
    } else if (d.mode === "erase" && (tool === "rectEraser" || tool === "circleEraser")) {
      let hits: PageObject[];
      if (tool === "rectEraser") {
        hits = objectsIntersectingBox(editor.objects, boxOf(d.start, d.cur));
      } else {
        const r = Math.hypot(d.cur.x - d.start.x, d.cur.y - d.start.y);
        hits = editor.objects.filter((o) => {
          const b = objectBounds(o);
          const cx = Math.max(b.x0, Math.min(d.start.x, b.x1));
          const cy = Math.max(b.y0, Math.min(d.start.y, b.y1));
          return Math.hypot(cx - d.start.x, cy - d.start.y) <= r;
        });
      }
      if (hits.length) editor.remove(hits.map((o) => o.id));
    } else if (d.mode === "move" || d.mode === "resize") {
      editor.apply((prev) => prev, true);
    }
    force((n) => n + 1);
    renderLive();
  };

  /** Live cursor that previews the real nib / eraser diameter and colour. */
  const cursor = useMemo(() => {
    if (!enabled) return "default";
    if (tool === "select" || tool === "lasso" || tool === "move") return "default";
    if (tool === "text") return "text";

    const h = rect.height || 1;
    let diameter: number;
    let color: string;
    let filled = false;
    if (ERASERS.includes(tool)) {
      diameter = prefs.eraserSize * h * 2;
      color = "#f5f1e8";
    } else if (tool === "highlighter") {
      diameter = prefs.highlighterSize * h * 3.2;
      color = prefs.highlighterColor;
      filled = true;
    } else if (tool === "pen") {
      diameter = prefs.penSize * h;
      color = prefs.penColor;
      filled = true;
    } else {
      diameter = prefs.shapeSize * h;
      color = prefs.penColor;
    }

    const d = Math.max(6, Math.min(96, diameter));
    const s = d + 8;
    const c = s / 2;
    const r = d / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="${filled ? color + "55" : "none"}" stroke="rgba(0,0,0,0.75)" stroke-width="2.5"/>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="1.25"/>
      <circle cx="${c}" cy="${c}" r="1" fill="${color}"/>
    </svg>`;
    const url = `data:image/svg+xml;base64,${btoa(svg)}`;
    return `url("${url}") ${Math.round(c)} ${Math.round(c)}, crosshair`;
  }, [
    enabled,
    tool,
    rect.height,
    prefs.penSize,
    prefs.penColor,
    prefs.highlighterSize,
    prefs.highlighterColor,
    prefs.eraserSize,
    prefs.shapeSize,
  ]);

  return (
    <div className="absolute inset-0" style={{ touchAction: enabled ? "none" : "auto" }}>
      <canvas ref={baseRef} className="pointer-events-none absolute inset-0" />
      <canvas
        ref={liveRef}
        className="absolute inset-0"
        style={{ pointerEvents: enabled ? "auto" : "none", cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onDoubleClick={(e) => {
          if (!enabled) return;
          const box = getBounds();
          const p = {
            x: (e.clientX - box.left - rect.left) / rect.width,
            y: (e.clientY - box.top - rect.top) / rect.height,
          };
          const t = [...editor.objects]
            .sort((a, b) => b.z - a.z)
            .find((o) => o.kind === "text" && hitTest(o, p.x, p.y, 0.005));
          if (t) {
            editor.setSelection([t.id]);
            onEditText(t.id);
          }
        }}
      />
    </div>
  );
}

/* ------------------------------ helpers ------------------------------ */

function handlePoint(h: Handle, a: Pt, b: Pt): Pt {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  switch (h) {
    case "nw":
      return { x: a.x, y: a.y };
    case "n":
      return { x: mx, y: a.y };
    case "ne":
      return { x: b.x, y: a.y };
    case "e":
      return { x: b.x, y: my };
    case "se":
      return { x: b.x, y: b.y };
    case "s":
      return { x: mx, y: b.y };
    case "sw":
      return { x: a.x, y: b.y };
    default:
      return { x: a.x, y: my };
  }
}

function resizeBox(from: Box, handle: Handle, p: Pt): Box {
  const to = { ...from };
  if (handle.includes("n")) to.y0 = Math.min(p.y, from.y1 - 0.01);
  if (handle.includes("s")) to.y1 = Math.max(p.y, from.y0 + 0.01);
  if (handle.includes("w")) to.x0 = Math.min(p.x, from.x1 - 0.01);
  if (handle.includes("e")) to.x1 = Math.max(p.x, from.x0 + 0.01);
  return to;
}

function boxOf(a: Pt, b: Pt): Box {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

function square(a: Pt, p: Pt): Pt {
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  const m = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx) * m, y: a.y + Math.sign(dy) * m };
}

export function makeStroke(
  points: InkPoint[],
  pressureMode: "real" | "simulated",
  tool: ToolId,
  prefs: Prefs,
  z: number,
): Stroke {
  const highlighter = tool === "highlighter";
  const base = highlighter ? prefs.highlighterSize : prefs.penSize;
  return {
    kind: "stroke",
    id: uid(),
    z,
    createdAt: Date.now(),
    tool: highlighter ? "highlighter" : "pen",
    color: highlighter ? prefs.highlighterColor : prefs.penColor,
    opacity: highlighter ? prefs.highlighterOpacity : 1,
    size: Math.max(0.0008, base),
    pressureMode,
    // Pressure now modulates width per point instead of scaling the whole
    // stroke, which is what makes stylus input feel real.
    thinning: highlighter ? 0 : pressureThinning(prefs.pressure),
    smoothing: 0.45 + 0.4 * prefs.smoothing,
    points,
  };
}

export function makeShape(a: Pt, b: Pt, tool: ToolId, prefs: Prefs, z: number): ShapeObject {
  const kind = tool === "line" ? "line" : tool === "arrow" ? "arrow" : prefs.shapeKind;
  return makeShapeFrom(kind, a, b, prefs, prefs.penColor, prefs.shapeSize, z);
}

export function makeShapeFrom(
  kind: ShapeObject["shape"],
  a: Pt,
  b: Pt,
  prefs: Prefs,
  color: string,
  size: number,
  z = 0,
): ShapeObject {
  return {
    kind: "shape",
    id: uid(),
    z,
    createdAt: Date.now(),
    shape: kind,
    a,
    b,
    color,
    fill: prefs.shapeFill ? color + "33" : undefined,
    opacity: 1,
    size,
    lineStyle: prefs.lineStyle,
    startCap: kind === "doubleArrow" ? "filledArrow" : prefs.startCap,
    endCap: kind === "arrow" || kind === "doubleArrow" ? "filledArrow" : prefs.endCap,
  };
}
