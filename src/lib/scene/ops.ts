/**
 * Pure scene operations. Used by the editor UI, by the chat agent's tools
 * (server side) and by external agents via the `furnitiq-result` contract.
 */
import { nanoid } from "nanoid";
import { catalogItem } from "./catalog";
import { interiorPoint, resolveRooms, roomAt } from "./rooms";
import type { Camera, Furniture, Opening, Room, Scene, Vec2, Wall } from "./schema";

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
      assetId?: string;
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
  | {
      /** Walls around a rectangle (a, b = opposite corners) or polygon, plus a room label. Existing walls along an edge are reused. */
      op: "add_room";
      a?: Vec2;
      b?: Vec2;
      polygon?: Vec2[];
      name?: string;
      floor?: Room["floor"];
      thickness?: number;
      height?: number;
    }
  | {
      /** Name / floor of a room: by label id, or the room containing `at` (created if it has no label yet). */
      op: "set_room";
      id?: string;
      at?: Vec2;
      name?: string;
      floor?: Room["floor"];
      ceiling?: boolean;
    }
  | { op: "add_zone"; polygon: Vec2[]; floor: Room["floor"]; name?: string; id?: string }
  | { op: "update_zone"; id: string; patch: { polygon?: Vec2[]; floor?: Room["floor"]; name?: string } }
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
        ...(op.assetId && { assetId: op.assetId }),
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
    case "add_room": {
      const poly: Vec2[] | undefined =
        op.polygon ??
        (op.a && op.b
          ? [
              [op.a[0], op.a[1]],
              [op.b[0], op.a[1]],
              [op.b[0], op.b[1]],
              [op.a[0], op.b[1]],
            ]
          : undefined);
      if (!poly || poly.length < 3) throw new Error("add_room needs `a` and `b` corners or a `polygon`");
      let next = scene;
      for (let i = 0; i < poly.length; i++) {
        const p = rv(poly[i]);
        const q = rv(poly[(i + 1) % poly.length]);
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05 || edgeCovered(next.walls, p, q)) continue;
        next = applyOp(next, { op: "add_wall", a: p, b: q, thickness: op.thickness, height: op.height });
      }
      const label: Room = {
        id: `r_${nanoid(6)}`,
        name: op.name ?? `Room ${next.rooms.filter((r) => !r.zone).length + 1}`,
        floor: op.floor ?? "oak",
        at: rv(interiorPoint(poly)),
      };
      next = { ...next, rooms: [...next.rooms, label] };
      if (!next.cameras.length) {
        const xs = poly.map((p) => p[0]);
        const ys = poly.map((p) => p[1]);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        next = applyOp(next, {
          op: "set_camera",
          name: "Camera 1",
          position: [x0 + (x1 - x0) * 0.15, y0 + (y1 - y0) * 0.85],
          target: [x0 + (x1 - x0) * 0.8, y0 + (y1 - y0) * 0.2],
          activate: true,
        });
      }
      return next;
    }
    case "set_room": {
      const patch = {
        ...(op.name !== undefined && { name: op.name }),
        ...(op.floor !== undefined && { floor: op.floor }),
        ...(op.ceiling !== undefined && { ceiling: op.ceiling }),
      };
      let id = op.id && scene.rooms.some((r) => r.id === op.id && !r.zone) ? op.id : undefined;
      // Unnamed rooms are listed as "face:N": address them by their anchor point.
      const face = !id && op.id?.startsWith("face:") ? resolveRooms(scene).rooms.find((r) => r.id === op.id) : undefined;
      const at = op.at ?? face?.labelAt;
      if (!id && at) id = roomAt(scene, at)?.labelId ?? undefined;
      if (id) return { ...scene, rooms: scene.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
      const target = at ? roomAt(scene, at) : null;
      if (!target) throw new Error(op.id ? `No room with id "${op.id}"` : "No closed room at that point — walls must form a closed loop");
      const room: Room = { id: `r_${nanoid(6)}`, name: target.name, floor: target.floor, at: rv(at!), ...patch };
      return { ...scene, rooms: [...scene.rooms, room] };
    }
    case "add_zone": {
      if (op.polygon.length < 3) throw new Error("A zone needs at least 3 points");
      const zone: Room = { id: op.id ?? `z_${nanoid(6)}`, name: op.name ?? "Floor zone", floor: op.floor, polygon: op.polygon.map(rv), zone: true };
      return { ...scene, rooms: [...scene.rooms, zone] };
    }
    case "update_zone": {
      if (!scene.rooms.some((r) => r.id === op.id && r.zone)) throw new Error(`No zone with id "${op.id}"`);
      return {
        ...scene,
        rooms: scene.rooms.map((r) => (r.id === op.id ? { ...r, ...op.patch, ...(op.patch.polygon && { polygon: op.patch.polygon.map(rv) }) } : r)),
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

/** True when an existing wall already runs along p→q (so add_room doesn't double it). */
function edgeCovered(walls: Wall[], p: Vec2, q: Vec2) {
  const near = (pt: Vec2, w: Wall) => {
    const dx = w.b[0] - w.a[0];
    const dy = w.b[1] - w.a[1];
    const len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((pt[0] - w.a[0]) * dx + (pt[1] - w.a[1]) * dy) / len2));
    return Math.hypot(pt[0] - (w.a[0] + t * dx), pt[1] - (w.a[1] + t * dy)) < 0.03;
  };
  return walls.some((w) => near(p, w) && near(q, w));
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
    ...scene.rooms.flatMap((r) => r.polygon ?? (r.at ? [r.at] : [])),
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
    // Rooms are closed wall loops; `id` is the label id (use it with set_room) or a face id for unnamed rooms.
    rooms: resolveRooms(scene).rooms.map((r) => ({ id: r.labelId ?? r.id, name: r.name, floor: r.floor, area: r.area, polygon: r.polygon.map(rv) })),
    zones: resolveRooms(scene).zones.map((z) => ({ id: z.id, name: z.name, floor: z.floor, polygon: z.polygon })),
    openEnds: resolveRooms(scene).openEnds.map(rv),
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
