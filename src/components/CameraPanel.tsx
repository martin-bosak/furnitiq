"use client";

import { Download, Palette, Plus, Video, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { sceneBounds } from "@/lib/scene/ops";
import { activeCamera, useEditor, type Render } from "@/store/editor";
import { viewportApi } from "./three/api";

const Viewport3D = dynamic(() => import("./three/Viewport3D").then((m) => m.Viewport3D), {
  ssr: false,
  loading: () => <div className="shimmer h-full w-full" />,
});

/** Source captures for renders made this session, for before/after compare. */
const sources = new Map<string, string>();

export function CameraPanel() {
  const scene = useEditor((s) => s.scene);
  const projectId = useEditor((s) => s.projectId);
  const renders = useEditor((s) => s.renders);
  const pin = useEditor((s) => s.pin);
  const { setActiveCamera, applyOps, commit, addRender, select } = useEditor.getState();
  const cam = activeCamera(scene);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Render | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);

  const shoot = async () => {
    const image = viewportApi.capture?.();
    if (!image || !cam) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, image, scene, cameraId: cam.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Render failed");
      sources.set(data.id, image);
      addRender(data);
      setOpen(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addCamera = () => {
    const b = sceneBounds(scene);
    const pos = pin ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
    applyOps([{ op: "set_camera", position: pos, target: [pos[0], pos[1] - 2], activate: true }]);
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[1.6rem]">
      <Viewport3D />

      {/* Camera pills */}
      <div className="absolute top-3 left-3 flex max-w-[70%] flex-wrap items-center gap-1.5">
        {scene.cameras.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setActiveCamera(c.id);
              select({ kind: "camera", id: c.id });
            }}
            className={`glass flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition ${
              c.id === cam?.id ? "!border-cyan-300/40 text-cyan-200" : "text-white/60 hover:text-white"
            }`}
          >
            <Video size={13} /> {c.name}
          </button>
        ))}
        <button onClick={addCamera} className="glass grid h-8 w-8 place-items-center rounded-full text-white/60 hover:text-white" title="Add camera (at pin)">
          <Plus size={14} />
        </button>
      </div>

      {/* FOV */}
      {cam && (
        <div className="glass absolute top-3 right-3 flex h-8 items-center gap-2 rounded-full px-3 text-[11px] text-white/60">
          <span className="font-mono">FOV {Math.round(cam.fov)}°</span>
          <input
            type="range"
            min={30}
            max={100}
            value={cam.fov}
            onPointerDown={() => useEditor.getState().checkpoint()}
            onChange={(e) =>
              useEditor.getState().transient((s) => ({
                ...s,
                cameras: s.cameras.map((c) => (c.id === cam.id ? { ...c, fov: +e.target.value } : c)),
              }))
            }
            className="w-20 accent-cyan-300"
          />
        </div>
      )}

      <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 text-[11px] tracking-wide whitespace-nowrap text-white/35">
        drag to look · scroll to move · WASD walk · Q/E height
      </div>

      {/* Style + shutter */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3">
        <div className="relative">
          <button onClick={() => setStyleOpen((v) => !v)} className="glass grid h-11 w-11 place-items-center rounded-full text-white/70 hover:text-white" title="Render style">
            <Palette size={17} />
          </button>
          <AnimatePresence>
            {styleOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                className="glass-strong absolute bottom-14 left-0 w-80 rounded-3xl p-3"
              >
                <div className="mb-2 text-[11px] tracking-wider text-white/40 uppercase">Render style</div>
                <textarea
                  defaultValue={scene.style.prompt}
                  onBlur={(e) => e.target.value !== scene.style.prompt && commit((s) => ({ ...s, style: { prompt: e.target.value } }))}
                  rows={4}
                  className="field !h-auto resize-none py-2 leading-relaxed"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["Japandi, soft morning light", "Warm mid-century, golden hour", "Minimal concrete loft, overcast", "Cozy Scandinavian evening, lamps on"].map((p) => (
                    <button key={p} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white" onClick={() => commit((s) => ({ ...s, style: { prompt: p } }))}>
                      {p}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button onClick={shoot} disabled={busy || !cam} className="group relative grid h-16 w-16 place-items-center rounded-full disabled:opacity-90" title="Create photorealistic render">
          <span className={`shutter absolute inset-0 rounded-full ${busy ? "shutter-busy" : "transition group-hover:scale-105"}`} />
          <span className="relative grid h-11 w-11 place-items-center rounded-full bg-[#0b0d13]/85 text-[10px] font-semibold tracking-widest text-white">
            {busy ? "…" : "SHOT"}
          </span>
        </button>
        <div className="w-11" />
      </div>

      {/* Busy veil */}
      <AnimatePresence>
        {busy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="shimmer absolute inset-0" />
            <div className="glass rounded-full px-4 py-2 text-xs text-white/80">Developing photoreal render…</div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="glass-strong absolute top-14 left-1/2 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-2 text-xs text-rose-200">
          {error}
          <button onClick={() => setError(null)} className="text-white/50 hover:text-white">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Gallery */}
      {renders.length > 0 && (
        <div className="absolute right-3 bottom-4 flex gap-1.5">
          {renders.slice(0, 4).map((r) => (
            <button key={r.id} onClick={() => setOpen(r)} className="glass h-12 w-16 overflow-hidden rounded-xl p-0.5 transition hover:scale-105">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.url} alt="" className="h-full w-full rounded-[0.6rem] object-cover" />
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>{open && <Lightbox render={open} source={sources.get(open.id)} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  );
}

function Lightbox({ render, source, onClose }: { render: Render; source?: string; onClose: () => void }) {
  const [split, setSplit] = useState(50);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-8 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} className="glass-strong relative max-h-full max-w-6xl overflow-hidden rounded-[2rem] p-2" onClick={(e) => e.stopPropagation()}>
        <div className="relative overflow-hidden rounded-[1.6rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={render.url} alt="Render" className="block max-h-[78vh] w-auto" />
          {source && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source} alt="3D" className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
              <div className="pointer-events-none absolute inset-y-0 w-px bg-white/80 shadow-[0_0_12px_white]" style={{ left: `${split}%` }} />
              <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(+e.target.value)} className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
              <span className="glass absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] tracking-widest text-white/70">3D</span>
              <span className="glass absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] tracking-widest text-white/70">PHOTO</span>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 px-3 pt-2 pb-1">
          <div className="min-w-0 truncate text-xs text-white/50">
            {render.cameraName} · {new Date(render.createdAt).toLocaleString()}
          </div>
          <div className="flex gap-1">
            <a href={render.url} download className="btn">
              <Download size={14} /> Download
            </a>
            <button onClick={onClose} className="icon-btn">
              <X size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
