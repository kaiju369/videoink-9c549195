import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Circle as CircleIcon,
  Eraser,
  Highlighter,
  Lasso,
  Minus,
  MousePointer2,
  Pen,
  Redo2,
  Square,
  Type,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { PALETTE, PEN_PROFILE_LIST, type PenProfileId, type Prefs } from "@/lib/videoink/prefs";
import type { ToolId } from "@/lib/videoink/types";

/**
 * Floating radial toolset.
 *
 * This is an ADDITIVE companion to the existing top toolbar — it never replaces
 * it. It can be dragged anywhere, remembers its position, and opens a radial
 * menu with the most-used tools plus quick colour / size controls.
 *
 * Accessibility: the trigger is a real button, the radial items are real
 * buttons in a menu with roving focus, Escape closes, and arrow keys move
 * between petals. Reduced-motion users get no transitions.
 */

export interface RadialToolDockProps {
  tool: ToolId;
  setTool: (t: ToolId) => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** hide entirely (e.g. while a dialog is open) */
  hidden?: boolean;
}

interface Petal {
  tool?: ToolId;
  action?: "undo" | "redo";
  icon: typeof Pen;
  label: string;
}

const PETALS: Petal[] = [
  { tool: "pen", icon: Pen, label: "Pen" },
  { tool: "highlighter", icon: Highlighter, label: "Highlighter" },
  { tool: "eraser", icon: Eraser, label: "Eraser" },
  { tool: "shape", icon: Square, label: "Shape" },
  { tool: "line", icon: Minus, label: "Line" },
  { tool: "arrow", icon: ArrowUpRight, label: "Arrow" },
  { tool: "text", icon: Type, label: "Text" },
  { tool: "select", icon: MousePointer2, label: "Select" },
  { tool: "lasso", icon: Lasso, label: "Lasso select" },
  { action: "undo", icon: Undo2, label: "Undo" },
  { action: "redo", icon: Redo2, label: "Redo" },
];

