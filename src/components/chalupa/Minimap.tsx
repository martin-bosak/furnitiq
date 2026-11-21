"use client";

import { useEffect, useRef } from "react";
import { ROOMS, floorById } from "./data";
import { useChalupa } from "./store";
import { MAP_BOUNDS, W, walkToPoint } from "./walkPhysics";

const WIDTH = 190;
const PAD = 6;
const { x0, x1, y0, y1 } = MAP_BOUNDS;
const scale = (WIDTH - 2 * PAD) / (x1 - x0);
const height = Math.round((y1 - y0) * scale + 2 * PAD);
// Blender plan: north (−y) up, east (−x) right.
const sx = (bx: number) => PAD + (x1 - bx) * scale;
const sy = (by: number) => PAD + (by - y0) * scale;

/** Plan of the walker's floor with their position and heading; click to jump there. */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const walkRoom = useChalupa((s) => s.walkRoom);
  const room = walkRoom ? ROOMS.find((r) => r.id === walkRoom) : undefined;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = WIDTH * dpr;
    cv.height = height * dpr;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let last = "";
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const key = `${W.pos.x.toFixed(2)},${W.pos.z.toFixed(2)},${W.yaw.toFixed(2)},${W.floor},${useChalupa.getState().walkRoom}`;
      if (key === last) return;
      last = key;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, WIDTH, height);
      const here = useChalupa.getState().walkRoom;
      for (const r of ROOMS) {
        if (r.floor !== W.floor) continue;
        const [bx0, by0, bx1, by1] = r.box;
        const x = sx(bx1);
        const y = sy(by0);
        const w = sx(bx0) - x;
        const h = sy(by1) - y;
        ctx.fillStyle = r.id === here ? "rgba(124,240,255,0.28)" : "rgba(255,255,255,0.07)";
        ctx.strokeStyle = r.id === here ? "rgba(124,240,255,0.9)" : "rgba(255,255,255,0.28)";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        if (w > 22 && h > 12) {
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.font = "9px ui-monospace, monospace";
          ctx.fillText(r.id, x + 3, y + 10);
        }
      }
      // Walker: three.js (x, z) is Blender (x, −y); heading −z at yaw 0 is Blender +y (down on the map).
      const px = sx(W.pos.x);
      const py = sy(-W.pos.z);
      const hx = Math.sin(W.yaw);
      const hy = Math.cos(W.yaw);
      ctx.fillStyle = "rgba(255,184,107,0.25)";
      ctx.beginPath();
      ctx.moveTo(px, py);
      const a = Math.atan2(hy, hx);
      ctx.arc(px, py, 22, a - 0.55, a + 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffb86b";
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0b0d12";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const bx = x1 - (e.clientX - r.left - PAD) / scale;
    const by = y0 + (e.clientY - r.top - PAD) / scale;
    walkToPoint(bx, -by);
  };

  return (
    <div className="glass-strong pointer-events-auto flex flex-col items-center gap-1.5 rounded-2xl p-2">
      <canvas ref={ref} onClick={onClick} style={{ width: WIDTH, height }} className="cursor-pointer rounded-lg" title="Klikněte do plánku: přenese vás tam" />
      <div className="flex w-full items-baseline justify-between gap-2 px-1 leading-tight">
        <span className="truncate text-[13px] font-semibold">{room ? room.name : "Venku"}</span>
        <span className="shrink-0 font-mono text-[10px] text-white/45">{room ? room.id : floorById(W.floor).name}</span>
      </div>
    </div>
  );
}
