import type { SnapshotInfo } from "@/lib/videoink/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Download,
  MonitorUp,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  SkipBack,
  SkipForward,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Player,
  qualityLabel,
  type PlayerHandle,
  type PlayerSource,
} from "@/components/videoink/Player";

import { ObjectCanvas } from "@/components/videoink/ObjectCanvas";
import { RadialToolDock } from "@/components/videoink/RadialToolDock";
import { useEditor } from "@/components/videoink/useEditor";
import {
  ExportDialog,
  InkToolbar,
  PageLibrary,
  SettingsDialog,
  TextEditorOverlay,
  ToolIndicator,
  VideoControls,
  type ExportRequest,
} from "@/components/videoink/ui";
import { computeContentRect } from "@/lib/videoink/geometry";
import {
  clearRecovery,
  deletePage,
  listPages,
  loadRecovery,
  nextRanks,
  putPage,
  putPageSafely,
  putPages,
  saveRecovery,
} from "@/lib/videoink/db";
import { ScreenCaptureSession, captureSnapshot } from "@/lib/videoink/capture";
import { makeThumbnail } from "@/lib/videoink/render";
import { exportPages, type ExportHandle } from "@/lib/videoink/export";

import {
  DEFAULT_PREFS,
  PEN_PRESETS,
  applyTemplate,
  loadPrefs,
  savePrefs,
  type Prefs,
} from "@/lib/videoink/prefs";
import {
  actionForCombo,
  defaultKeyMap,
  eventCombo,
  loadKeyMap,
  saveKeyMap,
  type KeyMap,
} from "@/lib/videoink/shortcuts";
import { isSafeVideoUrl, parseYouTubeId, parseYouTubeStart } from "@/lib/videoink/youtube";
import {
  SCHEMA_VERSION,
  formatTime,
  uid,
  type Page,
  type PageObject,
  type TextObject,
  type ToolId,
} from "@/lib/videoink/types";

/** Tool order used by the previous/next tool hotkeys. */
const TOOL_CYCLE: ToolId[] = [
  "select",
  "pen",
  "highlighter",
  "eraser",
  "text",
  "line",
  "arrow",
  "shape",
  "lasso",
  "lassoEraser",
];

/** Eraser modes cycled by the eraser hotkey. */
const ERASER_MODES: Prefs["eraserMode"][] = ["stroke", "freehand", "rect", "circle", "lasso"];


/** Viewport rectangle of the visible video content, for screen-capture cropping. */
function stageViewportRect(
  el: HTMLDivElement | null,
  rect: { left: number; top: number; width: number; height: number },
): DOMRect | null {
  if (!el || !rect.width || !rect.height) return null;
  const box = el.getBoundingClientRect();
  return new DOMRect(box.left + rect.left, box.top + rect.top, rect.width, rect.height);
}


export const Route = createFileRoute("/")({
  component: Workstation,
  head: () => ({
    meta: [
      { title: "VideoInk — Handwritten notes on top of any lecture video" },
      {
        name: "description",
        content:
          "Freeze any video frame, write with your stylus, and keep every page in a searchable local library with PDF, PNG and ZIP export.",
      },
      { property: "og:title", content: "VideoInk — Ink notes over lecture video" },
      {
        property: "og:description",
        content:
          "One-handed hotkeys, pressure-sensitive ink, shapes, text and batch export. Everything stays on your device.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://videoink.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://videoink.lovable.app/" }],
  }),

});

