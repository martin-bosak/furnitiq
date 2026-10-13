"use client";

import * as THREE from "three";
import { floorTexture } from "./textures";

/**
 * PBR material library. Textures are CC0 from Poly Haven (public/assets).
 * Textured materials are tinted so the *average* rendered color matches the
 * object's scene color, while keeping grain/weave detail.
 */

export type MatKind =
  | "fabric"
  | "wood"
  | "lacquer"
  | "metal"
  | "ceramic"
  | "stone"
  | "plastic"
  | "screen"
  | "foliage"
  | "plaster"
  | "glass"
  | "matte";

type TexSet = { name: string; mean: [number, number, number]; tile: number };

const SETS: Record<string, TexSet> = {
  linen: { name: "rough_linen", mean: [0.843, 0.843, 0.843], tile: 0.45 },
  cherry: { name: "cherry_veneer", mean: [0.879, 0.689, 0.517], tile: 1.2 },
  oak: { name: "oak_veneer_01", mean: [0.632, 0.494, 0.343], tile: 1.2 },
  plaster: { name: "painted_plaster_wall", mean: [0.942, 0.942, 0.942], tile: 2.5 },
  laminate: { name: "laminate_floor_02", mean: [0.609, 0.504, 0.39], tile: 2.2 },
};

const loader = typeof window !== "undefined" ? new THREE.TextureLoader() : null;
const texCache = new Map<string, THREE.Texture>();

function tex(name: string, map: "diff" | "nor" | "rough", repeat: number) {
  const key = `${name}_${map}_${repeat}`;
  let t = texCache.get(key);
  if (!t) {
    const base = texCache.get(`${name}_${map}`) ?? loader!.load(`/assets/textures/${name}_${map}.jpg`);
    if (!texCache.has(`${name}_${map}`)) {
      base.wrapS = base.wrapT = THREE.RepeatWrapping;
      base.anisotropy = 8;
      if (map === "diff") base.colorSpace = THREE.SRGBColorSpace;
      texCache.set(`${name}_${map}`, base);
    }
    // Clones share the image; only the repeat differs.
    t = base.clone();
    t.repeat.set(repeat, repeat);
    t.needsUpdate = true;
    texCache.set(key, t);
  }
  return t;
}

/** Color that, multiplied with a texture of the given mean, averages to `hex`. */
function tint(hex: string, mean: [number, number, number]) {
  const c = new THREE.Color(hex); // linear
  const m = new THREE.Color().setRGB(...mean, THREE.SRGBColorSpace);
  return new THREE.Color(Math.min(1.6, c.r / m.r), Math.min(1.6, c.g / m.g), Math.min(1.6, c.b / m.b));
}

function luminance(hex: string) {
  const c = new THREE.Color(hex);
  c.convertLinearToSRGB();
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

let granite: THREE.Texture | null = null;
function graniteTexture() {
  if (granite) return granite;
  const S = 512;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#b9bcb8";
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 26000; i++) {
    const v = r();
    g.fillStyle = v < 0.35 ? "#5d615f" : v < 0.6 ? "#e8eae6" : v < 0.75 ? "#8b8f8a" : "#2f3230";
    const s = 1 + r() * 3;
    g.fillRect(r() * S, r() * S, s, s);
  }
  granite = new THREE.CanvasTexture(cv);
  granite.wrapS = granite.wrapT = THREE.RepeatWrapping;
  granite.colorSpace = THREE.SRGBColorSpace;
  return granite;
}

const matCache = new Map<string, THREE.Material>();

/**
 * @param kind  surface type
 * @param color scene color (hex)
 * @param scale approx. object size in meters, used for texture tiling
 */
export function material(kind: MatKind, color: string, scale = 1, roughness?: number): THREE.Material {
  // Very light "wood" is painted/lacquered furniture in practice.
  if (kind === "wood" && luminance(color) > 0.78) kind = "lacquer";
  const rep = Math.max(0.25, Math.round((scale / 1) * 4) / 4);
  const key = `${kind}|${color}|${rep}|${roughness ?? ""}`;
  const hit = matCache.get(key);
  if (hit) return hit;

  let m: THREE.Material;
  switch (kind) {
    case "fabric": {
      const s = SETS.linen;
      const r = rep / s.tile;
      m = new THREE.MeshPhysicalMaterial({
        map: tex(s.name, "diff", r),
        normalMap: tex(s.name, "nor", r),
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughnessMap: tex(s.name, "rough", r),
        color: tint(color, s.mean),
        roughness: 1,
        sheen: 0.6,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.4),
      });
      break;
    }
    case "wood": {
      const s = luminance(color) > 0.5 ? SETS.oak : SETS.cherry;
      const r = rep / s.tile;
      m = new THREE.MeshPhysicalMaterial({
        map: tex(s.name, "diff", r),
        normalMap: tex(s.name, "nor", r),
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughnessMap: tex(s.name, "rough", r),
        color: tint(color, s.mean),
        roughness: roughness ?? 0.75,
        clearcoat: 0.25,
        clearcoatRoughness: 0.35,
      });
      break;
    }
    case "lacquer":
      m = new THREE.MeshPhysicalMaterial({ color, roughness: roughness ?? 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
      break;
    case "metal":
      m = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: roughness ?? 0.28 });
      break;
    case "ceramic":
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
      break;
    case "stone": {
      const t = graniteTexture().clone();
      t.repeat.set(rep, rep);
      t.needsUpdate = true;
      m = new THREE.MeshPhysicalMaterial({ map: t, color: tint(color, [0.72, 0.73, 0.71]), roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.15 });
      break;
    }
    case "plastic":
      m = new THREE.MeshStandardMaterial({ color, roughness: roughness ?? 0.45 });
      break;
    case "screen":
      m = new THREE.MeshPhysicalMaterial({ color: "#05070c", roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
      break;
    case "foliage":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, side: THREE.DoubleSide });
      break;
    case "plaster": {
      const s = SETS.plaster;
      const r = rep / s.tile;
      m = new THREE.MeshStandardMaterial({
        map: tex(s.name, "diff", r),
        normalMap: tex(s.name, "nor", r),
        normalScale: new THREE.Vector2(0.25, 0.25),
        color: tint(color, s.mean),
        roughness: 0.92,
      });
      break;
    }
    case "glass":
      m = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0, metalness: 0, transmission: 1, ior: 1.5, thickness: 0.01, transparent: true, opacity: 0.25 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color, roughness: roughness ?? 0.85 });
  }
  matCache.set(key, m);
  return m;
}

/** Floor material; geometry UVs are in meters. */
export function floorMaterial(kind: string): THREE.Material {
  const key = `floor|${kind}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  let m: THREE.Material;
  if (kind === "oak" || kind === "walnut") {
    const s = SETS.laminate;
    const r = 1 / s.tile;
    // Beech-like laminate from the photos; walnut is darker.
    const target = kind === "oak" ? "#cf9a5e" : "#6e4a30";
    m = new THREE.MeshPhysicalMaterial({
      map: tex(s.name, "diff", r),
      normalMap: tex(s.name, "nor", r),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: tex(s.name, "rough", r),
      color: tint(target, s.mean),
      roughness: 0.8,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25,
    });
  } else {
    m = new THREE.MeshPhysicalMaterial({
      map: floorTexture(kind),
      roughness: kind === "tile" ? 0.3 : 0.8,
      clearcoat: kind === "tile" ? 0.4 : 0,
      clearcoatRoughness: 0.2,
    });
  }
  matCache.set(key, m);
  return m;
}
