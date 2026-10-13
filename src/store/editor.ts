"use client";

import { create } from "zustand";
import { applyOps, type SceneOp } from "@/lib/scene/ops";
import { sampleScene } from "@/lib/scene/sample";
import type { Scene, Selection, Vec2 } from "@/lib/scene/schema";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ops?: SceneOp[];
  pending?: boolean;
  /** Snapshot of the context the user attached when sending. */
  context?: { selection?: string; pin?: Vec2 };
};

export type Render = { id: string; url: string; cameraName: string; prompt: string; createdAt: string };

export type AiProvider = "openrouter" | "claude" | "allio";

type EditorState = {
  projectId: string | null;
  /** Server version the local scene is based on (optimistic concurrency). */
  updatedAt: string | null;
  scene: Scene;
  past: Scene[];
  future: Scene[];
  dirty: boolean;
  saving: boolean;
  selection: Selection;
  /** Point picked on the plan; added to chat context. */
  pin: Vec2 | null;
  messages: ChatMessage[];
  renders: Render[];
  provider: AiProvider;
  allioAgent: string;
  /** Path-traced photo mode in the 3D view. */
  photoMode: boolean;
  photoSamples: number;
  exposure: number;

  load: (projectId: string | null, scene: Scene, renders?: Render[], updatedAt?: string | null) => void;
  /** Undoable change. */
  commit: (next: Scene | ((s: Scene) => Scene)) => void;
  /** Non-undoable change (drag in progress). Call `checkpoint()` once before. */
  transient: (next: (s: Scene) => Scene) => void;
  checkpoint: () => void;
  applyOps: (ops: SceneOp[]) => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection) => void;
  setPin: (p: Vec2 | null) => void;
  setActiveCamera: (id: string) => void;
  pushMessage: (m: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  addRender: (r: Render) => void;
  setSaving: (v: boolean) => void;
  markSaved: (updatedAt: string) => void;
  setProvider: (p: AiProvider) => void;
  setAllioAgent: (a: string) => void;
  setPhotoMode: (v: boolean) => void;
  setPhotoSamples: (n: number) => void;
  setExposure: (v: number) => void;
};

const HISTORY = 100;

export const useEditor = create<EditorState>((set, get) => ({
  projectId: null,
  updatedAt: null,
  scene: sampleScene(),
  past: [],
  future: [],
  dirty: false,
  saving: false,
  selection: null,
  pin: null,
  messages: [],
  renders: [],
  provider: "openrouter",
  allioAgent: "",
  photoMode: false,
  photoSamples: 0,
  exposure: 1,

  load: (projectId, scene, renders = [], updatedAt = null) =>
    set({ projectId, scene, renders, updatedAt, past: [], future: [], dirty: false, saving: false, selection: null, pin: null }),

  commit: (next) =>
    set((st) => {
      const scene = typeof next === "function" ? next(st.scene) : next;
      if (scene === st.scene) return st;
      return { scene, past: [...st.past, st.scene].slice(-HISTORY), future: [], dirty: true };
    }),

  transient: (fn) => set((st) => ({ scene: fn(st.scene), dirty: true })),

  checkpoint: () => set((st) => ({ past: [...st.past, st.scene].slice(-HISTORY), future: [] })),

  applyOps: (ops) => get().commit((s) => applyOps(s, ops)),

  undo: () =>
    set((st) => {
      const prev = st.past.at(-1);
      if (!prev) return st;
      return { scene: prev, past: st.past.slice(0, -1), future: [st.scene, ...st.future], dirty: true };
    }),

  redo: () =>
    set((st) => {
      const [next, ...rest] = st.future;
      if (!next) return st;
      return { scene: next, past: [...st.past, st.scene], future: rest, dirty: true };
    }),

  select: (selection) => set({ selection }),
  setPin: (pin) => set({ pin }),
  setActiveCamera: (id) => set((st) => ({ scene: { ...st.scene, activeCameraId: id }, dirty: true })),
  pushMessage: (m) => set((st) => ({ messages: [...st.messages, m] })),
  updateMessage: (id, patch) =>
    set((st) => ({ messages: st.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  addRender: (r) => set((st) => ({ renders: [r, ...st.renders] })),
  setSaving: (saving) => set({ saving }),
  markSaved: (updatedAt) => set({ dirty: false, saving: false, updatedAt }),
  setProvider: (provider) => set({ provider }),
  setAllioAgent: (allioAgent) => set({ allioAgent }),
  setPhotoMode: (photoMode) => set({ photoMode, photoSamples: 0 }),
  setPhotoSamples: (photoSamples) => set({ photoSamples }),
  setExposure: (exposure) => set({ exposure }),
}));

export function activeCamera(scene: Scene) {
  return scene.cameras.find((c) => c.id === scene.activeCameraId) ?? scene.cameras[0];
}
