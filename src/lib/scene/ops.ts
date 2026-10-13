/**
 * Pure scene operations. Used by the editor UI, by the chat agent's tools
 * (server side) and by external agents via the `furnitiq-result` contract.
 */
import { nanoid } from "nanoid";
import { catalogItem } from "./catalog";
import type { Camera, Furniture, Opening, Scene, Vec2, Wall } from "./schema";

export type SceneOp =
  | {
      op: "add_furniture";
      type: string;
      name?: string;
      position: Vec2;
      rotation?: number;
      elevation?: number;
      size?: [number, number, number];
      color?: string;
      id?: string;
    }
  | {
      op: "update_furniture";
      id: string;
      patch: Partial<Omit<Furniture, "id">>;
    }
  | { op: "remove"; id: string }
  | { op: "add_wall"; a: Vec2; b: Vec2; thickness?: number; height?: number; id?: string }
  | { op: "update_wall"; id: string; patch: Partial<Omit<Wall, "id">> }
  | {
      op: "add_opening";
      wallId: string;
      kind: "door" | "window";
      offset: number;
      width?: number;
      height?: number;
      sill?: number;
      id?: string;
    }
  | { op: "update_opening"; id: string; patch: Partial<Omit<Opening, "id" | "wallId">> }
  | {
      op: "set_camera";
      id?: string;
      name?: string;
      position?: Vec2;
      target?: Vec2;
      height?: number;
      targetHeight?: number;
      fov?: number;
      activate?: boolean;
    }
  | { op: "set_style"; prompt: string }
  | { op: "rename"; name: string };

const r = (n: number) => Math.round(n * 1000) / 1000;
const rv = (v: Vec2): Vec2 => [r(v[0]), r(v[1])];

/** Applies one op immutably. Throws on invalid references so agents get feedback. */
export function applyOp(scene: Scene, op: SceneOp): Scene {
  switch (op.op) {
    case "add_furniture": {
      const item = catalogItem(op.type);
      const f: Furniture = {
        id: op.id ?? `f_${nanoid(6)}`,
        type: op.type,
        name: op.name ?? item.label,
        position: rv(op.position),
        rotation: op.rotation ?? 0,
        elevation: op.elevation ?? item.elevation ?? 0,
        size: op.size ?? item.size,
        color: op.color ?? item.color,
      };
      return { ...scene, furniture: [...scene.furniture, f] };
    }
    case "update_furniture": {
      assertExists(scene.furniture, op.id, "furniture");
      return {
        ...scene,
        furniture: scene.furniture.map((f) =>
          f.id === op.id
            ? { ...f, ...op.patch, position: op.patch.position ? rv(op.patch.position) : f.position }
            : f,
        ),
      };
    }
    case "remove": {
      const has = [scene.furniture, scene.walls, scene.openings, scene.cameras, scene.rooms].some((l) =>
        l.some((o) => o.id === op.id),
      );
      if (!has) throw new Error(`No object with id "${op.id}"`);
      const cameras = scene.cameras.filter((c) => c.id !== op.id);
      return {
        ...scene,
        furniture: scene.furniture.filter((f) => f.id !== op.id),
        walls: scene.walls.filter((w) => w.id !== op.id),
        // removing a wall removes its openings too
        openings: scene.openings.filter((o) => o.id !== op.id && o.wallId !== op.id),
        rooms: scene.rooms.filter((x) => x.id !== op.id),
        cameras,
        activeCameraId: scene.activeCameraId === op.id ? cameras[0]?.id : scene.activeCameraId,
      };
    }
    case "add_wall": {
      const w: Wall = {
        id: op.id ?? `w_${nanoid(6)}`,
        a: rv(op.a),
        b: rv(op.b),
        thickness: op.thickness ?? 0.12,
        height: op.height ?? scene.walls[0]?.height ?? 2.7,
        color: scene.walls[0]?.color ?? "#f2efe9",
      };
      return { ...scene, walls: [...scene.walls, w] };
    }
    case "update_wall": {
      assertExists(scene.walls, op.id, "wall");
      return { ...scene, walls: scene.walls.map((w) => (w.id === op.id ? { ...w, ...op.patch } : w)) };
    }
    case "add_opening": {
      assertExists(scene.walls, op.wallId, "wall");
      const door = op.kind === "door";
      const o: Opening = {
        id: op.id ?? `o_${nanoid(6)}`,
        wallId: op.wallId,
        kind: op.kind,
        offset: r(op.offset),
        width: op.width ?? (door ? 0.9 : 1.2),
        height: op.height ?? (door ? 2.05 : 1.4),
        sill: op.sill ?? (door ? 0 : 0.85),
      };
      return { ...scene, openings: [...scene.openings, o] };
    }
    case "update_opening": {
      assertExists(scene.openings, op.id, "opening");
      return {
        ...scene,
        openings: scene.openings.map((o) => (o.id === op.id ? { ...o, ...op.patch } : o)),
      };
    }
    case "set_camera": {
      const existing = op.id ? scene.cameras.find((c) => c.id === op.id) : undefined;
      const base: Camera = existing ?? {
        id: op.id ?? `c_${nanoid(6)}`,
        name: op.name ?? `Camera ${scene.cameras.length + 1}`,
        position: op.position ?? [0, 0],
        target: op.target ?? [1, 0],
        height: 1.6,
        targetHeight: 1.3,
        fov: 65,
      };
      const cam: Camera = {
        ...base,
        ...(op.name !== undefined && { name: op.name }),
        ...(op.position && { position: rv(op.position) }),
        ...(op.target && { target: rv(op.target) }),
        ...(op.height !== undefined && { height: op.height }),
        ...(op.targetHeight !== undefined && { targetHeight: op.targetHeight }),
        ...(op.fov !== undefined && { fov: op.fov }),
      };
      const cameras = existing
        ? scene.cameras.map((c) => (c.id === cam.id ? cam : c))
        : [...scene.cameras, cam];
      return {
        ...scene,
        cameras,
        activeCameraId: op.activate || !scene.activeCameraId ? cam.id : scene.activeCameraId,
      };
    }
    case "set_style":
      return { ...scene, style: { prompt: op.prompt } };
    case "rename":
      return { ...scene, name: op.name };
  }
}

