import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import { floorAt, floorById, roomById, roomCenter } from "./data";
import { doorOf, toggleDoor } from "./world";

/** Walk-mode physics: raycasts against the model for walls, steps, stairs and gravity (no React). */

// three-mesh-bvh: fast raycasts against the ~230k triangle model (also speeds up pointer picking).
const geoProto = THREE.BufferGeometry.prototype as unknown as Record<string, unknown>;
if (!geoProto.computeBoundsTree) {
  geoProto.computeBoundsTree = computeBoundsTree;
  geoProto.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

export const EYE = 1.6;
const RADIUS = 0.2;
const STEP = 0.4; // highest step you walk up (stairs yes, beds and sofas no)
const RAY_HEIGHTS = [0.42, 0.95, 1.55];
const SPEED = 1.5;
const RUN = 3.0;
/** Outside, in front of the entrance door (Blender 5.32, -12.6), looking at the house. */
export const START = { x: 5.32, z: 12.6, yaw: 0 };

/** Walker state, shared with the minimap and the page (mutable, read every frame). */
export const W = {
  pos: new THREE.Vector3(START.x, 0, START.z),
  vy: 0,
  /** Smoothed feet height for the camera (steps). */
  eyeY: 0,
  yaw: START.yaw,
  pitch: -0.05,
  keys: new Set<string>(),
  target: null as THREE.Vector3 | null,
  stuck: 0,
  floor: 1,
  dragging: false,
  teleport: null as { x: number; z: number; floor: number | null; yaw?: number } | null,
};

/** Meshes the walker collides with (the house model and the ground). */
export const COLLIDE: THREE.Object3D[] = [];

export function walkToRoom(id: string) {
  const r = roomById(id);
  if (!r) return;
  const [x, , z] = roomCenter(r);
  W.teleport = { x, z, floor: r.floor };
  W.target = null;
}
/** Jump to a point of the minimap (three.js x, z) on the walker's floor. */
export function walkToPoint(x: number, z: number) {
  W.teleport = { x, z, floor: W.floor };
  W.target = null;
}
/** Walk to a clicked point on a floor. */
export function walkTowards(p: THREE.Vector3) {
  W.target = p.clone();
  W.stuck = 0;
}

// ---------------------------------------------------------------- raycasting helpers
const rc = new THREE.Raycaster();
(rc as unknown as { firstHitOnly: boolean }).firstHitOnly = true;
const _n = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const nrm = new THREE.Matrix3();

function shown(o: THREE.Object3D | null) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

type Hit = { distance: number; point: THREE.Vector3; normal: THREE.Vector3; object: THREE.Object3D };
function cast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): Hit | null {
  rc.set(origin, dir);
  rc.near = 0;
  rc.far = far;
  const hits = rc.intersectObjects(COLLIDE, true);
  for (const h of hits) {
    if (!shown(h.object) || !h.face) continue;
    const n = h.face.normal.clone().applyMatrix3(nrm.getNormalMatrix(h.object.matrixWorld)).normalize();
    if (n.dot(dir) > 0) n.negate();
    return { distance: h.distance, point: h.point, normal: n, object: h.object };
  }
  return null;
}

function groundBelow(x: number, y: number, z: number, far = 12) {
  const h = cast(_o.set(x, y, z), _d.set(0, -1, 0), far);
  return h ? h.point.y : null;
}

const DIRS = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(Math.cos((i / 8) * Math.PI * 2), 0, Math.sin((i / 8) * Math.PI * 2)));

function clearance(x: number, y: number, z: number) {
  let min = Infinity;
  for (const hgt of [0.5, 1.2, 1.7]) {
    for (const d of DIRS) {
      const h = cast(_n.set(x, y + hgt, z), d, RADIUS + 0.15);
      if (h) min = Math.min(min, h.distance);
    }
  }
  return min;
}

/** A free standing spot near (x, z) on a floor (or on the ground outside when floor is null). */
export function findSpot(x: number, z: number, floor: number | null) {
  const fz = floor ? floorById(floor).z : null;
  for (const r of [0, 0.35, 0.7, 1.05, 1.4, 1.8]) {
    const n = r === 0 ? 1 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      const top = fz !== null ? fz + 1.9 : 6;
      const gy = groundBelow(px, top, pz, fz !== null ? 2.4 : 10);
      if (gy === null) continue;
      if (fz !== null && Math.abs(gy - fz) > 0.25) continue;
      if (clearance(px, gy, pz) > RADIUS + 0.05) return new THREE.Vector3(px, gy, pz);
    }
  }
  return null;
}

/** Move horizontally by `move`, sliding along walls; bumping into a closed door opens it. */
function slide(pos: THREE.Vector3, move: THREE.Vector3) {
  const m = move.clone();
  for (let it = 0; it < 3; it++) {
    const len = m.length();
    if (len < 1e-5) return;
    const dir = m.clone().divideScalar(len);
    let best: Hit | null = null;
    for (const hgt of RAY_HEIGHTS) {
      const h = cast(_o.set(pos.x, pos.y + hgt, pos.z), dir, len + RADIUS);
      if (h && (!best || h.distance < best.distance)) best = h;
    }
    if (!best) {
      pos.add(m);
      return;
    }
    const door = doorOf(best.object);
    if (door && !door.open) toggleDoor(door, true);
    const allowed = Math.max(0, best.distance - RADIUS);
    pos.addScaledVector(dir, allowed);
    const rest = m.addScaledVector(dir, -allowed);
    const n = best.normal.setY(0);
    if (n.lengthSq() < 1e-6) return;
    n.normalize();
    rest.addScaledVector(n, -rest.dot(n));
    m.copy(rest);
  }
}

