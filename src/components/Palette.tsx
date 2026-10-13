"use client";

import { Armchair, Bath, Bed, BookOpen, Box, ChefHat, Flower2, Lamp, Plus, Refrigerator, Sofa, Square, Table, Tv } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { CATALOG, type CatalogKey } from "@/lib/scene/catalog";
import { sceneBounds } from "@/lib/scene/ops";
import { useEditor } from "@/store/editor";

const ICONS: Partial<Record<CatalogKey, React.ComponentType<{ size?: number }>>> = {
  sofa: Sofa,
  armchair: Armchair,
  bed: Bed,
  tv: Tv,
  tv_stand: Tv,
  bathtub: Bath,
  kitchen_counter: ChefHat,
  fridge: Refrigerator,
  plant: Flower2,
  floor_lamp: Lamp,
  bookshelf: BookOpen,
  dining_table: Table,
  coffee_table: Table,
  desk: Table,
  rug: Square,
};

const GROUPS = ["living", "bedroom", "dining", "kitchen", "bath", "office", "decor"] as const;

export function Palette() {
  const [open, setOpen] = useState(false);
  const { applyOps, select } = useEditor.getState();

  const add = (type: CatalogKey) => {
    const st = useEditor.getState();
    const b = sceneBounds(st.scene);
    const pos = st.pin ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
    const before = new Set(st.scene.furniture.map((f) => f.id));
    applyOps([{ op: "add_furniture", type, position: pos }]);
    const added = useEditor.getState().scene.furniture.find((f) => !before.has(f.id));
    if (added) select({ kind: "furniture", id: added.id });
    setOpen(false);
  };

  return (
    <div className="absolute bottom-3 left-3 z-10" onPointerDown={(e) => e.stopPropagation()}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            className="glass-strong scroll-thin mb-2 max-h-[60vh] w-[22rem] overflow-y-auto rounded-3xl p-3"
          >
            <div className="mb-1 px-1 text-[11px] text-white/40">Adds at the pinned location (click on the plan to pin)</div>
            {GROUPS.map((g) => {
              const items = (Object.keys(CATALOG) as CatalogKey[]).filter((k) => CATALOG[k].category === g);
              if (!items.length) return null;
              return (
                <div key={g} className="mt-2">
                  <div className="mb-1 px-1 text-[10px] tracking-widest text-white/30 uppercase">{g}</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {items.map((k) => {
                      const Icon = ICONS[k] ?? Box;
                      return (
                        <button
                          key={k}
                          onClick={() => add(k)}
                          className="group flex flex-col items-center gap-1 rounded-2xl border border-white/5 bg-white/[0.03] px-1 py-2.5 text-[11px] text-white/70 transition hover:border-cyan-300/30 hover:bg-white/[0.07] hover:text-white"
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/70 group-hover:text-cyan-200">
                            <Icon size={16} />
                          </span>
                          {CATALOG[k].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={() => setOpen((v) => !v)} className="glass flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-sm text-white/80 hover:text-white">
        <span className={`grid h-6 w-6 place-items-center rounded-full bg-cyan-300/90 text-[#07080c] transition ${open ? "rotate-45" : ""}`}>
          <Plus size={15} strokeWidth={2.5} />
        </span>
        Furniture
      </button>
    </div>
  );
}
