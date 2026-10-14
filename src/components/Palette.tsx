"use client";

import { AlertTriangle, Armchair, Bath, Bed, BookOpen, Box, ChefHat, Flower2, Lamp, Loader2, Plus, Refrigerator, RotateCw, Search, Sofa, Sparkles, Square, Table, Trash2, Tv } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { LibraryAsset } from "@/lib/library/types";
import { CATALOG, type CatalogKey } from "@/lib/scene/catalog";
import { sceneBounds } from "@/lib/scene/ops";
import { useEditor } from "@/store/editor";
import { useLibrary } from "@/store/library";
import { LibraryDialog } from "./LibraryDialog";

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
  const [tab, setTab] = useState<"catalog" | "library">("catalog");
  const [creating, setCreating] = useState(false);
  const { applyOps, select } = useEditor.getState();
  const assets = useLibrary((s) => s.assets);

  const results = useMemo(() => (Object.keys(CATALOG) as CatalogKey[]).filter((k) => matches(k, query)), [query]);
  const libResults = useMemo(() => {
    const q = query.toLowerCase().split(/\s+/).filter(Boolean);
    return assets.filter((a) => q.every((w) => `${a.name} ${CATALOG[a.category as CatalogKey]?.label ?? a.category}`.toLowerCase().includes(w)));
  }, [assets, query]);

  const toggle = () => {
    setQuery("");
    setActive(0);
    setOpen((v) => !v);
  };

  const add = (type: CatalogKey, asset?: LibraryAsset) => {
    const st = useEditor.getState();
    const b = sceneBounds(st.scene);
    const pos = st.pin ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
    const before = new Set(st.scene.furniture.map((f) => f.id));
    applyOps([
      asset
        ? { op: "add_furniture", type, position: pos, name: asset.name, size: asset.size, assetId: asset.id, ...(asset.color && { color: asset.color }) }
        : { op: "add_furniture", type, position: pos },
    ]);
    const added = useEditor.getState().scene.furniture.find((f) => !before.has(f.id));
    if (added) select({ kind: "furniture", id: added.id });
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Enter" && tab === "library") {
      e.preventDefault();
      const a = libResults.find((x) => x.status === "ready");
      if (a) add(a.category as CatalogKey, a);
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
              <div className="mt-2 flex items-center gap-1">
                <div className="flex flex-1 rounded-full bg-white/5 p-0.5 text-[11px]">
                  {(["catalog", "library"] as const).map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-1 transition ${tab === t ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`}>
                      {t === "catalog" ? "Catalog" : `My library${assets.length ? ` · ${assets.length}` : ""}`}
                    </button>
                  ))}
                </div>
                <button onClick={() => setCreating(true)} className="flex h-7 items-center gap-1 rounded-full bg-gradient-to-br from-cyan-300/90 to-violet-400/90 px-2.5 text-[11px] font-medium text-[#07080c]" title="Generate from a photo or product link">
                  <Sparkles size={12} /> New
                </button>
              </div>
              <div className="mt-1.5 px-1 text-[11px] text-white/35">Adds at the pinned location (click on the plan to pin)</div>
            </div>
            {tab === "library" ? (
              <LibraryGrid assets={libResults} empty={!assets.length} onAdd={(a) => add(a.category as CatalogKey, a)} onNew={() => setCreating(true)} />
            ) : (
              <>
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
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {creating && (
          <LibraryDialog
            onClose={() => setCreating(false)}
            onCreated={(a) => {
              useLibrary.getState().upsert(a);
              setCreating(false);
              setTab("library");
              setOpen(true);
            }}
          />
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

function LibraryGrid({ assets, empty, onAdd, onNew }: { assets: LibraryAsset[]; empty: boolean; onAdd: (a: LibraryAsset) => void; onNew: () => void }) {
  if (empty)
    return (
      <div className="px-2 py-6 text-center text-xs leading-relaxed text-white/45">
        Your own furniture, generated as detailed 3D models from photos or product links.
        <button onClick={onNew} className="btn mx-auto mt-3 !text-xs">
          <Sparkles size={13} /> Create the first one
        </button>
      </div>
    );
  if (!assets.length) return <div className="px-1 py-6 text-center text-xs text-white/40">Nothing in My library matches</div>;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {assets.map((a) => {
        const ready = a.status === "ready";
        return (
          <div key={a.id} className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03]">
            <button disabled={!ready} onClick={() => onAdd(a)} className="block w-full text-left disabled:cursor-default" title={ready ? "Add to the plan" : a.stage}>
              <div className="relative aspect-[4/3] bg-white/[0.04]">
                {a.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnail} alt="" className={`h-full w-full object-contain p-1 ${ready ? "" : "opacity-40"}`} />
                )}
                {!ready && (
                  <div className="absolute inset-0 grid place-items-center p-2 text-center">
                    {a.status === "failed" ? (
                      <span className="flex flex-col items-center gap-1 text-[10px] text-rose-200">
                        <AlertTriangle size={16} /> {a.error?.slice(0, 80) ?? "Failed"}
                      </span>
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-[10px] text-white/75">
                        <Loader2 size={16} className="animate-spin" /> {a.stage ?? "Queued"}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="px-2 py-1.5">
                <div className="truncate text-[11px] text-white/85">{a.name}</div>
                <div className="font-mono text-[10px] text-white/35">{a.size.map((v) => Math.round(v * 100)).join("×")} cm</div>
              </div>
            </button>
            {ready && a.warning && <RetakeNote asset={a} />}
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
              {a.status === "failed" && (
                <button
                  onClick={async () => {
                    const res = await fetch(`/api/library/${a.id}/retry`, { method: "POST" });
                    if (res.ok) useLibrary.getState().upsert(await res.json());
                  }}
                  className="grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white/80 hover:text-white"
                  title="Try again"
                >
                  <RotateCw size={11} />
                </button>
              )}
              <button onClick={() => useLibrary.getState().remove(a.id)} className="grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white/80 hover:text-rose-300" title="Delete from My library">
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Doubtful model: explain and let the user replace the photo (regenerates in place, plan links stay). */
function RetakeNote({ asset }: { asset: LibraryAsset }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-t border-amber-300/15 bg-amber-300/[0.07] px-2 py-1.5">
      <div className="flex items-start gap-1 text-[10px] leading-snug text-amber-100/85" title={asset.warning}>
        <AlertTriangle size={11} className="mt-px shrink-0" />
        <span className="line-clamp-2">{asset.warning}</span>
      </div>
      <label className="mt-1 flex cursor-pointer items-center justify-center gap-1 rounded-full bg-amber-200/90 py-0.5 text-[10px] font-medium text-[#07080c]">
        {busy ? <Loader2 size={10} className="animate-spin" /> : <RotateCw size={10} />} Retake photo
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            const form = new FormData();
            form.append("photos", f);
            const res = await fetch(`/api/library/${asset.id}/retake`, { method: "POST", body: form });
            if (res.ok) useLibrary.getState().upsert(await res.json());
            setBusy(false);
          }}
        />
      </label>
    </div>
  );
}
