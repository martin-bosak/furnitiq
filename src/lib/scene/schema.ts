/**
 * Furnitiq Scene format (furnitiq.scene v1)
 *
 * Plan coordinates are in meters, x → right/east, y → down/south (SVG convention).
 * In 3D the plan maps to (x, height, y) with Y up.
 * Rotations are in degrees, clockwise when seen from above.
 *
 * This is the contract shared by the editor, the chat agent and external
 * agents (Case A/B: photos → model). Keep it backwards compatible; bump
 * `version` and add a migration in `parseScene` for breaking changes.
 */
import { z } from "zod";
import { migrateRooms } from "./rooms";

export const Vec2 = z.tuple([z.number(), z.number()]);
export type Vec2 = z.infer<typeof Vec2>;

export const Wall = z.object({
  id: z.string(),
  a: Vec2,
  b: Vec2,
  thickness: z.number().positive().default(0.12),
  height: z.number().positive().default(2.7),
  color: z.string().default("#f2efe9"),
});
export type Wall = z.infer<typeof Wall>;

export const Opening = z.object({
  id: z.string(),
  wallId: z.string(),
  kind: z.enum(["door", "window"]),
  /** Distance in meters from wall point `a` to the opening center. */
  offset: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** Height of the bottom edge above the floor (0 for doors). */
  sill: z.number().min(0).default(0),
});
export type Opening = z.infer<typeof Opening>;

/**
 * Room metadata. Room *shapes* come from the walls: every closed loop of walls
 * is a room (see rooms.ts). A label is attached to the loop containing `at`.
 * With `zone: true` the record is instead an explicit floor area (`polygon`)
 * drawn on top, e.g. tiles in the kitchen part of an open-plan room.
 */
export const Room = z.object({
  id: z.string(),
  name: z.string(),
  floor: z.enum(["oak", "walnut", "tile", "concrete", "carpet"]).default("oak"),
  at: Vec2.optional(),
  polygon: z.array(Vec2).min(3).optional(),
  zone: z.boolean().optional(),
  ceiling: z.boolean().optional(),
});
export type Room = z.infer<typeof Room>;

export const Furniture = z.object({
  id: z.string(),
  /** Catalog key, see catalog.ts. Unknown keys render as a generic box. */
  type: z.string(),
  name: z.string().optional(),
  /** Center of the footprint on the plan. */
  position: Vec2,
  /** Height of the bottom above the floor. */
  elevation: z.number().default(0),
  rotation: z.number().default(0),
  /** [width (x), depth (y), height] in meters. */
  size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  color: z.string().optional(),
  /** Free-form: material, brand, product url, notes from the vision agent… */
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type Furniture = z.infer<typeof Furniture>;

export const Camera = z.object({
  id: z.string(),
  name: z.string(),
  position: Vec2,
  height: z.number().default(1.6),
  target: Vec2,
  targetHeight: z.number().default(1.3),
  fov: z.number().min(15).max(120).default(65),
});
export type Camera = z.infer<typeof Camera>;

export const Scene = z.object({
  schema: z.literal("furnitiq.scene").default("furnitiq.scene"),
  version: z.union([z.literal(1), z.literal(2)]).default(2),
  name: z.string().default("Untitled apartment"),
  units: z.literal("m").default("m"),
  walls: z.array(Wall).default([]),
  openings: z.array(Opening).default([]),
  rooms: z.array(Room).default([]),
  furniture: z.array(Furniture).default([]),
  cameras: z.array(Camera).default([]),
  activeCameraId: z.string().optional(),
  style: z
    .object({
      prompt: z.string().default("Modern Scandinavian interior, warm natural daylight"),
    })
    .default({ prompt: "Modern Scandinavian interior, warm natural daylight" }),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type Scene = z.infer<typeof Scene>;

export function parseScene(input: unknown): Scene {
  const scene = Scene.parse(input);
  // v1 stored room polygons; v2 derives them from walls.
  return { ...scene, version: 2, rooms: migrateRooms(scene.walls, scene.rooms) };
}

export type SceneObjectKind = "wall" | "opening" | "furniture" | "camera" | "room" | "zone";
export type Selection = { kind: SceneObjectKind; id: string } | null;
