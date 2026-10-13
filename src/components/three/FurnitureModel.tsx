"use client";

import { RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { Furniture } from "@/lib/scene/schema";

type V3 = [number, number, number];

/** Box centered at p with size s. */
function B({ p, s, c, r = 0.7, m = 0 }: { p: V3; s: V3; c: string; r?: number; m?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={r} metalness={m} />
    </mesh>
  );
}

/** Soft rounded box (cushions, mattresses). */
function R({ p, s, c, rad = 0.04, r = 0.9 }: { p: V3; s: V3; c: string; rad?: number; r?: number }) {
  return (
    <RoundedBox args={s} position={p} radius={Math.min(rad, ...s.map((v) => v / 2 - 0.001))} smoothness={4} castShadow receiveShadow>
      <meshStandardMaterial color={c} roughness={r} />
    </RoundedBox>
  );
}

function Cyl({ p, rt, rb, h, c, r = 0.6, m = 0, seg = 24 }: { p: V3; rt: number; rb: number; h: number; c: string; r?: number; m?: number; seg?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <meshStandardMaterial color={c} roughness={r} metalness={m} />
    </mesh>
  );
}

function Legs({ w, d, h, c, inset = 0.05, t = 0.04 }: { w: number; d: number; h: number; c: string; inset?: number; t?: number }) {
  const xs = [-w / 2 + inset + t / 2, w / 2 - inset - t / 2];
  const zs = [-d / 2 + inset + t / 2, d / 2 - inset - t / 2];
  return (
    <>
      {xs.flatMap((x) => zs.map((z) => <B key={`${x}${z}`} p={[x, h / 2, z]} s={[t, h, t]} c={c} r={0.5} />))}
    </>
  );
}

const shade = (hex: string, k: number) => "#" + new THREE.Color(hex).multiplyScalar(k).getHexString();

/** Parametric low-poly furniture. Local frame: footprint centered at origin, floor at y=0, front faces +z. */
export function FurnitureModel({ f }: { f: Furniture }) {
  const [w, d, h] = f.size;
  const c = f.color ?? "#bbbbbb";
  const dark = shade(c, 0.7);
  const wood = "#6b4f36";

  const parts = useMemo(() => {
    switch (f.type) {
      case "sofa":
      case "armchair": {
        const arm = Math.min(0.18, w * 0.15);
        const legH = 0.08;
        const seatTop = 0.44;
        const backD = 0.2;
        const n = f.type === "sofa" ? (w > 1.7 ? 3 : 2) : 1;
        const cw = (w - arm * 2) / n;
        return (
          <>
            <Legs w={w} d={d} h={legH} c={wood} t={0.035} />
            <R p={[0, legH + 0.13, 0]} s={[w, 0.26, d]} c={dark} />
            {Array.from({ length: n }, (_, i) => (
              <R key={i} p={[-w / 2 + arm + cw * (i + 0.5), seatTop - 0.05, backD / 2]} s={[cw - 0.01, 0.15, d - backD]} c={c} rad={0.06} />
            ))}
            <R p={[0, (h + legH + 0.26) / 2, -d / 2 + backD / 2]} s={[w, h - legH - 0.26, backD]} c={c} rad={0.07} />
            {Array.from({ length: n }, (_, i) => (
              <R key={`b${i}`} p={[-w / 2 + arm + cw * (i + 0.5), seatTop + 0.2, -d / 2 + backD + 0.07]} s={[cw - 0.04, 0.38, 0.14]} c={shade(c, 1.08)} rad={0.06} />
            ))}
            {[-1, 1].map((sx) => (
              <R key={sx} p={[sx * (w / 2 - arm / 2), legH + 0.29, 0]} s={[arm, 0.58, d]} c={c} rad={0.06} />
            ))}
          </>
        );
      }
      case "bed": {
        const frameH = 0.3;
        return (
          <>
            <Legs w={w} d={d} h={0.06} c={wood} />
            <R p={[0, 0.06 + frameH / 2, 0]} s={[w, frameH, d]} c={c} rad={0.03} />
            <R p={[0, 0.06 + frameH + 0.11, 0.03]} s={[w - 0.06, 0.22, d - 0.1]} c="#f7f5f0" rad={0.05} />
            <R p={[0, h / 2, -d / 2 + 0.05]} s={[w, h, 0.1]} c={c} rad={0.04} />
            {[-1, 1].map((sx) => (
              <R key={sx} p={[sx * (w / 4), 0.06 + frameH + 0.27, -d / 2 + 0.33]} s={[w / 2 - 0.16, 0.13, 0.38]} c="#ffffff" rad={0.06} />
            ))}
            <R p={[0, 0.06 + frameH + 0.24, d * 0.15]} s={[w - 0.02, 0.05, d * 0.6]} c={shade(c, 0.82)} rad={0.025} />
          </>
        );
      }
      case "dining_table":
      case "coffee_table":
      case "desk":
        return (
          <>
            <B p={[0, h - 0.02, 0]} s={[w, 0.04, d]} c={c} r={0.45} />
            <Legs w={w} d={d} h={h - 0.04} c={f.type === "coffee_table" ? c : dark} />
            {f.type === "coffee_table" && <B p={[0, 0.12, 0]} s={[w - 0.1, 0.02, d - 0.1]} c={c} r={0.5} />}
          </>
        );
      case "nightstand":
        return (
          <>
            <Legs w={w} d={d} h={0.1} c={dark} />
            <B p={[0, 0.1 + (h - 0.1) / 2, 0]} s={[w, h - 0.1, d]} c={c} r={0.5} />
            <B p={[0, h * 0.62, d / 2 + 0.005]} s={[w - 0.04, 0.005, 0.01]} c={dark} />
            <Cyl p={[0, h * 0.75, d / 2 + 0.015]} rt={0.012} rb={0.012} h={0.02} c="#c9a96e" m={0.8} r={0.3} />
          </>
        );
      case "chair":
        return (
          <>
            <Legs w={w} d={d} h={0.43} c={dark} inset={0.02} t={0.03} />
            <R p={[0, 0.45, 0]} s={[w, 0.05, d]} c={c} rad={0.02} />
            <R p={[0, 0.45 + (h - 0.45) / 2 + 0.02, -d / 2 + 0.03]} s={[w, h - 0.45, 0.04]} c={c} rad={0.02} />
          </>
        );
      case "office_chair":
        return (
          <>
            <Cyl p={[0, 0.04, 0]} rt={w / 2.2} rb={w / 2.2} h={0.03} c="#1a1a1d" seg={5} />
            <Cyl p={[0, 0.25, 0]} rt={0.025} rb={0.025} h={0.4} c="#888" m={0.9} r={0.25} />
            <R p={[0, 0.48, 0]} s={[w * 0.85, 0.08, d * 0.85]} c={c} rad={0.04} />
            <R p={[0, 0.85, -d / 2 + 0.08]} s={[w * 0.8, h - 0.6, 0.07]} c={c} rad={0.04} />
          </>
        );
      case "tv_stand":
        return (
          <>
            <Legs w={w} d={d} h={0.08} c={wood} />
            <B p={[0, 0.08 + (h - 0.08) / 2, 0]} s={[w, h - 0.08, d]} c={c} r={0.45} />
            {[-1, 0, 1].map((i) => (
              <B key={i} p={[(i * w) / 3, 0.08 + (h - 0.08) / 2, d / 2 + 0.002]} s={[w / 3 - 0.02, h - 0.12, 0.004]} c={shade(c, 1.15)} r={0.4} />
            ))}
          </>
        );
      case "tv":
        return (
          <>
            <B p={[0, h / 2, 0]} s={[w, h, Math.min(d, 0.05)]} c="#0d0d10" r={0.3} m={0.4} />
            <mesh position={[0, h / 2, Math.min(d, 0.05) / 2 + 0.001]}>
              <planeGeometry args={[w - 0.03, h - 0.03]} />
              <meshStandardMaterial color="#05070c" roughness={0.08} metalness={0.6} emissive="#0b1424" emissiveIntensity={0.6} />
            </mesh>
          </>
        );
      case "rug":
        return <B p={[0, 0.006, 0]} s={[w, 0.012, d]} c={c} r={1} />;
      case "bookshelf": {
        const n = Math.max(3, Math.round(h / 0.38));
        const books = ["#a24936", "#2f4858", "#e0c879", "#6b8f71", "#d9d4cc", "#3c3c44", "#b5653f"];
        const rnd = (i: number) => ((Math.sin(i * 91.7 + w * 13) * 43758.5453) % 1 + 1) % 1;
        return (
          <>
            {[-1, 1].map((s) => <B key={s} p={[s * (w / 2 - 0.01), h / 2, 0]} s={[0.02, h, d]} c={c} r={0.5} />)}
            <B p={[0, h / 2, -d / 2 + 0.005]} s={[w, h, 0.01]} c={shade(c, 0.9)} />
            {Array.from({ length: n + 1 }, (_, i) => <B key={i} p={[0, (i * (h - 0.02)) / n + 0.01, 0]} s={[w, 0.02, d]} c={c} r={0.5} />)}
            {Array.from({ length: n }, (_, row) => {
              let x = -w / 2 + 0.04;
              const out = [];
              let k = 0;
              while (x < w / 2 - 0.1 && k < 30) {
                const i = row * 31 + k++;
                const bw = 0.025 + rnd(i) * 0.035;
                const bh = 0.2 + rnd(i + 7) * 0.1;
                if (rnd(i + 3) > 0.15)
                  out.push(<B key={i} p={[x + bw / 2, (row * (h - 0.02)) / n + 0.02 + bh / 2, 0.01]} s={[bw, bh, d * 0.75]} c={books[Math.floor(rnd(i + 5) * books.length)]} r={0.8} />);
                x += bw + 0.003;
              }
              return out;
            })}
          </>
        );
      }
      case "wardrobe": {
        const doors = Math.max(2, Math.round(w / 0.5));
        return (
          <>
            <B p={[0, h / 2, 0]} s={[w, h, d]} c={c} r={0.5} />
            {Array.from({ length: doors - 1 }, (_, i) => {
              const x = -w / 2 + ((i + 1) * w) / doors;
              return <B key={i} p={[x, h / 2, d / 2 + 0.001]} s={[0.006, h - 0.04, 0.004]} c={shade(c, 0.6)} />;
            })}
            {Array.from({ length: doors }, (_, i) => {
              const x = -w / 2 + ((i + 0.5) * w) / doors + (i % 2 ? -0.35 : 0.35) * (w / doors);
              return <B key={`h${i}`} p={[x, h * 0.5, d / 2 + 0.015]} s={[0.012, 0.25, 0.02]} c="#b8a07a" m={0.8} r={0.3} />;
            })}
          </>
        );
      }
      case "kitchen_counter": {
        const units = Math.max(2, Math.round(w / 0.6));
        return (
          <>
            <B p={[0, 0.05, -0.03]} s={[w, 0.1, d - 0.08]} c="#1d1d20" />
            <B p={[0, 0.1 + (h - 0.14) / 2, -0.01]} s={[w, h - 0.14, d - 0.02]} c={c} r={0.4} />
            {Array.from({ length: units }, (_, i) => (
              <B key={i} p={[-w / 2 + ((i + 0.5) * w) / units, h - 0.12, d / 2 - 0.01]} s={[0.25, 0.012, 0.02]} c="#999" m={0.9} r={0.3} />
            ))}
            <B p={[0, h - 0.02, 0]} s={[w + 0.02, 0.04, d]} c="#2c2b2a" r={0.25} />
            <B p={[w * 0.22, h + 0.001, 0]} s={[0.58, 0.004, 0.5]} c="#0a0a0b" r={0.1} m={0.3} />
            <B p={[-w * 0.22, h - 0.04, 0]} s={[0.5, 0.06, 0.4]} c="#9aa0a6" m={0.9} r={0.25} />
            <Cyl p={[-w * 0.22, h + 0.12, -d / 2 + 0.1]} rt={0.012} rb={0.015} h={0.25} c="#c0c4c8" m={1} r={0.2} />
          </>
        );
      }
      case "fridge":
        return (
          <>
            <R p={[0, h / 2, 0]} s={[w, h, d]} c={c} rad={0.03} r={0.3} />
            <B p={[0, h * 0.62, d / 2 + 0.002]} s={[w - 0.02, 0.006, 0.004]} c="#8b8f94" />
            <B p={[w / 2 - 0.07, h * 0.75, d / 2 + 0.025]} s={[0.02, 0.4, 0.03]} c="#b8bcc0" m={0.9} r={0.25} />
            <B p={[w / 2 - 0.07, h * 0.42, d / 2 + 0.025]} s={[0.02, 0.3, 0.03]} c="#b8bcc0" m={0.9} r={0.25} />
          </>
        );
      case "bathtub":
        return (
          <>
            <R p={[0, h / 2, 0]} s={[w, h, d]} c={c} rad={0.06} r={0.15} />
            <R p={[0, h - 0.02, 0]} s={[w - 0.14, 0.03, d - 0.14]} c="#dfe9ee" rad={0.01} r={0.05} />
            <Cyl p={[-w / 2 + 0.1, h + 0.08, 0]} rt={0.015} rb={0.015} h={0.16} c="#c0c4c8" m={1} r={0.2} />
          </>
        );
      case "toilet":
        return (
          <>
            <Cyl p={[0, 0.2, 0.05]} rt={w * 0.42} rb={w * 0.32} h={0.4} c={c} r={0.15} />
            <R p={[0, 0.41, 0.06]} s={[w * 0.9, 0.04, d * 0.62]} c={c} rad={0.02} r={0.15} />
            <R p={[0, 0.6, -d / 2 + 0.09]} s={[w, 0.38, 0.18]} c={c} rad={0.03} r={0.15} />
          </>
        );
      case "sink":
        return (
          <>
            <B p={[0, (h - 0.15) / 2 + 0.1, -0.01]} s={[w, h - 0.15, d - 0.02]} c="#b48a60" r={0.5} />
            <R p={[0, h - 0.06, 0]} s={[w, 0.12, d]} c={c} rad={0.03} r={0.12} />
            <Cyl p={[0, h + 0.08, -d / 2 + 0.06]} rt={0.012} rb={0.015} h={0.16} c="#c0c4c8" m={1} r={0.2} />
            <mesh position={[0, h * 1.6, -d / 2 + 0.01]}>
              <boxGeometry args={[w * 0.9, 0.7, 0.01]} />
              <meshStandardMaterial color="#cfd8dc" metalness={1} roughness={0.02} />
            </mesh>
          </>
        );
      case "plant": {
        const potH = Math.min(0.4, h * 0.3);
        return (
          <>
            <Cyl p={[0, potH / 2, 0]} rt={w * 0.32} rb={w * 0.24} h={potH} c="#d9cbb8" r={0.8} />
            {[
              [0, 0.55, 0, 0.32],
              [0.12, 0.72, 0.05, 0.26],
              [-0.1, 0.8, -0.06, 0.24],
              [0.03, 0.95, 0.02, 0.2],
            ].map(([x, y, z, s], i) => (
              <mesh key={i} position={[x * w * 2, potH + (y as number) * (h - potH) * 0.8, z * d * 2]} castShadow>
                <icosahedronGeometry args={[(s as number) * w * 1.1, 1]} />
                <meshStandardMaterial color={i % 2 ? c : shade(c, 1.2)} roughness={0.85} flatShading />
              </mesh>
            ))}
          </>
        );
      }
      case "floor_lamp":
        return (
          <>
            <Cyl p={[0, 0.015, 0]} rt={0.14} rb={0.15} h={0.03} c="#222" m={0.6} r={0.4} />
            <Cyl p={[0, h / 2, 0]} rt={0.012} rb={0.012} h={h - 0.2} c="#222" m={0.6} r={0.4} />
            <mesh position={[0, h - 0.13, 0]} castShadow>
              <cylinderGeometry args={[w * 0.32, w * 0.48, 0.28, 32, 1, true]} />
              <meshStandardMaterial color={c} roughness={0.9} side={THREE.DoubleSide} emissive="#ffcf8a" emissiveIntensity={0.35} />
            </mesh>
            <pointLight position={[0, h - 0.2, 0]} intensity={1.6} distance={4} decay={2} color="#ffd59a" />
          </>
        );
      default:
        return <R p={[0, h / 2, 0]} s={[w, h, d]} c={c} rad={0.02} />;
    }
  }, [f.type, w, d, h, c, dark]);

  return <>{parts}</>;
}
