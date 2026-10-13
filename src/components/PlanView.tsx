"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sceneBounds, wallAngle, wallLength, pointOnWall } from "@/lib/scene/ops";
import type { Camera, Furniture, Scene, Vec2 } from "@/lib/scene/schema";
import { useEditor } from "@/store/editor";

type View = { cx: number; cy: number; scale: number };

type Drag =
  | { mode: "pan"; startClient: Vec2; startView: View; moved: boolean; world: Vec2 }
  | { mode: "furniture"; id: string; start: Vec2; orig: Vec2; moved: boolean; startClient: Vec2 }
  | { mode: "rotate"; id: string; moved: boolean; startClient: Vec2 }
  | { mode: "camera"; id: string; start: Vec2; orig: Vec2; origTarget: Vec2; moved: boolean; startClient: Vec2 }
  | { mode: "target"; id: string; moved: boolean; startClient: Vec2 }
  | { mode: "wall-end"; id: string; end: "a" | "b"; orig: Vec2; moved: boolean; startClient: Vec2 }
  | { mode: "opening"; id: string; moved: boolean; startClient: Vec2 };

const snap = (v: number, step: number) => Math.round(v / step) * step;
const deg = (r: number) => (r * 180) / Math.PI;
const same = (p: Vec2, q: Vec2) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;

