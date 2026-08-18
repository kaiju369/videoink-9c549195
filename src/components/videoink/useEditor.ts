import { useCallback, useMemo, useReducer, useRef } from "react";
import { nextZ, translateObject } from "@/lib/videoink/objects";
import { uid, type PageObject } from "@/lib/videoink/types";

const LIMIT = 100;

interface State {
  objects: PageObject[];
  past: PageObject[][];
  future: PageObject[][];
  selection: string[];
  dirty: boolean;
}

type Action =
  | { type: "set"; value: PageObject[] }
  | { type: "commit"; prevSnapshot: PageObject[]; value: PageObject[] }
  | { type: "abort"; snapshot: PageObject[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: PageObject[] }
  | { type: "selection"; value: string[] }
  | { type: "markSaved" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set":
      return { ...state, objects: action.value, dirty: true };
    case "commit": {
      if (action.prevSnapshot === action.value) return { ...state, objects: action.value };
      return {
        ...state,
        objects: action.value,
        past: [...state.past, action.prevSnapshot].slice(-LIMIT),
        future: [],
        dirty: true,
      };
    }
    case "abort":
      return { ...state, objects: action.snapshot };
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        objects: prev,
        past: state.past.slice(0, -1),
        future: [...state.future, state.objects],
        dirty: true,
      };
    }
    case "redo": {
      const next = state.future[state.future.length - 1];
      if (!next) return state;
      return {
        ...state,
        objects: next,
        past: [...state.past, state.objects],
        future: state.future.slice(0, -1),
        dirty: true,
      };
    }
    case "reset":
      return { objects: action.value, past: [], future: [], selection: [], dirty: false };
    case "selection":
      return { ...state, selection: action.value };
    case "markSaved":
      return { ...state, dirty: false };
    default:
      return state;
  }
}

export interface Editor {
  objects: PageObject[];
  selection: string[];
  selected: PageObject[];
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  setSelection: (ids: string[]) => void;
  /** replace objects; commit=false for transient drags (no history entry) */
  apply: (next: PageObject[] | ((prev: PageObject[]) => PageObject[]), commit?: boolean) => void;
  /** push current state to history before a transient drag sequence */
  beginTransient: () => void;
  add: (o: PageObject | PageObject[]) => void;
  remove: (ids: string[]) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  paste: () => void;
  selectAll: () => void;
  updateSelected: (patch: (o: PageObject) => PageObject) => void;
  order: (mode: "front" | "back" | "forward" | "backward") => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  reset: (objects: PageObject[]) => void;
  markSaved: () => void;
  /**
   * Explicit transaction API: a whole interactive drag (draw/move/resize/
   * freehand-erase) should call `begin()` once, then any number of
   * `apply(next, false)` calls, then exactly one `commit()` (or `abort()` to
   * roll back to the pre-drag snapshot). This guarantees the whole drag
   * produces a single undo entry.
   */
  begin: () => void;
  commit: (label?: string) => void;
  abort: () => void;
}