const RADIUS_DESKTOP = 96;
const RADIUS_COMPACT = 74;
const BUTTON = 56;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function RadialToolDock(p: RadialToolDockProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"none" | "color" | "size" | "profile">("none");
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: p.prefs.dock.x, y: p.prefs.dock.y });
  const [viewport, setViewport] = useState({ w: 1280, h: 720 });
  const [focusIndex, setFocusIndex] = useState(0);
  const dragState = useRef<{ id: number; dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const measure = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    setPos({ x: p.prefs.dock.x, y: p.prefs.dock.y });
  }, [p.prefs.dock.x, p.prefs.dock.y]);

  const compact = viewport.w < 640;
  const radius = compact ? RADIUS_COMPACT : RADIUS_DESKTOP;

  const px = Math.round(pos.x * viewport.w);
  const py = Math.round(pos.y * viewport.h);

  // Petals fan out away from the nearest screen edges so they never overflow.
  const openLeft = px > viewport.w / 2;
  const openUp = py > viewport.h / 2;

  const petals = useMemo(() => {
    const n = PETALS.length;
    // quarter/half arc chosen so items stay on screen
    const start = openLeft ? (openUp ? 180 : 90) : openUp ? 270 : 0;
    const sweep = 90;
    return PETALS.map((petal, i) => {
      const t = n === 1 ? 0 : i / (n - 1);
      const ang = ((start + sweep * t) * Math.PI) / 180;
      return {
        ...petal,
        dx: Math.cos(ang) * radius * (openLeft ? -1 : 1),
        dy: Math.sin(ang) * radius * (openUp ? -1 : 1),
      };
    });
  }, [openLeft, openUp, radius]);

  const persist = useCallback(
    (next: Partial<Prefs["dock"]>) => p.setPrefs({ dock: { ...p.prefs.dock, ...next } }),
    [p],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragState.current = {
      id: e.pointerId,
      dx: e.clientX - px,
      dy: e.clientY - py,
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragState.current;
    if (!st || st.id !== e.pointerId) return;
    const nx = e.clientX - st.dx;
    const ny = e.clientY - st.dy;
    if (Math.abs(nx - px) > 3 || Math.abs(ny - py) > 3) st.moved = true;
    const margin = BUTTON / 2 + 8;
    setPos({
      x: Math.min(1, Math.max(0, Math.min(viewport.w - margin, Math.max(margin, nx)) / viewport.w)),
      y: Math.min(1, Math.max(0, Math.min(viewport.h - margin, Math.max(margin, ny)) / viewport.h)),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragState.current;
    if (!st || st.id !== e.pointerId) return;
    dragState.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (st.moved) {
      persist({ x: pos.x, y: pos.y });
    } else {
      setOpen((o) => !o);
      setPanel("none");
    }
  };

  // dismiss on outside pointer / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) {
        setOpen(false);
        setPanel("none");
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setOpen(false);
        setPanel("none");
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (p.hidden || !p.prefs.dock.enabled) return null;

  const activeColor = p.tool === "highlighter" ? p.prefs.highlighterColor : p.prefs.penColor;
  const activeSize = p.tool === "highlighter" ? p.prefs.highlighterSize : p.prefs.penSize;
  const transition = reduced ? "none" : "transform 160ms cubic-bezier(.2,.8,.3,1), opacity 140ms";

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowUp" && e.key !== "ArrowDown")
      return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = (focusIndex + dir + petals.length) % petals.length;
    setFocusIndex(next);
    const nodes = rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-petal]");
    nodes?.[next]?.focus();
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-0 z-40"
      aria-hidden={false}
      data-radial-dock
    >
      <div
        className="pointer-events-none absolute"
        style={{ left: px, top: py, transform: "translate(-50%,-50%)" }}
      >
        {/* petals */}
        <div
          id={menuId}
          role="menu"
          aria-label="Quick tools"
          onKeyDown={onMenuKeyDown}
          className={cn("absolute inset-0", !open && "pointer-events-none")}
        >
          {petals.map((petal, i) => {
            const selected = petal.tool ? p.tool === petal.tool : false;
            const disabled =
              (petal.action === "undo" && !p.canUndo) || (petal.action === "redo" && !p.canRedo);
            return (
              <button
                key={petal.label}
                data-petal
                role="menuitemradio"
                aria-checked={selected}
                aria-label={petal.label}
                title={petal.label}
                tabIndex={open ? (i === focusIndex ? 0 : -1) : -1}
                disabled={disabled}
                onClick={() => {
                  if (petal.tool) {
                    p.setTool(petal.tool);
                    setOpen(false);
                  } else if (petal.action === "undo") p.onUndo();
                  else if (petal.action === "redo") p.onRedo();
                }}
                className={cn(
                  "pointer-events-auto absolute grid size-11 min-h-11 min-w-11 place-items-center rounded-full border border-border/70 bg-card/95 text-foreground shadow-lg backdrop-blur",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "border-ring bg-secondary text-secondary-foreground ring-2 ring-ring/50",
                  disabled && "opacity-40",
                )}
                style={{
                  transition,
                  transitionDelay: reduced || !open ? "0ms" : `${i * 12}ms`,
                  transform: open
                    ? `translate(calc(-50% + ${petal.dx}px), calc(-50% + ${petal.dy}px)) scale(1)`
                    : "translate(-50%,-50%) scale(0.4)",
                  opacity: open ? 1 : 0,
                }}
              >
                <petal.icon className="size-5" />
              </button>
            );
          })}
        </div>

        {/* quick panels */}
        {open && (
          <div
            className="pointer-events-auto absolute w-[232px] rounded-xl border border-border/70 bg-card/97 p-3 shadow-xl backdrop-blur"
            style={{
              transform: `translate(${openLeft ? "calc(-100% - 34px)" : "34px"}, ${
                openUp ? "calc(-100% + 24px)" : "-24px"
              })`,
            }}
          >
            <div className="mb-2 flex items-center gap-1">
              {(["color", "size", "profile"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setPanel((cur) => (cur === k ? "none" : k))}
                  aria-expanded={panel === k}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    panel === k
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>

            {panel === "color" && (
              <div className="grid grid-cols-5 gap-2" role="group" aria-label="Ink colour">
                {PALETTE.map((c) => (
                  <button
                    key={c.hex}
                    aria-label={c.name}
                    aria-pressed={activeColor === c.hex}
                    title={c.name}
                    onClick={() =>
                      p.setPrefs(
                        p.tool === "highlighter"
                          ? { highlighterColor: c.hex }
                          : { penColor: c.hex },
                      )
                    }
                    className={cn(
                      "size-8 rounded-full border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      activeColor === c.hex
                        ? "scale-110 border-ring ring-2 ring-ring/60"
                        : "border-border/70",
                    )}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            )}

            {panel === "size" && (
              <label className="block text-[11px] text-muted-foreground">
                Size
                <input
                  type="range"
                  min={0.002}
                  max={p.tool === "highlighter" ? 0.08 : 0.04}
                  step={0.001}
                  value={activeSize}
                  onChange={(e) =>
                    p.setPrefs(
                      p.tool === "highlighter"
                        ? { highlighterSize: Number(e.target.value) }
                        : { penSize: Number(e.target.value) },
                    )
                  }
                  className="mt-2 w-full accent-[var(--color-primary)]"
                />
                <span className="mt-1 block text-foreground">{(activeSize * 1000).toFixed(0)}</span>
              </label>
            )}

            {panel === "profile" && (
              <div className="grid gap-1" role="group" aria-label="Pen style">
                {PEN_PROFILE_LIST.filter((pr) => pr.id !== "highlighter").map((pr) => (
                  <button
                    key={pr.id}
                    aria-pressed={p.prefs.penProfile === pr.id}
                    onClick={() => p.setPrefs({ penProfile: pr.id as PenProfileId })}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      p.prefs.penProfile === pr.id
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* trigger */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "Close quick tools" : "Open quick tools (drag to move)"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
          className={cn(
            "pointer-events-auto absolute grid place-items-center rounded-full border border-border/70 bg-card/95 text-foreground shadow-xl backdrop-blur",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{
            width: BUTTON,
            height: BUTTON,
            transform: "translate(-50%,-50%)",
            touchAction: "none",
            transition: dragging || reduced ? "none" : "box-shadow 140ms",
          }}
        >
          <span
            className="pointer-events-none absolute inset-1 rounded-full opacity-25"
            style={{ backgroundColor: activeColor }}
          />
          <CircleIcon className="relative size-5" style={{ color: activeColor }} />
        </button>
      </div>
    </div>
  );
}