export function PlanView() {
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  const pin = useEditor((s) => s.pin);
  const { select, setPin, transient, checkpoint, setActiveCamera } = useEditor.getState();

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ cx: 4, cy: 3, scale: 60 });
  const drag = useRef<Drag | null>(null);
  const fitted = useRef(false);

  const fit = useCallback(() => {
    const b = sceneBounds(useEditor.getState().scene);
    const pad = 1.2;
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxY - b.minY + pad * 2;
    setView({ cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale: Math.min(size.w / w, size.h / h) });
  }, [size]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!fitted.current && size.w > 100) {
      fitted.current = true;
      fit();
    }
  }, [size, fit]);

  // Refit when a different project is loaded.
  const projectId = useEditor((s) => s.projectId);
  useEffect(() => {
    if (size.w > 100) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const vb = { x: view.cx - size.w / view.scale / 2, y: view.cy - size.h / view.scale / 2, w: size.w / view.scale, h: size.h / view.scale };
  const px = (n: number) => n / view.scale;

  const toWorld = useCallback(
    (clientX: number, clientY: number): Vec2 => {
      const r = svgRef.current!.getBoundingClientRect();
      return [vb.x + (clientX - r.left) / view.scale, vb.y + (clientY - r.top) / view.scale];
    },
    [vb.x, vb.y, view.scale],
  );

  // Wheel zoom around cursor (needs a non-passive listener).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const scale = Math.min(400, Math.max(12, v.scale * Math.exp(-e.deltaY * 0.0015)));
        const mx = e.clientX - r.left - size.w / 2;
        const my = e.clientY - r.top - size.h / 2;
        const wx = v.cx + mx / v.scale;
        const wy = v.cy + my / v.scale;
        return { scale, cx: wx - mx / scale, cy: wy - my / scale };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [size]);

  const begin = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    begin(e, { mode: "pan", startClient: [e.clientX, e.clientY], startView: view, moved: false, world: toWorld(e.clientX, e.clientY) });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startClient[0], e.clientY - d.startClient[1]) < 3) return;
      d.moved = true;
      if (d.mode !== "pan") checkpoint();
    }
    const w = toWorld(e.clientX, e.clientY);
    const fine = e.altKey;
    const step = fine ? 0.01 : 0.05;

    switch (d.mode) {
      case "pan":
        setView({
          ...d.startView,
          cx: d.startView.cx - (e.clientX - d.startClient[0]) / d.startView.scale,
          cy: d.startView.cy - (e.clientY - d.startClient[1]) / d.startView.scale,
        });
        break;
      case "furniture": {
        const pos: Vec2 = [snap(d.orig[0] + w[0] - d.start[0], step), snap(d.orig[1] + w[1] - d.start[1], step)];
        transient((s) => ({ ...s, furniture: s.furniture.map((f) => (f.id === d.id ? { ...f, position: pos } : f)) }));
        break;
      }
      case "rotate": {
        transient((s) => ({
          ...s,
          furniture: s.furniture.map((f) => {
            if (f.id !== d.id) return f;
            const a = deg(Math.atan2(-(w[0] - f.position[0]), w[1] - f.position[1]));
            const rot = ((fine ? Math.round(a) : snap(a, 15)) + 360) % 360;
            return { ...f, rotation: rot };
          }),
        }));
        break;
      }
      case "camera": {
        const dx = snap(w[0] - d.start[0], step);
        const dy = snap(w[1] - d.start[1], step);
        transient((s) => ({
          ...s,
          cameras: s.cameras.map((c) =>
            c.id === d.id
              ? { ...c, position: [d.orig[0] + dx, d.orig[1] + dy], target: [d.origTarget[0] + dx, d.origTarget[1] + dy] }
              : c,
          ),
        }));
        break;
      }
      case "target":
        transient((s) => ({ ...s, cameras: s.cameras.map((c) => (c.id === d.id ? { ...c, target: [w[0], w[1]] } : c)) }));
        break;
      case "wall-end": {
        const p: Vec2 = [snap(w[0], step), snap(w[1], step)];
        transient((s) => ({
          ...s,
          walls: s.walls.map((wl) => ({
            ...wl,
            a: same(wl.a, d.orig) || (wl.id === d.id && d.end === "a") ? p : wl.a,
            b: same(wl.b, d.orig) || (wl.id === d.id && d.end === "b") ? p : wl.b,
          })),
        }));
        // Connected endpoints now sit at p; follow them for the rest of the drag.
        d.orig = p;
        break;
      }
      case "opening": {
        transient((s) => {
          const o = s.openings.find((x) => x.id === d.id);
          const wl = o && s.walls.find((x) => x.id === o.wallId);
          if (!o || !wl) return s;
          const len = wallLength(wl);
          const ang = wallAngle(wl);
          const t = (w[0] - wl.a[0]) * Math.cos(ang) + (w[1] - wl.a[1]) * Math.sin(ang);
          const offset = Math.min(len - o.width / 2, Math.max(o.width / 2, snap(t, step)));
          return { ...s, openings: s.openings.map((x) => (x.id === d.id ? { ...x, offset } : x)) };
        });
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (d?.mode === "pan" && !d.moved) {
      select(null);
      setPin([Math.round(d.world[0] * 100) / 100, Math.round(d.world[1] * 100) / 100]);
    }
  };

  const zoom = (f: number) => setView((v) => ({ ...v, scale: Math.min(400, Math.max(12, v.scale * f)) }));

  const sorted = useMemo(
    () => [...scene.furniture].sort((a, b) => (a.type === "rug" ? -1 : 0) - (b.type === "rug" ? -1 : 0) || a.elevation - b.elevation),
    [scene.furniture],
  );

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden rounded-[1.6rem] bg-[#0b0d13]">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="block touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: drag.current?.mode === "pan" && drag.current.moved ? "grabbing" : "crosshair" }}
      >
        <defs>
          <pattern id="grid-minor" width={0.5} height={0.5} patternUnits="userSpaceOnUse">
            <path d="M 0.5 0 L 0 0 0 0.5" fill="none" stroke="rgb(255 255 255 / 0.035)" strokeWidth={px(1)} />
          </pattern>
          <pattern id="grid" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="url(#grid-minor)" />
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={px(1)} />
          </pattern>
          <radialGradient id="cam-fov">
            <stop offset="0%" stopColor="#7cf0ff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#7cf0ff" stopOpacity={0} />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={px(4)} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#grid)" />

        {/* Rooms */}
        {scene.rooms.map((r) => {
          const c = centroid(r.polygon);
          return (
            <g key={r.id}>
              <polygon
                points={r.polygon.map((p) => p.join(",")).join(" ")}
                fill={r.floor === "tile" ? "rgb(140 170 200 / 0.07)" : "rgb(255 200 140 / 0.05)"}
              />
              <text x={c[0]} y={c[1]} textAnchor="middle" fontSize={px(11)} fill="rgb(255 255 255 / 0.28)" style={{ letterSpacing: px(1.5) }}>
                {r.name.toUpperCase()}
              </text>
              <text x={c[0]} y={c[1] + px(15)} textAnchor="middle" fontSize={px(10)} fill="rgb(255 255 255 / 0.18)" fontFamily="var(--font-mono)">
                {area(r.polygon).toFixed(1)} m²
              </text>
            </g>
          );
        })}

        {/* Furniture */}
        {sorted.map((f) => (
          <FurniturePlan
            key={f.id}
            f={f}
            px={px}
            selected={selection?.id === f.id}
            onDown={(e) => {
              select({ kind: "furniture", id: f.id });
              begin(e, { mode: "furniture", id: f.id, start: toWorld(e.clientX, e.clientY), orig: f.position, moved: false, startClient: [e.clientX, e.clientY] });
            }}
            onRotate={(e) => begin(e, { mode: "rotate", id: f.id, moved: false, startClient: [e.clientX, e.clientY] })}
          />
        ))}

        {/* Walls */}
        {scene.walls.map((w) => {
          const sel = selection?.id === w.id;
          return (
            <line
              key={w.id}
              x1={w.a[0]}
              y1={w.a[1]}
              x2={w.b[0]}
              y2={w.b[1]}
              stroke={sel ? "#7cf0ff" : "#d9dce6"}
              strokeWidth={w.thickness}
              strokeLinecap="square"
              className="cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation();
                select({ kind: "wall", id: w.id });
              }}
            />
          );
        })}

        {/* Openings */}
        {scene.openings.map((o) => {
          const w = scene.walls.find((x) => x.id === o.wallId);
          if (!w) return null;
          const [x, y] = pointOnWall(w, o.offset);
          const t = w.thickness;
          const hw = o.width / 2;
          const sel = selection?.id === o.id;
          const accent = sel ? "#7cf0ff" : o.kind === "window" ? "#9fd8ff" : "#ffb86b";
          return (
            <g
              key={o.id}
              transform={`translate(${x} ${y}) rotate(${deg(wallAngle(w))})`}
              className="cursor-ew-resize"
              onPointerDown={(e) => {
                select({ kind: "opening", id: o.id });
                begin(e, { mode: "opening", id: o.id, moved: false, startClient: [e.clientX, e.clientY] });
              }}
            >
              <rect x={-hw} y={-t / 2 - px(1)} width={o.width} height={t + px(2)} fill="#0b0d13" />
              {o.kind === "window" ? (
                <>
                  <rect x={-hw} y={-t / 2} width={o.width} height={t} fill="rgb(159 216 255 / 0.12)" stroke={accent} strokeWidth={px(1)} />
                  <line x1={-hw} x2={hw} y1={0} y2={0} stroke={accent} strokeWidth={px(1.2)} />
                </>
              ) : (
                <>
                  <line x1={-hw} y1={t / 2} x2={-hw} y2={t / 2 + o.width} stroke={accent} strokeWidth={px(1.6)} />
                  <path d={`M ${hw} ${t / 2} A ${o.width} ${o.width} 0 0 1 ${-hw} ${t / 2 + o.width}`} fill="none" stroke={accent} strokeOpacity={0.5} strokeWidth={px(1)} strokeDasharray={`${px(3)} ${px(3)}`} />
                </>
              )}
            </g>
          );
        })}

        {/* Wall endpoint handles for the selected wall */}
        {selection?.kind === "wall" &&
          scene.walls
            .filter((w) => w.id === selection.id)
            .flatMap((w) =>
              (["a", "b"] as const).map((end) => (
                <circle
                  key={end}
                  cx={w[end][0]}
                  cy={w[end][1]}
                  r={px(7)}
                  fill="#0b0d13"
                  stroke="#7cf0ff"
                  strokeWidth={px(2)}
                  className="cursor-move"
                  onPointerDown={(e) => begin(e, { mode: "wall-end", id: w.id, end, orig: w[end], moved: false, startClient: [e.clientX, e.clientY] })}
                />
              )),
            )}

        {/* Wall length label */}
        {selection?.kind === "wall" &&
          scene.walls
            .filter((w) => w.id === selection.id)
            .map((w) => {
              const m = pointOnWall(w, wallLength(w) / 2);
              return (
                <g key="len" transform={`translate(${m[0]} ${m[1]})`}>
                  <rect x={px(-26)} y={px(-22)} width={px(52)} height={px(16)} rx={px(8)} fill="#7cf0ff" />
                  <text y={px(-11)} textAnchor="middle" fontSize={px(10)} fill="#07080c" fontFamily="var(--font-mono)">
                    {wallLength(w).toFixed(2)} m
                  </text>
                </g>
              );
            })}

        {/* Cameras */}
        {scene.cameras.map((c) => (
          <CameraPlan
            key={c.id}
            c={c}
            px={px}
            active={c.id === scene.activeCameraId}
            selected={selection?.id === c.id}
            onDown={(e) => {
              select({ kind: "camera", id: c.id });
              setActiveCamera(c.id);
              begin(e, { mode: "camera", id: c.id, start: toWorld(e.clientX, e.clientY), orig: c.position, origTarget: c.target, moved: false, startClient: [e.clientX, e.clientY] });
            }}
            onTarget={(e) => {
              setActiveCamera(c.id);
              begin(e, { mode: "target", id: c.id, moved: false, startClient: [e.clientX, e.clientY] });
            }}
          />
        ))}

        {/* Pin */}
        {pin && (
          <g transform={`translate(${pin[0]} ${pin[1]})`} filter="url(#glow)" pointerEvents="none">
            <circle r={px(14)} fill="none" stroke="#a78bfa" strokeOpacity={0.4} strokeWidth={px(1)}>
              <animate attributeName="r" values={`${px(6)};${px(18)}`} dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.6;0" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <circle r={px(4.5)} fill="#a78bfa" />
          </g>
        )}
      </svg>

      <div className="glass absolute right-3 bottom-3 flex items-center gap-0.5 rounded-full p-1">
        <button className="icon-btn !h-8 !w-8" onClick={() => zoom(1 / 1.25)} title="Zoom out">
          <Minus size={15} />
        </button>
        <span className="w-12 text-center font-mono text-[11px] text-white/50">{Math.round((view.scale / 60) * 100)}%</span>
        <button className="icon-btn !h-8 !w-8" onClick={() => zoom(1.25)} title="Zoom in">
          <Plus size={15} />
        </button>
        <button className="icon-btn !h-8 !w-8" onClick={fit} title="Fit">
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}