function Workstation() {
  const playerRef = useRef<PlayerHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [source, setSource] = useState<PlayerSource | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [videoTitle, setVideoTitle] = useState("Untitled video");
  const [duration, setDuration] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const [stage, setStage] = useState({ width: 0, height: 0 });

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [qualities, setQualities] = useState<{ id: string; label: string }[]>([]);
  const [quality, setQuality] = useState("auto");

  const captureRef = useRef<ScreenCaptureSession | null>(null);
  const [captureActive, setCaptureActive] = useState(false);


  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [keys, setKeysState] = useState<KeyMap>(defaultKeyMap());
  const [tool, setTool] = useState<ToolId>("pen");
  const [annotating, setAnnotating] = useState(false);
  const [frozenAt, setFrozenAt] = useState(0);
  const [activePage, setActivePage] = useState<Page | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [pages, setPages] = useState<Page[]>([]);
  const [librarySelection, setLibrarySelection] = useState<string[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const exportHandle = useRef<ExportHandle>({ cancelled: false });

  const editor = useEditor();

  /* ------------------------------ boot ------------------------------ */
  useEffect(() => {
    setPrefsState(loadPrefs());
    setKeysState(loadKeyMap());
    void listPages().then(setPages);
    void loadRecovery().then((doc) => {
      if (doc && doc.objects.length) {
        toast("Unsaved page recovered", {
          action: {
            label: "Restore",
            onClick: () => {
              editor.reset(doc.objects);
              setFrozenAt(doc.timestamp);
              setAnnotating(true);
            },
          },
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Library is docked on large screens, an overlay drawer on small ones. */
  useEffect(() => {
    if (window.innerWidth >= 1024) setLibraryOpen(true);
  }, []);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const setKeys = useCallback((k: KeyMap) => {
    setKeysState(k);
    saveKeyMap(k);
  }, []);

  /* ---------------------------- geometry ---------------------------- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStage({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setStage({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const rect = useMemo(
    () => computeContentRect(stage.width, stage.height, aspect),
    [stage.width, stage.height, aspect],
  );

  /* -------------------------- playback poll -------------------------- */
  useEffect(() => {
    if (!source) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const nextCurrent = p.getCurrentTime();
      const nextPlaying = p.isPlaying();
      setCurrent((prev) => (Math.abs(prev - nextCurrent) >= 0.01 ? nextCurrent : prev));
      setPlaying((prev) => (prev === nextPlaying ? prev : nextPlaying));
      const d = p.getDuration();
      if (d && Number.isFinite(d)) setDuration((prev) => (Math.abs(prev - d) > 0.5 ? d : prev));
    }, 250);
    return () => clearInterval(t);
  }, [source]);

  /* ------------------ available resolutions (poll) ------------------- */
  useEffect(() => {
    if (!source) {
      setQualities([]);
      setQuality("auto");
      return;
    }
    let stop = false;
    const read = () => {
      const p = playerRef.current;
      if (!p || stop) return;
      const ids = p.getQualities();
      const size = p.getVideoSize();
      const list = ids.map((id) => ({
        id,
        label:
          id === "auto" && size
            ? `${size.height}p (source)`
            : id === "auto"
              ? "Auto"
              : qualityLabel(id),
      }));
      setQualities((prev) =>
        prev.length === list.length && prev.every((q, i) => q.id === list[i]!.id && q.label === list[i]!.label)
          ? prev
          : list,
      );
      setQuality(p.getQuality());
    };
    read();
    const t = setInterval(read, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [source]);



  /* ------------------------- screen capture -------------------------- */
  const toggleCapture = useCallback(async () => {
    if (!ScreenCaptureSession.supported) {
      toast.error("Screen capture is not supported in this browser");
      return;
    }
    if (captureRef.current?.active) {
      captureRef.current.stop();
      captureRef.current = null;
      setCaptureActive(false);
      toast("Screen capture stopped");
      return;
    }
    const session = new ScreenCaptureSession();
    try {
      await session.start(() => {
        captureRef.current = null;
        setCaptureActive(false);
      });
      captureRef.current = session;
      setCaptureActive(true);
      toast.success("Screen capture on — saved pages now keep the real frame");
    } catch {
      toast.error("Screen capture permission denied");
    }
  }, []);

  useEffect(() => () => captureRef.current?.stop(), []);



  /* --------------------------- recovery ----------------------------- */
  useEffect(() => {
    if (!annotating || !editor.objects.length) return;
    const timer = window.setTimeout(() => {
      void saveRecovery({
        id: "active",
        pageId: activePage?.id,
        title: videoTitle,
        sourceType: source?.type,
        sourceKey: sourceKey(source),
        youtubeVideoId: source?.type === "youtube" ? source.videoId : undefined,
        timestamp: frozenAt,
        duration,
        videoAspectRatio: aspect,
        objects: editor.objects,
        updatedAt: Date.now(),
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [annotating, editor.objects, activePage?.id, videoTitle, source, frozenAt, duration, aspect]);

  /* ---------------------------- actions ----------------------------- */
  const openLinkedPage = useCallback((page: Page) => {
    const linkedSource = page.sourceKey && sourceKey(source) === page.sourceKey;
    const timestamp = page.snapshot?.timestamp ?? page.timestamp;
    if (linkedSource && timestamp != null && playerRef.current) {
      playerRef.current.seek(timestamp);
      setFrozenAt(timestamp);
      setCurrent(timestamp);
    }
    setActivePage(page);
    editor.reset(page.objects);
    setAnnotating(true);
    setEditingTextId(null);
  }, [source, editor]);

  const framePages = useMemo(
    () =>
      pages
        .filter((page) =>
          page.type === "video" &&
          page.timestamp != null &&
          sourceKey(source) != null &&
          page.sourceKey === sourceKey(source),
        )
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)),
    [pages, source],
  );

  const navigateSavedFrame = useCallback(
    (direction: -1 | 1) => {
      if (!framePages.length) {
        toast.info("No saved frames for this video");
        return;
      }
      const now = activePage?.timestamp ?? frozenAt ?? current;
      const epsilon = 0.001;
      const index =
        direction < 0
          ? framePages.reduce((best, page, i) => (page.timestamp! < now - epsilon ? i : best), -1)
          : framePages.findIndex((page) => page.timestamp! > now + epsilon);

      const targetIndex =
        index >= 0
          ? index
          : direction < 0
            ? framePages.length - 1
            : 0;
      const target = framePages[targetIndex];
      if (target) openLinkedPage(target);
    },
    [framePages, activePage, frozenAt, current, openLinkedPage],
  );

  const flashLabel = (label: string) => {
    setFlash(label);
    setTimeout(() => setFlash(null), 900);
  };

  const startAnnotation = useCallback(() => {
    if (annotating) return;
    playerRef.current?.pause();
    setFrozenAt(playerRef.current?.getCurrentTime() ?? 0);
    setActivePage(null);
    editor.reset([]);
    setAnnotating(true);
  }, [annotating, editor]);

  const cancelAnnotation = useCallback(() => {
    setAnnotating(false);
    setEditingTextId(null);
    editor.reset([]);
    void clearRecovery();
  }, [editor]);

  const savePage = useCallback(async () => {
    if (!annotating) return;
    const objects = editor.objects;
    if (!objects.length) {
      toast.error("Nothing to save yet");
      return;
    }
    const normalizedTimestamp =
      source && Number.isFinite(frozenAt) ? Math.max(0, frozenAt) : undefined;
    // Re-saving the same video instant should update the existing frame page,
    // not create a second indistinguishable library item.
    const duplicateFrame =
      !activePage && source && normalizedTimestamp != null
        ? pages.find(
            (p) =>
              p.type === "video" &&
              p.sourceKey === sourceKey(source) &&
              p.timestamp != null &&
              Math.abs(p.timestamp - normalizedTimestamp) < 0.05,
          ) ?? null
        : null;
    const targetPage = activePage ?? duplicateFrame;
    const ranks = targetPage
      ? { rank: targetPage.createdRank, order: targetPage.currentOrder }
      : await nextRanks();
    const snapshot = targetPage?.snapshot?.dataUrl
      ? targetPage.snapshot
      : await captureSnapshot({
          rect: { left: 0, top: 0, width: rect.width || 1280, height: rect.height || 720 },
          objects,
          videoEl: playerRef.current?.getVideoElement() ?? null,
          youtubeVideoId: source?.type === "youtube" ? source.videoId : undefined,
          sourceKey: sourceKey(source),
          timestamp: source ? normalizedTimestamp : undefined,
          viewportRect: stageViewportRect(stageRef.current, rect),
          session: captureRef.current,
        });


    const snapshotWithLink: SnapshotInfo = source
      ? { ...snapshot, timestamp: normalizedTimestamp, sourceKey: sourceKey(source) }
      : snapshot;

    const page: Page = {
      id: targetPage?.id ?? uid(),
      schemaVersion: SCHEMA_VERSION,
      type: targetPage?.type ?? (source ? "video" : "blank"),
      createdRank: ranks.rank,
      currentOrder: ranks.order,
      title:
        targetPage?.title ??
        (source
          ? `${videoTitle} @ ${formatTime(normalizedTimestamp ?? frozenAt)}`
          : (objects.find((o) => o.kind === "text" && o.text.trim()) as TextObject | undefined)?.text.trim().slice(0, 80) ||
            "Blank note"),
      sourceType: source?.type,
      sourceKey: sourceKey(source),
      youtubeVideoId: source?.type === "youtube" ? source.videoId : undefined,
      videoTitle,
      timestamp: source ? frozenAt : undefined,
      duration,
      aspectRatio: aspect,
      objects,
      snapshot: snapshotWithLink,
      createdAt: targetPage?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    page.thumbnail = await makeThumbnail(page);
    await putPage(page);
    setPages((prev) => {
      const exists = prev.some((p) => p.id === page.id);
      return exists ? prev.map((p) => (p.id === page.id ? page : p)) : [...prev, page];
    });
    editor.markSaved();
    editor.reset([]);
    setActivePage(null);
    setAnnotating(false);
    setEditingTextId(null);
    void clearRecovery();
    playerRef.current?.play();
    toast.success("Page saved");
  }, [annotating, editor, activePage, rect, source, videoTitle, frozenAt, duration, aspect]);

  const deleteCurrentPage = useCallback(async () => {
    if (activePage) {
      const deletedId = activePage.id;
      await deletePage(deletedId);
      setPages((prev) => prev.filter((page) => page.id !== deletedId));
      toast.success("Page deleted");
    }
    setActivePage(null);
    editor.reset([]);
    setAnnotating(false);
    setEditingTextId(null);
    void clearRecovery();
  }, [activePage, editor]);


  /* ---------------------- blank-page autosave ---------------------- */
  useEffect(() => {
    if (!annotating || activePage?.type !== "blank" || !editor.dirty) return;
    const timer = window.setTimeout(async () => {
      const updated: Page = {
        ...activePage,
        objects: editor.objects,
        updatedAt: Date.now(),
      };
      await putPage(updated);
      setActivePage(updated);
      setPages((prev) => prev.map((page) => (page.id === updated.id ? updated : page)));
      editor.markSaved();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [annotating, activePage, editor.objects, editor.dirty]);

  /** A full-width empty text block so a blank note is typable immediately. */
  const makeNoteTextBlock = useCallback((): TextObject => ({
    kind: "text",
    id: uid(),
    z: 1,
    createdAt: Date.now(),
    x: 0.06,
    y: 0.08,
    w: 0.88,
    h: 0.84,
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
  }), [prefs.text]);

  const addBlankPage = useCallback(async () => {
    const ranks = await nextRanks();
    // Phase 7: blank notes are edited in place — the page opens with a live
    // text block already focused, so there is no modal detour before typing.
    const block = makeNoteTextBlock();
    const page: Page = {
      id: uid(),
      schemaVersion: SCHEMA_VERSION,
      type: "blank",
      createdRank: ranks.rank,
      currentOrder: ranks.order,
      title: `Blank note ${ranks.rank}`,
      aspectRatio: aspect,
      objects: [block],
      snapshot: { status: "unavailable" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await putPage(page);
    setPages((prev) => [...prev, page]);
    setActivePage(page);
    editor.reset([block]);
    setAnnotating(true);
    setTool("text");
    setEditingTextId(block.id);
  }, [aspect, editor, makeNoteTextBlock]);

  const openPage = useCallback(
    (page: Page) => {
      setActivePage(page);
      editor.reset(page.objects);
      setAnnotating(true);
      if (page.timestamp != null) playerRef.current?.seek(page.timestamp);
      setFrozenAt(page.timestamp ?? 0);
      // Blank notes reopen straight into in-place text editing.
      if (page.type === "blank") {
        const block = page.objects.find((o) => o.kind === "text");
        if (block) {
          setTool("text");
          setEditingTextId(block.id);
          return;
        }
      }
      setEditingTextId(null);
    },
    [editor],
  );

  const deletePages = useCallback(async (ids: string[]) => {
    for (const id of ids) await deletePage(id);
    const deleted = new Set(ids);
    setPages((prev) => prev.filter((page) => !deleted.has(page.id)));
    setLibrarySelection([]);
    toast.success(`${ids.length} page${ids.length === 1 ? "" : "s"} deleted`);
  }, []);

  const duplicatePages = useCallback(
    async (ids: string[]) => {
      let ranks = await nextRanks();
      const copies: Page[] = [];
      for (const id of ids) {
        const p = pages.find((x) => x.id === id);
        if (!p) continue;
        copies.push({
          ...p,
          id: uid(),
          createdRank: ranks.rank,
          currentOrder: ranks.order,
          title: `${p.title} (copy)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        ranks = { rank: ranks.rank + 1, order: ranks.order + 1 };
      }
      await putPages(copies);
      setPages((prev) => [...prev, ...copies]);
    },
    [pages],
  );

  const reorderPages = useCallback(
    async (orderedIds: string[]) => {
      const updated = orderedIds
        .map((id, i) => {
          const p = pages.find((x) => x.id === id);
          return p ? { ...p, currentOrder: i + 1, updatedAt: Date.now() } : null;
        })
        .filter((p): p is Page => p !== null);
      await putPages(updated);
      setPages((prev) => {
        const byId = new Map(updated.map((page) => [page.id, page]));
        return prev.map((page) => byId.get(page.id) ?? page);
      });
      setPrefs({ librarySort: "manual" });
    },
    [pages, setPrefs],
  );

  const runExport = useCallback(
    async (req: ExportRequest) => {
      const scoped =
        req.scope === "current"
          ? activePage
            ? [activePage]
            : []
          : req.scope === "selected"
            ? pages.filter((p) => librarySelection.includes(p.id))
            : pages;
      const ordered = [...scoped].sort((a, b) =>
        req.order === "creation"
          ? a.createdRank - b.createdRank
          : req.order === "timestamp"
            ? (a.timestamp ?? 0) - (b.timestamp ?? 0)
            : a.currentOrder - b.currentOrder,
      );
      exportHandle.current = { cancelled: false };
      setExportProgress("Starting…");
      try {
        await exportPages(
          ordered,
          {
            format: req.format,
            filename: req.filename,
            includeDate: req.includeDate,
            includePageNumbers: req.includePageNumbers,
            mode: req.mode,
            resolutionWidth: 1920,
            jpegQuality: 0.92,
          },
          (p) => setExportProgress(`${p.phase} ${p.done}/${p.total}`),
          exportHandle.current,
        );
        toast.success("Export complete");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Export failed");
      } finally {
        setExportProgress(null);
        setExportOpen(false);
      }
    },
    [activePage, pages, librarySelection],
  );

  /* ----------------------- live page autosave ----------------------- */
  // Blank pages are real documents, not temporary annotation sessions.
  // Persist their edits automatically while the user is working so leaving
  // the page does not require an explicit Save click.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSeqRef = useRef(0);
  useEffect(() => {
    if (!activePage || activePage.type !== "blank" || !annotating || !editor.dirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const seq = ++autosaveSeqRef.current;
    autosaveTimerRef.current = setTimeout(async () => {
      const objects = editor.objects;
      const updated: Page = {
        ...activePage,
        objects,
        updatedAt: Date.now(),
      };
      try {
        const saved = await putPageSafely(updated);
        // Do not overwrite a newer local edit with an older async write.
        if (seq === autosaveSeqRef.current) {
          setActivePage(saved);
          setPages((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
          editor.markSaved();
        }
      } catch {
        toast.error("Could not autosave this blank page");
      }
    }, 650);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [activePage, annotating, editor.dirty, editor.objects, editor, setPages]);

  /* --------------------------- shortcuts ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const isEditable = !!t && (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable ||
        !!t.closest("[contenteditable=\"true\"]")
      );
      // Never let global shortcuts hijack typing, browser text editing,
      // or IME composition.
      if (isEditable || e.isComposing || e.key === "Process" || e.key === "Dead") return;
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        navigateSavedFrame(-1);
        return;
      }
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        navigateSavedFrame(1);
        return;
      }
      const action = actionForCombo(keys, eventCombo(e));
      if (!action) return;
      e.preventDefault();
      if (action.startsWith("tool.") && !["tool.prev", "tool.next", "tool.reset"].includes(action)) {
        const id = action.slice(5) as ToolId;
        setTool(id);
        flashLabel(id);
        return;
      }
      if (action === "tool.prev" || action === "tool.next") {
        const i = TOOL_CYCLE.indexOf(tool);
        const n = TOOL_CYCLE.length;
        const next = TOOL_CYCLE[(((action === "tool.next" ? i + 1 : i - 1) % n) + n) % n]!;
        setTool(next);
        flashLabel(next);
        return;
      }
      if (action === "tool.reset") {
        setTool("pen");
        flashLabel("pen");
        return;
      }
      switch (action) {
        case "annotate":
          startAnnotation();
          break;
        case "save":
          void savePage();
          break;
        case "undo":
          editor.undo();
          break;
        case "redo":
          editor.redo();
          break;
        case "clear":
          editor.clear();
          break;
        case "delete":
          editor.deleteSelection();
          break;
        case "duplicate":
          editor.duplicateSelection();
          break;
        case "copy":
          editor.copySelection();
          break;
        case "paste":
          editor.paste();
          break;
        case "selectAll":
          editor.selectAll();
          break;
        case "size.fine":
        case "size.medium":
        case "size.bold": {
          const preset =
            PEN_PRESETS[action === "size.fine" ? 0 : action === "size.medium" ? 1 : 2]!;
          setPrefs(
            tool === "highlighter"
              ? { highlighterSize: preset.size * 1.6 }
              : { penSize: preset.size },
          );
          flashLabel(preset.label);
          break;
        }
        case "customColor":
          setSettingsOpen(true);
          break;
        case "shape.fill":
          setPrefs({ shapeFill: !prefs.shapeFill });
          flashLabel(prefs.shapeFill ? "Fill off" : "Fill on");
          break;
        case "capture":
          void toggleCapture();
          break;
        case "eraser.cycle": {
          const i = ERASER_MODES.indexOf(prefs.eraserMode);
          const next = ERASER_MODES[(i + 1) % ERASER_MODES.length]!;
          setPrefs({ eraserMode: next });
          setTool(next === "lasso" ? "lassoEraser" : "eraser");
          flashLabel(`Eraser: ${next}`);
          break;
        }
        case "page.blank":
          void addBlankPage();
          break;
        case "page.delete":
          void deleteCurrentPage();
          break;

        case "library.toggle":
          setLibraryOpen((v) => !v);
          break;
        case "export":
          setExportOpen(true);
          break;
        case "settings":
          setSettingsOpen(true);
          break;
        case "cancel":
          e.preventDefault();
          e.stopPropagation();
          if (editingTextId) setEditingTextId(null);
          else cancelAnnotation();
          break;
        case "playPause":
          if (!annotating) {
            if (playerRef.current?.isPlaying()) playerRef.current.pause();
            else playerRef.current?.play();
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    keys,
    editor,
    tool,
    prefs.eraserMode,
    prefs.shapeFill,
    annotating,
    editingTextId,
    startAnnotation,
    savePage,
    cancelAnnotation,
    addBlankPage,
    deleteCurrentPage,
    toggleCapture,
    setPrefs,
  , navigateSavedFrame]);


  /* ----------------------------- source ----------------------------- */
  const openUrl = () => {
    const value = urlInput.trim();
    if (!value) return;
    const yt = parseYouTubeId(value);
    if (yt) {
      setSource({ type: "youtube", videoId: yt, title: "YouTube video" });
      const start = parseYouTubeStart(value);
      if (start > 0) window.setTimeout(() => playerRef.current?.seek(start), 900);
      return;
    }
    if (!isSafeVideoUrl(value)) {
      toast.error("That doesn't look like a valid video link");
      return;
    }
    setSource({ type: "url", url: value, title: value.split("/").pop() || "Video" });
  };

  const objectUrlRef = useRef<string | null>(null);
  const openFile = (file: File) => {
    if (!file.type.startsWith("video/")) {
      toast.error("Please choose a video file");
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setSource({ type: "file", url, title: file.name });
  };
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );


  const editingText = useMemo(
    () =>
      (editor.objects.find((o) => o.id === editingTextId && o.kind === "text") as
        | TextObject
        | undefined) ?? null,
    [editor.objects, editingTextId],
  );

  const defaultFilename = applyTemplate(prefs.filenameTemplate, {
    videoTitle,
    date: new Date().toISOString().slice(0, 10),
    type: "pages",
  });

  return (
    <main className="flex h-dvh w-full flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
        <h1 className="font-display text-xl italic tracking-tight">
          VideoInk
          <span className="ml-2 hidden text-sm not-italic text-muted-foreground sm:inline">
            Video annotation tool for lecture videos
          </span>
        </h1>

        <div className="flex min-w-[240px] flex-1 items-center gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && openUrl()}
            placeholder="Paste a YouTube or video URL"
            aria-label="Video URL"
            className="h-9"
          />
          <Button size="sm" onClick={openUrl}>
            Open
          </Button>
          <label className="cursor-pointer">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 px-3 text-sm">
              <Upload className="size-4" /> File
            </span>
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) openFile(f);
              }}
            />
          </label>
        </div>
        <Button
          size="sm"
          variant={captureActive ? "secondary" : "outline"}
          onClick={() => void toggleCapture()}
          className="gap-1.5"
          title={
            captureActive
              ? "Screen capture is on — click to stop sharing"
              : "Grant screen capture so saved pages keep the real video frame"
          }
        >
          <MonitorUp className="size-4" />
          {captureActive ? "Capture on" : "Allow capture"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setExportOpen(true)} className="gap-1.5">
          <Download className="size-4" /> Export
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)} className="gap-1.5">
          <Settings2 className="size-4" /> Settings
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={libraryOpen ? "Hide page library" : "Show page library"}
          title={libraryOpen ? "Hide page library" : "Show page library"}
          onClick={() => setLibraryOpen((v) => !v)}
        >
          {libraryOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
        </Button>

      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div ref={stageRef} className="relative min-h-0 flex-1 bg-black/60">
            <Player
              ref={playerRef}
              source={activePage?.type === "blank" ? null : source}
              fit={rect}
              onReady={(info) => {
                setDuration(info.duration);
                setVideoTitle(info.title);
                setAspect(info.aspect);
              }}
              onError={(message) => toast.error(message)}
            />

            <ObjectCanvas
              rect={rect}
              width={stage.width}
              height={stage.height}
              editor={editor}
              tool={tool}
              prefs={prefs}
              enabled={annotating}
              editingTextId={editingTextId}
              onEditText={setEditingTextId}
              onToolChange={setTool}
              onRecognized={flashLabel}
            />
            {editingText && (
              <TextEditorOverlay
                obj={editingText}
                rect={rect}
                onChange={(patch) =>
                  editor.apply(
                    (prev) =>
                      prev.map((o) =>
                        o.id === editingText.id ? ({ ...o, ...patch } as PageObject) : o,
                      ),
                    false,
                  )
                }
                onDone={() => setEditingTextId(null)}
              />
            )}

            <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-2">
              <ToolIndicator tool={tool} prefs={prefs} keys={keys} flash={flash} />
              {annotating && (
                <span className="rounded bg-background/85 px-2 py-1 text-[11px]">
                  {source ? `Frozen at ${formatTime(frozenAt)}` : "Blank note — click Text to type directly"}
                </span>
              )}
            </div>

            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              {annotating ? (
                <InkToolbar
                  tool={tool}
                  setTool={setTool}
                  prefs={prefs}
                  setPrefs={setPrefs}
                  keys={keys}
                  canUndo={editor.canUndo}
                  canRedo={editor.canRedo}
                  onUndo={editor.undo}
                  onRedo={editor.redo}
                  onClear={editor.clear}
                  onSave={() => void savePage()}
                  onCancel={cancelAnnotation}
                  onOpenColor={() => setSettingsOpen(true)}
                  captureActive={captureActive}
                  onToggleCapture={() => void toggleCapture()}
                  canDeletePage={!!activePage}
                  onDeletePage={() => void deleteCurrentPage()}
                />
              ) : (
                <Button className="pointer-events-auto" onClick={startAnnotation}>
                  Freeze &amp; annotate (A)
                </Button>
              )}
            </div>
          </div>

          {source && (
            <div className="border-t border-border/70 p-2">
              <div className="mb-2 flex items-center justify-end gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  title="Previous saved frame"
                  aria-label="Previous saved frame"
                  disabled={annotating || !framePages.length}
                  onClick={() => navigateSavedFrame(-1)}
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs text-muted-foreground">
                  {framePages.length ? `${framePages.length} saved frame${framePages.length === 1 ? "" : "s"}` : "No saved frames"}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  title="Next saved frame"
                  aria-label="Next saved frame"
                  disabled={annotating || !framePages.length}
                  onClick={() => navigateSavedFrame(1)}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>
              <VideoControls
                playing={playing}
                current={current}
                duration={duration}
                volume={volume}
                muted={muted}
                rate={rate}
                disabled={annotating}
                onPlayPause={() => {
                  const p = playerRef.current;
                  if (!p) return;
                  if (p.isPlaying()) p.pause();
                  else p.play();
                }}
                onSeek={(t) => {
                  setCurrent(t);
                  playerRef.current?.seek(t);
                }}
                onSkip={(d) => {
                  const p = playerRef.current;
                  if (!p) return;
                  const t = Math.max(0, Math.min(p.getCurrentTime() + d, duration || Infinity));
                  setCurrent(t);
                  p.seek(t);
                }}
                onVolume={(v) => {
                  setVolume(v);
                  setMuted(v === 0);
                  playerRef.current?.setVolume(v);
                  playerRef.current?.setMuted(v === 0);
                }}
                onMute={() => {
                  const next = !muted;
                  setMuted(next);
                  playerRef.current?.setMuted(next);
                }}
                onRate={(r) => {
                  setRate(r);
                  playerRef.current?.setPlaybackRate(r);
                }}
                qualities={qualities}
                quality={quality}
                onQuality={(q) => {
                  setQuality(q);
                  playerRef.current?.setQuality(q);
                }}

                onFullscreen={() => {
                  const el = stageRef.current;
                  if (!el) return;
                  if (document.fullscreenElement) void document.exitFullscreen();
                  else void el.requestFullscreen?.();
                }}
              />
            </div>
          )}
        </section>


        {libraryOpen && (
          <div
            className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
            onClick={() => setLibraryOpen(false)}
            aria-hidden
          />
        )}
        {libraryOpen && (
          <aside className="fixed inset-y-0 right-0 z-40 flex w-[92vw] max-w-[380px] flex-col border-l border-border/70 bg-background p-3 lg:static lg:z-auto lg:w-[340px] lg:max-w-none lg:shrink-0 xl:w-[400px]">
            <Button
              size="sm"
              variant="ghost"
              className="mb-1 self-end lg:hidden"
              onClick={() => setLibraryOpen(false)}
            >
              Close
            </Button>
            <PageLibrary
              pages={pages}
              currentSourceKey={sourceKey(source) ?? null}
              activeId={activePage?.id ?? null}
              selection={librarySelection}
              view={prefs.libraryView}
              sort={prefs.librarySort}
              onView={(v) => setPrefs({ libraryView: v })}
              onSort={(s) => setPrefs({ librarySort: s })}
              onSelectionChange={setLibrarySelection}
              onOpen={openLinkedPage}
              onEnlarge={openLinkedPage}
              onDelete={(ids) => void deletePages(ids)}
              onDuplicate={(ids) => void duplicatePages(ids)}
              onReorder={(ids) => void reorderPages(ids)}
              onExport={(ids) => {
                setLibrarySelection(ids);
                setExportOpen(true);
              }}
              onAddBlank={() => void addBlankPage()}
            />
          </aside>
        )}
      </div>

      {/* Floating radial toolset — additive companion to the main toolbar. */}
      <RadialToolDock
        tool={tool}
        setTool={setTool}
        prefs={prefs}
        setPrefs={setPrefs}
        onUndo={editor.undo}
        onRedo={editor.redo}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        hidden={!annotating || settingsOpen || exportOpen || !!editingTextId}
      />



      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultFilename={defaultFilename}
        defaultFormat={prefs.exportFormat}
        counts={{
          current: activePage ? 1 : 0,
          selected: librarySelection.length,
          all: pages.length,
        }}
        progress={exportProgress}
        onExport={(req) => void runExport(req)}
        onCancelExport={() => {
          exportHandle.current.cancelled = true;
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        prefs={prefs}
        setPrefs={setPrefs}
        keys={keys}
        setKeys={setKeys}
      />
    </main>
  );
}

function sourceKey(source: PlayerSource | null): string | undefined {
  if (!source) return undefined;
  return source.type === "youtube" ? `yt:${source.videoId}` : `${source.type}:${source.title}`;
}