export function useEditor(initial: PageObject[] = []): Editor {
  const [state, dispatch] = useReducer(reducer, {
    objects: initial,
    past: [],
    future: [],
    selection: [],
    dirty: false,
  });
  const objectsRef = useRef(state.objects);
  objectsRef.current = state.objects;
  const clipboard = useRef<PageObject[]>([]);
  /** snapshot captured by begin(); non-null while a transaction is open */
  const txRef = useRef<PageObject[] | null>(null);

  const begin = useCallback(() => {
    txRef.current = objectsRef.current;
  }, []);

  const commit = useCallback((_label?: string) => {
    if (txRef.current === null) return;
    const prevSnapshot = txRef.current;
    txRef.current = null;
    dispatch({ type: "commit", prevSnapshot, value: objectsRef.current });
  }, []);

  const abort = useCallback(() => {
    if (txRef.current === null) return;
    const snapshot = txRef.current;
    txRef.current = null;
    objectsRef.current = snapshot;
    dispatch({ type: "abort", snapshot });
  }, []);

  const apply = useCallback<Editor["apply"]>((next, commitNow = true) => {
    const prevObjects = objectsRef.current;
    const value = typeof next === "function" ? next(prevObjects) : next;
    objectsRef.current = value;
    if (commitNow) {
      const prevSnapshot = txRef.current ?? prevObjects;
      txRef.current = null;
      dispatch({ type: "commit", prevSnapshot, value });
    } else {
      dispatch({ type: "set", value });
    }
  }, []);

  const setSelection = useCallback((ids: string[]) => dispatch({ type: "selection", value: ids }), []);

  const add = useCallback<Editor["add"]>(
    (o) => {
      const list = Array.isArray(o) ? o : [o];
      apply((prev) => {
        let z = nextZ(prev);
        return [...prev, ...list.map((x) => ({ ...x, z: z++ }))];
      });
    },
    [apply],
  );

  const remove = useCallback<Editor["remove"]>(
    (ids) => {
      apply((prev) => prev.filter((o) => !ids.includes(o.id)));
      setSelection(state.selection.filter((id) => !ids.includes(id)));
    },
    [apply, setSelection, state.selection],
  );

  const deleteSelection = useCallback(() => {
    if (state.selection.length) remove(state.selection);
  }, [remove, state.selection]);

  const copySelection = useCallback(() => {
    clipboard.current = state.objects.filter((o) => state.selection.includes(o.id));
  }, [state.objects, state.selection]);

  const pasteList = useCallback(
    (list: PageObject[]) => {
      if (!list.length) return;
      const now = Date.now();
      const clones = list.map((o) => ({
        ...translateObject(o, 0.02, 0.02),
        id: uid(),
        createdAt: now,
      }));
      add(clones);
      setSelection(clones.map((c) => c.id));
    },
    [add, setSelection],
  );

  const paste = useCallback(() => pasteList(clipboard.current), [pasteList]);

  const duplicateSelection = useCallback(
    () => pasteList(state.objects.filter((o) => state.selection.includes(o.id))),
    [state.objects, pasteList, state.selection],
  );

  const selectAll = useCallback(
    () => setSelection(state.objects.map((o) => o.id)),
    [setSelection, state.objects],
  );

  const updateSelected = useCallback<Editor["updateSelected"]>(
    (patch) => {
      apply((prev) => prev.map((o) => (state.selection.includes(o.id) ? patch(o) : o)));
    },
    [apply, state.selection],
  );

  const order = useCallback<Editor["order"]>(
    (mode) => {
      apply((prev) => {
        const sorted = [...prev].sort((a, b) => a.z - b.z);
        const max = sorted.length ? sorted[sorted.length - 1]!.z : 0;
        const min = sorted.length ? sorted[0]!.z : 0;
        return prev.map((o) => {
          if (!state.selection.includes(o.id)) return o;
          if (mode === "front") return { ...o, z: max + 1 };
          if (mode === "back") return { ...o, z: min - 1 };
          return { ...o, z: o.z + (mode === "forward" ? 1.5 : -1.5) };
        });
      });
    },
    [apply, state.selection],
  );

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  const clear = useCallback(() => {
    apply(() => []);
    setSelection([]);
  }, [apply, setSelection]);

  const reset = useCallback((next: PageObject[]) => {
    txRef.current = null;
    objectsRef.current = next;
    dispatch({ type: "reset", value: next });
  }, []);

  const selected = useMemo(
    () => state.objects.filter((o) => state.selection.includes(o.id)),
    [state.objects, state.selection],
  );

  return {
    objects: state.objects,
    selection: state.selection,
    selected,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dirty: state.dirty,
    setSelection,
    apply,
    beginTransient: begin,
    add,
    remove,
    deleteSelection,
    duplicateSelection,
    copySelection,
    paste,
    selectAll,
    updateSelected,
    order,
    undo,
    redo,
    clear,
    reset,
    markSaved: () => dispatch({ type: "markSaved" }),
    begin,
    commit,
    abort,
  };
}
