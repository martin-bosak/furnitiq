"use client";

import { Copy, RotateCw, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { CATALOG, CATALOG_KEYS, catalogItem } from "@/lib/scene/catalog";
import { wallLength } from "@/lib/scene/ops";
import { resolveRooms, roomSelectionId } from "@/lib/scene/rooms";
import type { Furniture, Room } from "@/lib/scene/schema";
import { useEditor } from "@/store/editor";

export function Inspector() {
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  const { applyOps, select } = useEditor.getState();
  if (!selection) return null;

  const close = () => select(null);
  const remove = () => {
    // Unnamed rooms have no record to delete (their shape comes from the walls).
    if (!selection.id.startsWith("face@")) applyOps([{ op: "remove", id: selection.id }]);
    select(null);
  };

  let title = "";
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (selection.kind === "furniture") {
    const f = scene.furniture.find((x) => x.id === selection.id);
    if (!f) return null;
    const up = (patch: Partial<Omit<Furniture, "id">>) => applyOps([{ op: "update_furniture", id: f.id, patch }]);
    title = f.name ?? catalogItem(f.type).label;
    body = (
      <>
        <Row label="Name">
          <TextField value={f.name ?? ""} onCommit={(name) => up({ name })} />
        </Row>
        <Row label="Type">
          <select className="field" value={f.type} onChange={(e) => up({ type: e.target.value })}>
            {CATALOG_KEYS.map((k) => (
              <option key={k} value={k} className="bg-[#14161d]">
                {CATALOG[k].label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Position">
          <Num value={f.position[0]} suffix="x" onCommit={(v) => up({ position: [v, f.position[1]] })} />
          <Num value={f.position[1]} suffix="y" onCommit={(v) => up({ position: [f.position[0], v] })} />
        </Row>
        <Row label="Size">
          <Num value={f.size[0]} suffix="w" onCommit={(v) => up({ size: [Math.max(0.02, v), f.size[1], f.size[2]] })} />
          <Num value={f.size[1]} suffix="d" onCommit={(v) => up({ size: [f.size[0], Math.max(0.02, v), f.size[2]] })} />
          <Num value={f.size[2]} suffix="h" onCommit={(v) => up({ size: [f.size[0], f.size[1], Math.max(0.01, v)] })} />
        </Row>
        <Row label="Rotation">
          <Num value={f.rotation} suffix="°" step={15} onCommit={(v) => up({ rotation: ((v % 360) + 360) % 360 })} />
          <Num value={f.elevation} suffix="elev" onCommit={(v) => up({ elevation: Math.max(0, v) })} />
        </Row>
        <Row label="Color">
          <input type="color" value={f.color ?? "#bbbbbb"} onChange={(e) => up({ color: e.target.value })} className="h-7 w-7 cursor-pointer" />
          <span className="font-mono text-[11px] text-white/40">{f.color}</span>
        </Row>
      </>
    );
    actions = (
      <>
        <button className="icon-btn" title="Rotate 90° (R)" onClick={() => up({ rotation: (f.rotation + 90) % 360 })}>
          <RotateCw size={15} />
        </button>
        <button
          className="icon-btn"
          title="Duplicate (Ctrl+D)"
          onClick={() => applyOps([{ op: "add_furniture", type: f.type, name: f.name, position: [f.position[0] + 0.3, f.position[1] + 0.3], rotation: f.rotation, size: f.size, color: f.color, elevation: f.elevation }])}
        >
          <Copy size={15} />
        </button>
      </>
    );
  } else if (selection.kind === "wall") {
    const w = scene.walls.find((x) => x.id === selection.id);
    if (!w) return null;
    const up = (patch: object) => applyOps([{ op: "update_wall", id: w.id, patch }]);
    title = "Wall";
    body = (
      <>
        <Row label="Length">
          <span className="font-mono text-xs text-white/70">{wallLength(w).toFixed(2)} m</span>
        </Row>
        <Row label="Thickness">
          <Num value={w.thickness} onCommit={(v) => up({ thickness: Math.max(0.03, v) })} />
          <Num value={w.height} suffix="h" onCommit={(v) => up({ height: Math.max(0.5, v) })} />
        </Row>
        <Row label="Color">
          <input type="color" value={w.color} onChange={(e) => up({ color: e.target.value })} className="h-7 w-7 cursor-pointer" />
        </Row>
        <Row label="Add">
          <button className="btn !h-7 !px-2.5 !text-xs" onClick={() => applyOps([{ op: "add_opening", wallId: w.id, kind: "window", offset: wallLength(w) / 2 }])}>
            Window
          </button>
          <button className="btn !h-7 !px-2.5 !text-xs" onClick={() => applyOps([{ op: "add_opening", wallId: w.id, kind: "door", offset: wallLength(w) / 2 }])}>
            Door
          </button>
        </Row>
        <p className="pt-1 text-[11px] text-white/35">Drag the endpoints on the plan to reshape.</p>
      </>
    );
  } else if (selection.kind === "opening") {
    const o = scene.openings.find((x) => x.id === selection.id);
    if (!o) return null;
    const up = (patch: object) => applyOps([{ op: "update_opening", id: o.id, patch }]);
    title = o.kind === "door" ? "Door" : "Window";
    body = (
      <>
        <Row label="Kind">
          <select className="field" value={o.kind} onChange={(e) => up({ kind: e.target.value })}>
            <option value="window" className="bg-[#14161d]">Window</option>
            <option value="door" className="bg-[#14161d]">Door</option>
          </select>
        </Row>
        <Row label="Size">
          <Num value={o.width} suffix="w" onCommit={(v) => up({ width: Math.max(0.2, v) })} />
          <Num value={o.height} suffix="h" onCommit={(v) => up({ height: Math.max(0.2, v) })} />
        </Row>
        <Row label="Sill">
          <Num value={o.sill} onCommit={(v) => up({ sill: Math.max(0, v) })} />
          <Num value={o.offset} suffix="off" onCommit={(v) => up({ offset: v })} />
        </Row>
      </>
    );
  } else if (selection.kind === "room") {
    const r = resolveRooms(scene).rooms.find((x) => roomSelectionId(x) === selection.id);
    if (!r) return null;
    // Unnamed rooms get a label the first time they're edited.
    const up = (patch: { name?: string; floor?: Room["floor"]; ceiling?: boolean }) => {
      const before = new Set(scene.rooms.map((x) => x.id));
      applyOps([{ op: "set_room", ...(r.labelId ? { id: r.labelId } : { at: r.labelAt }), ...patch }]);
      if (!r.labelId) {
        const added = useEditor.getState().scene.rooms.find((x) => !before.has(x.id));
        if (added) select({ kind: "room", id: added.id });
      }
    };
    title = r.name;
    body = (
      <>
        <Row label="Name">
          <TextField value={r.name} onCommit={(name) => up({ name })} />
        </Row>
        <Row label="Floor">
          <FloorSelect value={r.floor} onChange={(floor) => up({ floor })} />
        </Row>
        <Row label="Ceiling">
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={r.ceiling} onChange={(e) => up({ ceiling: e.target.checked })} className="accent-cyan-300" /> show in 3D
          </label>
        </Row>
        <Row label="Area">
          <span className="font-mono text-xs text-white/70">{r.area.toFixed(1)} m²</span>
        </Row>
        <p className="pt-1 text-[11px] leading-relaxed text-white/35">
          The floor and ceiling follow the walls: move a wall and the room updates. Use the Floor zone tool for a different floor in part of the room.
        </p>
      </>
    );
  } else if (selection.kind === "zone") {
    const z = scene.rooms.find((x) => x.id === selection.id && x.zone);
    if (!z) return null;
    const up = (patch: { name?: string; floor?: Room["floor"] }) => applyOps([{ op: "update_zone", id: z.id, patch }]);
    title = z.name;
    body = (
      <>
        <Row label="Name">
          <TextField value={z.name} onCommit={(name) => up({ name })} />
        </Row>
        <Row label="Floor">
          <FloorSelect value={z.floor} onChange={(floor) => up({ floor })} />
        </Row>
        <p className="pt-1 text-[11px] text-white/35">Drag the corner handles on the plan to reshape.</p>
      </>
    );
  } else if (selection.kind === "camera") {
    const c = scene.cameras.find((x) => x.id === selection.id);
    if (!c) return null;
    const up = (patch: object) => applyOps([{ op: "set_camera", id: c.id, ...patch }]);
    title = "Camera";
    body = (
      <>
        <Row label="Name">
          <TextField value={c.name} onCommit={(name) => up({ name })} />
        </Row>
        <Row label="Eye height">
          <Num value={c.height} onCommit={(v) => up({ height: Math.max(0.2, v) })} />
          <Num value={c.fov} suffix="fov" step={5} onCommit={(v) => up({ fov: Math.min(120, Math.max(15, v)) })} />
        </Row>
        <p className="pt-1 text-[11px] text-white/35">Drag the camera or its target ring on the plan.</p>
      </>
    );
  }

  return (
    <motion.div
      key={selection.id}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-strong absolute top-3 left-3 z-10 w-[19rem] rounded-3xl p-3"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-1">
        <div className="min-w-0 flex-1 truncate pl-1 text-sm font-medium">{title}</div>
        {actions}
        <button className="icon-btn hover:!text-rose-300" title="Delete (Del)" onClick={remove}>
          <Trash2 size={15} />
        </button>
        <button className="icon-btn" onClick={close}>
          <X size={15} />
        </button>
      </div>
      <div className="space-y-1.5">{body}</div>
    </motion.div>
  );
}

const FLOORS: { id: Room["floor"]; label: string }[] = [
  { id: "oak", label: "Wood (beech/oak)" },
  { id: "walnut", label: "Wood (walnut)" },
  { id: "tile", label: "Tiles" },
  { id: "concrete", label: "Concrete" },
  { id: "carpet", label: "Carpet" },
];

function FloorSelect({ value, onChange }: { value: Room["floor"]; onChange: (v: Room["floor"]) => void }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value as Room["floor"])}>
      {FLOORS.map((f) => (
        <option key={f.id} value={f.id} className="bg-[#14161d]">
          {f.label}
        </option>
      ))}
    </select>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 shrink-0 text-[11px] text-white/40">{label}</div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}

function Num({ value, onCommit, suffix, step = 0.05 }: { value: number; onCommit: (v: number) => void; suffix?: string; step?: number }) {
  const [v, setV] = useState(fmt(value));
  useEffect(() => setV(fmt(value)), [value]);
  const commit = () => {
    const n = parseFloat(v);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setV(fmt(value));
  };
  return (
    <label className="relative min-w-0 flex-1">
      <input
        type="number"
        step={step}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="field !pr-5 !pl-2 font-mono !text-xs"
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[9px] text-white/30">{suffix}</span>}
    </label>
  );
}

function TextField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="field"
    />
  );
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
