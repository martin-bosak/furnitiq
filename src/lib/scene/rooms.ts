/**
 * Rooms are derived from walls: every closed loop of walls is a room with a
 * floor and a ceiling. Room records in the scene only carry metadata (name,
 * floor material) anchored at a point `at`; the polygon follows the walls.
 * Rooms with `zone: true` are explicit floor areas drawn on top (e.g. kitchen
 * tiles inside an open-plan room).
 *
 * Only type imports here: schema.ts imports this module at runtime.
 */
import type { Room, Scene, Vec2, Wall } from "./schema";

const SNAP = 0.02; // endpoints / T-junctions closer than 2 cm are joined
const MIN_AREA = 0.15; // m²

export type ResolvedRoom = {
  /** Label id, or `face:<n>` for an unnamed room. */
  id: string;
  labelId: string | null;
  name: string;
  floor: Room["floor"];
  polygon: Vec2[];
  area: number;
  /** Where to draw the label. */
  labelAt: Vec2;
  ceiling: boolean;
};

export type ResolvedZone = { id: string; name: string; floor: Room["floor"]; polygon: Vec2[]; area: number };

export type RoomLayout = {
  rooms: ResolvedRoom[];
  zones: ResolvedZone[];
  /** Wall ends that don't connect to anything (why a room isn't closed). */
  openEnds: Vec2[];
};

// ── geometry ───────────────────────────────────────────────────────────────

export function polygonArea(poly: Vec2[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function pointInPolygon([x, y]: Vec2, poly: Vec2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A point guaranteed to be inside the polygon (centroid if possible). */
export function interiorPoint(poly: Vec2[]): Vec2 {
  const c: Vec2 = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  if (pointInPolygon(c, poly)) return c;
  // Scanline through the vertical middle: midpoint of the widest inside span.
  const ys = poly.map((p) => p[1]);
  const y = (Math.min(...ys) + Math.max(...ys)) / 2 + 1e-4;
  const xs: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
  }
  xs.sort((a, b) => a - b);
  let best: Vec2 = c;
  let width = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > width) {
      width = xs[i + 1] - xs[i];
      best = [(xs[i] + xs[i + 1]) / 2, y];
    }
  }
  return best;
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}

function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  const e = 1e-6;
  if (t <= e || t >= 1 - e || u <= e || u >= 1 - e) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

// ── wall graph → faces ─────────────────────────────────────────────────────

type Graph = { pts: Vec2[]; adj: Map<number, Set<number>> };

function buildGraph(walls: Wall[]): Graph {
  // Cluster nearby endpoints so slightly-off joints still connect.
  const pts: Vec2[] = [];
  const canon = (p: Vec2): number => {
    for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) < SNAP) return i;
    pts.push([p[0], p[1]]);
    return pts.length - 1;
  };
  const segs = walls
    .filter((w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) > SNAP)
    .map((w) => [canon(w.a), canon(w.b)] as const);
  const endpointIds = new Set(segs.flat());

  // Crossings become shared vertices too.
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const x = segmentIntersection(pts[segs[i][0]], pts[segs[i][1]], pts[segs[j][0]], pts[segs[j][1]]);
      if (x) canon(x);
    }

  const adj = new Map<number, Set<number>>();
  const link = (u: number, v: number) => {
    if (u === v) return;
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u)!.add(v);
    adj.get(v)!.add(u);
  };

  // Split every wall at all vertices lying on it (T-junctions, crossings).
  for (const [ai, bi] of segs) {
    const a = pts[ai];
    const b = pts[bi];
    const onIt: { i: number; t: number }[] = [
      { i: ai, t: 0 },
      { i: bi, t: 1 },
    ];
    pts.forEach((p, i) => {
      if (i === ai || i === bi) return;
      const { d, t } = distToSegment(p, a, b);
      if (d < SNAP && t > 0 && t < 1) onIt.push({ i, t });
    });
    onIt.sort((x, y) => x.t - y.t);
    for (let k = 0; k + 1 < onIt.length; k++) link(onIt[k].i, onIt[k + 1].i);
  }
  void endpointIds;
  return { pts, adj };
}

function prune(g: Graph) {
  // Drop dangling walls (degree-1 chains); they can't bound a room.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [v, ns] of g.adj) {
      if (ns.size <= 1) {
        for (const n of ns) g.adj.get(n)?.delete(v);
        g.adj.delete(v);
        changed = true;
      }
    }
  }
}

function faces(g: Graph): Vec2[][] {
  const angle = (u: number, v: number) => Math.atan2(g.pts[v][1] - g.pts[u][1], g.pts[v][0] - g.pts[u][0]);
  const sorted = new Map<number, number[]>();
  for (const [v, ns] of g.adj) sorted.set(v, [...ns].sort((a, b) => angle(v, a) - angle(v, b)));

  const used = new Set<string>();
  const out: Vec2[][] = [];
  for (const [u, ns] of g.adj)
    for (const v of ns) {
      if (used.has(`${u}>${v}`)) continue;
      const loop: number[] = [];
      let a = u;
      let b = v;
      for (let guard = 0; guard < 10000 && !used.has(`${a}>${b}`); guard++) {
        used.add(`${a}>${b}`);
        loop.push(a);
        const around = sorted.get(b)!;
        const i = around.indexOf(a);
        const next = around[(i - 1 + around.length) % around.length];
        a = b;
        b = next;
      }
      if (loop.length >= 3) out.push(loop.map((i) => g.pts[i]));
    }
  // With this traversal rooms come out with positive signed area (plan y points down);
  // the outer boundary of each wall cluster is negative and gets dropped.
  return out.filter((f) => polygonArea(f) > MIN_AREA);
}

