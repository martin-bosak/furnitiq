"use client";

import { create } from "zustand";
import type { LibraryAsset } from "@/lib/library/types";

type LibraryState = {
  assets: LibraryAsset[];
  loaded: boolean;
  refresh: () => Promise<void>;
  upsert: (a: LibraryAsset) => void;
  remove: (id: string) => Promise<void>;
  byId: (id: string | undefined) => LibraryAsset | undefined;
};

let timer: ReturnType<typeof setTimeout> | null = null;

export const useLibrary = create<LibraryState>((set, get) => ({
  assets: [],
  loaded: false,
  refresh: async () => {
    try {
      const res = await fetch("/api/library", { cache: "no-store" });
      if (res.ok) set({ assets: await res.json(), loaded: true });
    } finally {
      // Keep polling while something is being generated.
      if (timer) clearTimeout(timer);
      if (get().assets.some((a) => a.status === "queued" || a.status === "processing")) timer = setTimeout(() => get().refresh(), 3000);
    }
  },
  upsert: (a) => {
    set((st) => ({ assets: [a, ...st.assets.filter((x) => x.id !== a.id)] }));
    if (a.status !== "ready" && a.status !== "failed") void get().refresh();
  },
  remove: async (id) => {
    await fetch(`/api/library/${id}`, { method: "DELETE" });
    set((st) => ({ assets: st.assets.filter((a) => a.id !== id) }));
  },
  byId: (id) => (id ? get().assets.find((a) => a.id === id) : undefined),
}));
