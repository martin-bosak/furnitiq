import { create } from "zustand";

/** Mirrors `Layout` in src/lib/chalupa/layout.ts (changes against the exported model, three.js coordinates). */
export type Vec3 = [number, number, number];
export type ItemOverride = { pos: Vec3; rotY: number; deleted?: boolean };
export type AddedItem = { id: string; src: string; pos: Vec3; rotY: number };
export type Layout = { items: Record<string, ItemOverride>; added: AddedItem[] };
export type SelectedInfo = { id: string; label: string; room: string };
export type Tool = "move" | "rotate";
type Status = "idle" | "loading" | "saving" | "saved" | "error" | "conflict";

const EMPTY: Layout = { items: {}, added: [] };
const HISTORY = 100;

type EditState = {
  edit: boolean;
  tool: Tool;
  selected: SelectedInfo | null;
  layout: Layout;
  version: number;
  status: Status;
  past: Layout[];
  future: Layout[];
  setEdit: (on: boolean) => void;
  setTool: (t: Tool) => void;
  select: (s: SelectedInfo | null) => void;
  load: () => Promise<void>;
  /** Apply one undoable change and save it (debounced). */
  commit: (fn: (l: Layout) => Layout) => void;
  undo: () => void;
  redo: () => void;
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useEdit = create<EditState>((set, get) => {
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { layout, version } = get();
      set({ status: "saving" });
      try {
        const res = await fetch("/api/chalupa/layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout, baseVersion: version }),
        });
        if (res.status === 409) {
          // Someone else saved meanwhile: take their version rather than overwrite it.
          const { current } = await res.json();
          set({ layout: current.layout, version: current.version, status: "conflict", past: [], future: [] });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const stored = await res.json();
        set({ version: stored.version, status: "saved" });
      } catch {
        set({ status: "error" });
      }
    }, 500);
  };
  return {
    edit: false,
    tool: "move",
    selected: null,
    layout: EMPTY,
    version: 0,
    status: "idle",
    past: [],
    future: [],
    setEdit: (edit) => set({ edit, selected: edit ? get().selected : null }),
    setTool: (tool) => set({ tool }),
    select: (selected) => set({ selected }),
    load: async () => {
      set({ status: "loading" });
      try {
        const res = await fetch("/api/chalupa/layout", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const stored = await res.json();
        set({ layout: stored.layout ?? EMPTY, version: stored.version ?? 0, status: "idle" });
      } catch {
        set({ status: "error" });
      }
    },
    commit: (fn) => {
      const prev = get().layout;
      const next = fn(prev);
      set({ layout: next, past: [...get().past.slice(-HISTORY), prev], future: [] });
      save();
    },
    undo: () => {
      const { past, layout, future } = get();
      if (!past.length) return;
      set({ layout: past[past.length - 1], past: past.slice(0, -1), future: [layout, ...future] });
      save();
    },
    redo: () => {
      const { past, layout, future } = get();
      if (!future.length) return;
      set({ layout: future[0], future: future.slice(1), past: [...past, layout] });
      save();
    },
  };
});