export function wallFaces(walls: Wall[]) {
  const g = buildGraph(walls);
  const degree = new Map<number, number>();
  for (const [v, ns] of g.adj) degree.set(v, ns.size);
  const openEnds = [...degree].filter(([, d]) => d === 1).map(([v]) => g.pts[v]);
  prune(g);
  return { faces: faces(g), openEnds };
}

// ── rooms ──────────────────────────────────────────────────────────────────

const cache = new WeakMap<Wall[], WeakMap<Room[], RoomLayout>>();

export function resolveRooms(scene: Pick<Scene, "walls" | "rooms">): RoomLayout {
  const byRooms = cache.get(scene.walls) ?? new WeakMap();
  cache.set(scene.walls, byRooms);
  const hit = byRooms.get(scene.rooms);
  if (hit) return hit;

  const { faces: polys, openEnds } = wallFaces(scene.walls);
  const labels = scene.rooms.filter((r) => !r.zone);
  const claimed = new Map<number, Room>();
  const orphans: Room[] = [];
  for (const r of labels) {
    const at = r.at ?? (r.polygon ? interiorPoint(r.polygon) : null);
    if (!at) continue;
    // Smallest face containing the anchor (handles nested loops).
    let best = -1;
    polys.forEach((p, i) => {
      if (pointInPolygon(at, p) && (best < 0 || Math.abs(polygonArea(p)) < Math.abs(polygonArea(polys[best])))) best = i;
    });
    if (best >= 0 && !claimed.has(best)) claimed.set(best, r);
    else if (best < 0) orphans.push(r);
  }
  // A label left outside every room (walls moved) attaches to the nearest unnamed room.
  for (const r of orphans) {
    const at = r.at ?? interiorPoint(r.polygon!);
    let best = -1;
    let bestD = Infinity;
    polys.forEach((p, i) => {
      if (claimed.has(i)) return;
      const c = interiorPoint(p);
      const d = Math.hypot(c[0] - at[0], c[1] - at[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) claimed.set(best, r);
  }

  // Unnamed rooms get the next free "Room N".
  const used = new Set(scene.rooms.map((r) => r.name));
  let n = 0;
  const nextName = () => {
    do n++;
    while (used.has(`Room ${n}`));
    used.add(`Room ${n}`);
    return `Room ${n}`;
  };
  const rooms: ResolvedRoom[] = polys.map((polygon, i) => {
    const label = claimed.get(i);
    const at = label?.at;
    return {
      id: label?.id ?? `face:${i}`,
      labelId: label?.id ?? null,
      name: label?.name ?? nextName(),
      floor: label?.floor ?? "oak",
      polygon,
      area: Math.abs(polygonArea(polygon)),
      labelAt: at && pointInPolygon(at, polygon) ? at : interiorPoint(polygon),
      ceiling: label?.ceiling ?? true,
    };
  });
  const zones: ResolvedZone[] = scene.rooms
    .filter((r) => r.zone && r.polygon && r.polygon.length >= 3)
    .map((r) => ({ id: r.id, name: r.name, floor: r.floor, polygon: r.polygon!, area: Math.abs(polygonArea(r.polygon!)) }));

  const layout = { rooms, zones, openEnds };
  byRooms.set(scene.rooms, layout);
  return layout;
}

/** Selection id for a room: its label id, or the anchor of an unnamed room. */
export function roomSelectionId(r: ResolvedRoom) {
  return r.labelId ?? `face@${r.labelAt[0].toFixed(3)},${r.labelAt[1].toFixed(3)}`;
}

export function roomAt(scene: Pick<Scene, "walls" | "rooms">, p: Vec2): ResolvedRoom | null {
  const { rooms } = resolveRooms(scene);
  let best: ResolvedRoom | null = null;
  for (const r of rooms) if (pointInPolygon(p, r.polygon) && (!best || r.area < best.area)) best = r;
  return best;
}

/**
 * Upgrade old scenes whose rooms stored polygons: polygons that match a wall
 * loop become labels (anchored inside); extra polygons inside an already
 * labelled room become floor zones.
 */
export function migrateRooms(walls: Wall[], rooms: Room[]): Room[] {
  if (!rooms.some((r) => r.polygon && !r.zone && !r.at)) return rooms;
  const { faces: polys } = wallFaces(walls);
  const taken = new Set<number>();
  return rooms.map((r) => {
    if (!r.polygon || r.zone || r.at) return r;
    const at = interiorPoint(r.polygon);
    const face = polys.findIndex((p) => pointInPolygon(at, p));
    if (face >= 0 && taken.has(face)) return { ...r, zone: true };
    if (face >= 0) taken.add(face);
    const { polygon: _drop, ...rest } = r;
    return { ...rest, at };
  });
}
