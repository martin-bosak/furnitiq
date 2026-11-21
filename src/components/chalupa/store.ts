import { create } from "zustand";

/** 0 = whole house from outside, otherwise the floor id (cut view). */
export type View = 0 | 1 | 2 | 3;

export type Mode = "orbit" | "walk";

type Layers = { furniture: boolean; roof: boolean; site: boolean; labels: boolean; xray: boolean };

type ChalupaState = {
  view: View;
  room: string | null;
  /** Section height above the floor of the current view, in meters. */
  cut: number;
  layers: Layers;
  /** Bumped to ask the camera to fly to the current view or room. */
  flyNonce: number;
  /** Orbit around the model, or walk through it at eye level. */
  mode: Mode;
  /** Evening: dark sky, lamps on. */
  night: boolean;
  /** Room the walker is in (walk mode). */
  walkRoom: string | null;
  setMode: (m: Mode) => void;
  setNight: (on: boolean) => void;
  setWalkRoom: (id: string | null) => void;
  setView: (v: View) => void;
  setRoom: (id: string | null, floor?: number) => void;
  setCut: (m: number) => void;
  toggle: (k: keyof Layers) => void;
  resetCamera: () => void;
};

export const useChalupa = create<ChalupaState>((set) => ({
  view: 0,
  room: null,
  cut: 1.6,
  layers: { furniture: true, roof: true, site: true, labels: true, xray: false },
  flyNonce: 0,
  mode: "orbit",
  night: false,
  walkRoom: null,
  setMode: (mode) => set((s) => (mode === s.mode ? {} : { mode, flyNonce: s.flyNonce + 1 })),
  setNight: (night) => set({ night }),
  setWalkRoom: (walkRoom) => set({ walkRoom }),
  setView: (view) => set((s) => ({ view, room: null, flyNonce: s.flyNonce + 1 })),
  setRoom: (room, floor) =>
    set((s) => ({ room, view: room && floor ? (floor as View) : s.view, flyNonce: s.flyNonce + 1 })),
  setCut: (cut) => set({ cut }),
  toggle: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  resetCamera: () => set((s) => ({ room: null, flyNonce: s.flyNonce + 1 })),
}));