export function applyOps(scene: Scene, ops: SceneOp[]): Scene {
  return ops.reduce(applyOp, scene);
}

function assertExists(list: { id: string }[], id: string, what: string) {
  if (!list.some((o) => o.id === id)) throw new Error(`No ${what} with id "${id}"`);
}

// ── geometry helpers ───────────────────────────────────────────────────────

export function wallLength(w: Wall) {
  return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
}

export function wallAngle(w: Wall) {
  return Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
}

export function pointOnWall(w: Wall, offset: number): Vec2 {
  const len = wallLength(w) || 1;
  const t = offset / len;
  return [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
}

export function sceneBounds(scene: Scene) {
  const pts: Vec2[] = [
    ...scene.walls.flatMap((w) => [w.a, w.b]),
    ...scene.rooms.flatMap((r) => r.polygon),
    ...scene.furniture.map((f) => f.position),
  ];
  if (!pts.length) return { minX: -5, minY: -5, maxX: 5, maxY: 5 };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Compact, token-friendly description of the scene for LLM context. */
export function describeScene(scene: Scene) {
  return {
    name: scene.name,
    style: scene.style.prompt,
    bounds: sceneBounds(scene),
    rooms: scene.rooms.map((r) => ({ id: r.id, name: r.name, polygon: r.polygon })),
    walls: scene.walls.map((w) => ({ id: w.id, a: w.a, b: w.b, length: r(wallLength(w)) })),
    openings: scene.openings.map((o) => ({
      id: o.id,
      wallId: o.wallId,
      kind: o.kind,
      offset: o.offset,
      width: o.width,
    })),
    furniture: scene.furniture.map((f) => ({
      id: f.id,
      type: f.type,
      name: f.name,
      position: f.position,
      rotation: f.rotation,
      size: f.size,
      color: f.color,
    })),
    cameras: scene.cameras.map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
      target: c.target,
      fov: c.fov,
      active: c.id === scene.activeCameraId,
    })),
  };
}
