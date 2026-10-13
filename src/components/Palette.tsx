"use client";

import { Armchair, Bath, Bed, BookOpen, Box, ChefHat, Flower2, Lamp, Plus, Refrigerator, Search, Sofa, Square, Table, Tv } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
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

/** Extra search words so people find items by the name they think of. */
const ALIASES: Partial<Record<CatalogKey, string>> = {
  sofa: "couch settee",
  armchair: "chair recliner seat",
  coffee_table: "table",
  tv_stand: "sideboard media console",
  tv: "television screen",
  rug: "carpet mat",
  bookshelf: "shelf shelves bookcase cabinet",
  bed: "mattress",
  nightstand: "bedside drawers chest",
  wardrobe: "closet cabinet cupboard",
  dining_table: "table",
  chair: "seat stool",
  desk: "table workspace",
  office_chair: "chair desk",
  kitchen_counter: "kitchen cabinets worktop island",
  fridge: "refrigerator",
  bathtub: "tub bath",
  toilet: "wc",
  sink: "basin vanity washbasin",
  plant: "flower tree green",
  floor_lamp: "light",
  box: "generic cube",
};

function matches(k: CatalogKey, q: string) {
  const hay = `${CATALOG[k].label} ${k.replace(/_/g, " ")} ${CATALOG[k].category} ${ALIASES[k] ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function Palette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { applyOps, select } = useEditor.getState();

  const results = useMemo(() => (Object.keys(CATALOG) as CatalogKey[]).filter((k) => matches(k, query)), [query]);

  const toggle = () => {
    setQuery("");
    setActive(0);
    setOpen((v) => !v);
  };

  const add = (type: CatalogKey) => {
    const st = useEditor.getState();
    const b = sceneBounds(st.scene);
    const pos = st.pin ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
    const before = new Set(st.scene.furniture.map((f) => f.id));
    applyOps([{ op: "add_furniture", type, position: pos }]);
    const added = useEditor.getState().scene.furniture.find((f) => !before.has(f.id));
    if (added) select({ kind: "furniture", id: added.id });
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      add(results[active]);
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + (e.key === "ArrowDown" ? 3 : 1)));
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - (e.key === "ArrowUp" ? 3 : 1)));
    }
  };

  return (
    <div className="absolute bottom-3 left-3 z-10" onPointerDown={(e) => e.stopPropagation()}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            className="glass-strong scroll-thin mb-2 max-h-[60vh] w-[22rem] overflow-y-auto rounded-3xl p-3 pt-0"
          >
            <div className="sticky top-0 z-10 -mx-3 bg-[#14161d]/90 px-3 pt-3 pb-2 backdrop-blur-xl">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/40" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKey}
                  placeholder="Search furniture…  (Enter to add)"
                  className="field !h-9 !rounded-full !pl-8"
                />
              </div>
              <div className="mt-1.5 px-1 text-[11px] text-white/35">Adds at the pinned location (click on the plan to pin)</div>
            </div>
            {!results.length && <div className="px-1 py-6 text-center text-xs text-white/40">No furniture matches “{query}”</div>}
            {GROUPS.map((g) => {
              const items = results.filter((k) => CATALOG[k].category === g);
              if (!items.length) return null;
              return (
                <div key={g} className="mt-2">
                  <div className="mb-1 px-1 text-[10px] tracking-widest text-white/30 uppercase">{g}</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {items.map((k) => {
                      const Icon = ICONS[k] ?? Box;
                      const isActive = results[active] === k;
                      return (
                        <button
                          key={k}
                          onClick={() => add(k)}
                          onMouseEnter={() => setActive(results.indexOf(k))}
                          className={`group flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 text-[11px] transition hover:border-cyan-300/30 hover:bg-white/[0.07] hover:text-white ${
                            isActive ? "border-cyan-300/40 bg-white/[0.08] text-white" : "border-white/5 bg-white/[0.03] text-white/70"
                          }`}
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
      <button onClick={toggle} className="glass flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-sm text-white/80 hover:text-white">
        <span className={`grid h-6 w-6 place-items-center rounded-full bg-cyan-300/90 text-[#07080c] transition ${open ? "rotate-45" : ""}`}>
          <Plus size={15} strokeWidth={2.5} />
        </span>
        Furniture
      </button>
    </div>
  );
}