function FurniturePlan({
  f,
  px,
  selected,
  onDown,
  onRotate,
}: {
  f: Furniture;
  px: (n: number) => number;
  selected: boolean;
  onDown: (e: React.PointerEvent) => void;
  onRotate: (e: React.PointerEvent) => void;
}) {
  const [w, d] = f.size;
  const rug = f.type === "rug";
  const color = f.color ?? "#bbb";
  return (
    <g transform={`translate(${f.position[0]} ${f.position[1]}) rotate(${f.rotation})`}>
      <rect
        x={-w / 2}
        y={-d / 2}
        width={w}
        height={d}
        rx={Math.min(0.08, w / 6, d / 6)}
        fill={color}
        fillOpacity={rug ? 0.12 : 0.28}
        stroke={selected ? "#7cf0ff" : color}
        strokeOpacity={selected ? 1 : 0.85}
        strokeWidth={px(selected ? 2 : 1.2)}
        strokeDasharray={rug ? `${px(4)} ${px(3)}` : undefined}
        className="cursor-grab"
        onPointerDown={onDown}
      />
      <PlanDetail f={f} px={px} />
      {!rug && <line x1={-w / 2 + 0.06} x2={w / 2 - 0.06} y1={d / 2 - px(3)} y2={d / 2 - px(3)} stroke="white" strokeOpacity={0.35} strokeWidth={px(1.5)} strokeLinecap="round" pointerEvents="none" />}
      {selected && (
        <>
          <rect x={-w / 2 - px(5)} y={-d / 2 - px(5)} width={w + px(10)} height={d + px(10)} rx={px(8)} fill="none" stroke="#7cf0ff" strokeOpacity={0.35} strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(4)}`} pointerEvents="none" />
          <line x1={0} y1={d / 2} x2={0} y2={d / 2 + px(22)} stroke="#7cf0ff" strokeWidth={px(1.2)} pointerEvents="none" />
          <circle cy={d / 2 + px(26)} r={px(6)} fill="#7cf0ff" className="cursor-alias" onPointerDown={onRotate} />
          <text y={-d / 2 - px(10)} textAnchor="middle" fontSize={px(10)} fill="#7cf0ff" fontFamily="var(--font-mono)" pointerEvents="none" transform={`rotate(${-f.rotation} 0 ${-d / 2 - px(10)})`}>
            {w.toFixed(2)} × {d.toFixed(2)}
          </text>
        </>
      )}
    </g>
  );
}

/** Small top-down hints so items read at a glance. */
function PlanDetail({ f, px }: { f: Furniture; px: (n: number) => number }) {
  const [w, d] = f.size;
  const s = { fill: "white", fillOpacity: 0.1, stroke: "white", strokeOpacity: 0.25, strokeWidth: px(1), pointerEvents: "none" as const };
  switch (f.type) {
    case "bed":
      return (
        <>
          <rect x={-w / 2 + 0.08} y={-d / 2 + 0.08} width={w / 2 - 0.12} height={0.28} rx={0.06} {...s} />
          <rect x={0.04} y={-d / 2 + 0.08} width={w / 2 - 0.12} height={0.28} rx={0.06} {...s} />
          <line x1={-w / 2} x2={w / 2} y1={-d / 2 + 0.5} y2={-d / 2 + 0.5} {...s} />
        </>
      );
    case "sofa":
    case "armchair":
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={0.2} rx={0.05} {...s} />
          <rect x={-w / 2} y={-d / 2} width={0.16} height={d} rx={0.05} {...s} />
          <rect x={w / 2 - 0.16} y={-d / 2} width={0.16} height={d} rx={0.05} {...s} />
        </>
      );
    case "dining_table":
    case "coffee_table":
    case "desk":
      return <rect x={-w / 2 + 0.05} y={-d / 2 + 0.05} width={w - 0.1} height={d - 0.1} rx={0.04} {...s} fillOpacity={0} />;
    case "plant":
      return <circle r={Math.min(w, d) / 2.4} {...s} fill="#6fbf73" fillOpacity={0.25} />;
    case "bathtub":
    case "sink":
      return <rect x={-w / 2 + 0.07} y={-d / 2 + 0.07} width={w - 0.14} height={d - 0.14} rx={Math.min(w, d) / 3} {...s} />;
    case "toilet":
      return <ellipse cy={0.08} rx={w / 2.6} ry={d / 3.4} {...s} />;
    default:
      return null;
  }
}

function CameraPlan({
  c,
  px,
  active,
  selected,
  onDown,
  onTarget,
}: {
  c: Camera;
  px: (n: number) => number;
  active: boolean;
  selected: boolean;
  onDown: (e: React.PointerEvent) => void;
  onTarget: (e: React.PointerEvent) => void;
}) {
  const ang = Math.atan2(c.target[1] - c.position[1], c.target[0] - c.position[0]);
  const hfov = 2 * Math.atan(Math.tan(((c.fov * Math.PI) / 180) / 2) * 1.5);
  const L = Math.max(1.2, Math.min(4, Math.hypot(c.target[0] - c.position[0], c.target[1] - c.position[1]) * 1.3));
  const p1: Vec2 = [c.position[0] + Math.cos(ang - hfov / 2) * L, c.position[1] + Math.sin(ang - hfov / 2) * L];
  const p2: Vec2 = [c.position[0] + Math.cos(ang + hfov / 2) * L, c.position[1] + Math.sin(ang + hfov / 2) * L];
  const color = active ? "#7cf0ff" : "rgb(255 255 255 / 0.5)";
  return (
    <g>
      <path
        d={`M ${c.position[0]} ${c.position[1]} L ${p1[0]} ${p1[1]} A ${L} ${L} 0 0 1 ${p2[0]} ${p2[1]} Z`}
        fill={active ? "url(#cam-fov)" : "rgb(255 255 255 / 0.03)"}
        stroke={color}
        strokeOpacity={0.35}
        strokeWidth={px(1)}
        pointerEvents="none"
      />
      <line x1={c.position[0]} y1={c.position[1]} x2={c.target[0]} y2={c.target[1]} stroke={color} strokeOpacity={0.5} strokeWidth={px(1)} strokeDasharray={`${px(2)} ${px(4)}`} pointerEvents="none" />
      <g transform={`translate(${c.position[0]} ${c.position[1]}) rotate(${deg(ang)})`} className="cursor-move" onPointerDown={onDown} filter={active ? "url(#glow)" : undefined}>
        <circle r={px(13)} fill="transparent" />
        <rect x={px(-9)} y={px(-6.5)} width={px(14)} height={px(13)} rx={px(3)} fill={active ? "#7cf0ff" : "#2a2d38"} stroke={selected ? "white" : color} strokeWidth={px(1.2)} />
        <path d={`M ${px(5)} ${px(-3.5)} L ${px(11)} ${px(-6.5)} L ${px(11)} ${px(6.5)} L ${px(5)} ${px(3.5)} Z`} fill={active ? "#7cf0ff" : "#2a2d38"} stroke={color} strokeWidth={px(1)} />
      </g>
      <circle cx={c.target[0]} cy={c.target[1]} r={px(5)} fill="#0b0d13" stroke={color} strokeWidth={px(1.6)} className="cursor-crosshair" onPointerDown={onTarget} />
      <text x={c.position[0]} y={c.position[1] + px(24)} textAnchor="middle" fontSize={px(10)} fill={color} pointerEvents="none">
        {c.name}
      </text>
    </g>
  );
}

function area(poly: Vec2[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

function centroid(poly: Vec2[]): Vec2 {
  const n = poly.length;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}