function pushOut(pos: THREE.Vector3) {
  for (const hgt of [0.45, 1.2]) {
    for (const d of DIRS) {
      const h = cast(_o.set(pos.x, pos.y + hgt, pos.z), d, RADIUS);
      if (h) pos.addScaledVector(d, -(RADIUS - h.distance) * 0.8);
    }
  }
}

let bvhReady = false;
export function buildBvh() {
  if (bvhReady) return;
  const seen = new Set<THREE.BufferGeometry>();
  for (const root of COLLIDE)
    root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry as (THREE.BufferGeometry & { boundsTree?: unknown; computeBoundsTree?: () => void }) | undefined;
      if (!(o as THREE.Mesh).isMesh || !g || seen.has(g) || g.boundsTree) return;
      seen.add(g);
      g.computeBoundsTree?.();
    });
  bvhReady = true;
}


/** Advance the walker by one frame: keys or a clicked target, collisions, steps, gravity. */
export function stepWalk(dt: number, canMove = true) {
  const pos = W.pos;
  if (W.teleport) {
    const t = W.teleport;
    W.teleport = null;
    const spot = findSpot(t.x, t.z, t.floor);
    if (spot) {
      pos.copy(spot);
      W.vy = 0;
      W.eyeY = spot.y;
      if (t.yaw !== undefined) W.yaw = t.yaw;
    }
  }
  // Movement: keys, or walking to a clicked point.
  const k = W.keys;
  const f = (k.has("f") ? 1 : 0) - (k.has("b") ? 1 : 0);
  const s = (k.has("r") ? 1 : 0) - (k.has("l") ? 1 : 0);
  const turn = (k.has("tl") ? 1 : 0) - (k.has("tr") ? 1 : 0);
  if (turn) W.yaw += turn * 1.9 * dt;
  const fwd = new THREE.Vector3(-Math.sin(W.yaw), 0, -Math.cos(W.yaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const move = new THREE.Vector3();
  if (canMove) {
    if (f || s) {
      move.addScaledVector(fwd, f).addScaledVector(right, s).normalize().multiplyScalar((k.has("run") ? RUN : SPEED) * dt);
    } else if (W.target) {
      const to = new THREE.Vector3(W.target.x - pos.x, 0, W.target.z - pos.z);
      const d = to.length();
      if (d < 0.12) W.target = null;
      else {
        move.copy(to).multiplyScalar(Math.min(SPEED * dt, d) / d);
        if (!W.dragging && d > 0.3) {
          let diff = Math.atan2(-to.x, -to.z) - W.yaw;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          W.yaw += diff * Math.min(1, dt * 3);
        }
      }
    }
  }
  if (move.lengthSq() > 0) {
    const before = pos.clone();
    slide(pos, move);
    if (W.target) {
      // Give up when blocked (e.g. a wall between here and the target).
      const got = pos.distanceTo(before);
      W.stuck = got < move.length() * 0.25 ? W.stuck + dt : 0;
      if (W.stuck > 1.2) W.target = null;
    }
  }
  pushOut(pos);

  // Gravity and steps.
  const g = groundBelow(pos.x, pos.y + STEP, pos.z, STEP + 30);
  if (g !== null && g >= pos.y - 1e-3) {
    pos.y = g;
    W.vy = 0;
  } else {
    W.vy -= 9.8 * dt;
    pos.y = Math.max(g ?? -0.4, pos.y + W.vy * dt);
    if (g !== null && pos.y <= g) W.vy = 0;
  }
  W.floor = floorAt(pos.y + 0.3);
}

/** Start walking in a room (or outside at the entrance): place the walker on a free spot. */
export function placeWalker(roomId: string | null) {
  buildBvh();
  const r = roomId ? roomById(roomId) : undefined;
  let spot: THREE.Vector3 | null = null;
  let yaw = START.yaw;
  if (r) {
    const [x, , z] = roomCenter(r);
    spot = findSpot(x, z, r.floor);
    // Look along the room's longer side.
    yaw = r.box[2] - r.box[0] > r.box[3] - r.box[1] ? Math.PI / 2 : 0;
  }
  if (!spot) spot = findSpot(START.x, START.z, null) ?? new THREE.Vector3(START.x, 0, START.z);
  W.pos.copy(spot);
  W.vy = 0;
  W.eyeY = spot.y;
  W.yaw = yaw;
  W.pitch = -0.05;
  W.target = null;
}

/** Plan extent for the minimap: Blender x (west is +x) and y (south is +y). */
export const MAP_BOUNDS = { x0: -2.2, x1: 17.0, y0: -11.6, y1: 2.0 };

