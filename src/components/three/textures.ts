"use client";

import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();

function rand(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Procedural floor textures; UVs are in meters, so `metersPerTile` sets the repeat. */
export function floorTexture(kind: string): THREE.Texture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const rnd = rand(kind.length * 977 + 13);
  let metersPerTile = 2;

  if (kind === "oak" || kind === "walnut") {
    const base = kind === "oak" ? [196, 160, 118] : [118, 82, 56];
    const rows = 10; // 2 m / 10 = 20 cm planks
    const ph = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * S * 0.6;
      while (x < S) {
        const len = S * (0.35 + rnd() * 0.45);
        const v = (rnd() - 0.5) * 26;
        g.fillStyle = `rgb(${base[0] + v},${base[1] + v * 0.85},${base[2] + v * 0.7})`;
        g.fillRect(x, r * ph, len, ph);
        // grain
        g.globalAlpha = 0.07;
        for (let i = 0; i < 14; i++) {
          g.strokeStyle = rnd() > 0.5 ? "#3b2a1a" : "#fff3e0";
          g.lineWidth = 0.6 + rnd() * 1.2;
          g.beginPath();
          const y = r * ph + rnd() * ph;
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (rnd() - 0.5) * 6, x + len * 0.7, y + (rnd() - 0.5) * 6, x + len, y);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = "rgba(40,25,10,0.35)";
        g.fillRect(x, r * ph, 1.5, ph);
        x += len;
      }
      g.fillStyle = "rgba(40,25,10,0.3)";
      g.fillRect(0, r * ph, S, 1.5);
    }
  } else if (kind === "tile") {
    metersPerTile = 1.2; // 3 × 40 cm beige stone-look tiles (laid diagonally, see rotation below)
    const n = 3;
    const t = S / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = (rnd() - 0.5) * 14;
        g.fillStyle = `rgb(${196 + v},${184 + v},${168 + v})`;
        g.fillRect(i * t, j * t, t, t);
        // mottled stone look
        for (let k = 0; k < 900; k++) {
          g.fillStyle = `rgba(${rnd() > 0.5 ? "255,250,240" : "90,80,70"},${0.05 + rnd() * 0.08})`;
          const r = 2 + rnd() * 9;
          g.beginPath();
          g.arc(i * t + rnd() * t, j * t + rnd() * t, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    g.fillStyle = "#8f877c";
    for (let i = 0; i <= n; i++) {
      g.fillRect(i * t - 2, 0, 4, S);
      g.fillRect(0, i * t - 2, S, 4);
    }
  } else if (kind === "carpet") {
    g.fillStyle = "#b9b2a6";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40000; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "0,0,0"},0.05)`;
      g.fillRect(rnd() * S, rnd() * S, 2, 2);
    }
  } else {
    // concrete
    g.fillStyle = "#a9a7a3";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 300; i++) {
      const r = 20 + rnd() * 120;
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grd.addColorStop(0, `rgba(${rnd() > 0.5 ? "255,255,255" : "60,60,60"},0.05)`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.save();
      g.translate(rnd() * S, rnd() * S);
      g.fillStyle = grd;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / metersPerTile, 1 / metersPerTile);
  if (kind === "tile") tex.rotation = Math.PI / 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(kind, tex);
  return tex;
}
