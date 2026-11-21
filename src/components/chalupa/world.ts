import * as THREE from "three";

/**
 * Doors and lamps of the house model. Doors are GLB nodes with extras { cat: "door", openAngle },
 * their origin on the hinge axis; lamps are empty nodes { cat: "lamp", energy, item } where the
 * Blender model has a light.
 */
export type Door = { id: string; obj: THREE.Object3D; label: string; openAngle: number; open: boolean; angle: number };
export type Lamp = { obj: THREE.Object3D; energy: number; color: THREE.Color; floor: number; item?: THREE.Object3D; local?: THREE.Vector3 };

export const DOORS = new Map<string, Door>();
export const LAMPS: Lamp[] = [];

export function doorOf(o: THREE.Object3D | null): Door | null {
  for (let p = o; p; p = p.parent) if (p.userData.cat === "door") return DOORS.get(p.userData.door) ?? null;
  return null;
}

/** Open or close a door; both leaves of a double door ("…L" / "…R") move together. */
export function toggleDoor(d: Door, open = !d.open) {
  d.open = open;
  const m = /^(.*)([LR])$/.exec(d.id);
  const pair = m ? DOORS.get(m[1] + (m[2] === "L" ? "R" : "L")) : undefined;
  if (pair) pair.open = open;
}

/** Swing doors towards their target angle; returns true while any door is moving. */
export function stepDoors(dt: number) {
  let moving = false;
  const sp = 2.6 * dt;
  for (const d of DOORS.values()) {
    const tgt = d.open ? d.openAngle : 0;
    if (d.angle === tgt) continue;
    moving = true;
    d.angle = Math.abs(tgt - d.angle) <= sp ? tgt : d.angle + Math.sign(tgt - d.angle) * sp;
    d.obj.rotation.y = d.angle;
  }
  return moving;
}

/** World position of a lamp (lamps on furniture follow the moved piece). */
export function lampPos(l: Lamp, out: THREE.Vector3) {
  if (l.item && l.local) return l.item.localToWorld(out.copy(l.local));
  return l.obj.getWorldPosition(out);
}
export function lampOn(l: Lamp) {
  if (!l.item) return true;
  for (let p: THREE.Object3D | null = l.item; p; p = p.parent) if (!p.visible) return false;
  return true;
}
