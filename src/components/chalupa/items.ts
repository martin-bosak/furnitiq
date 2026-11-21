import * as THREE from "three";
import { useEdit, type Layout, type SelectedInfo, type Vec3 } from "./editStore";

/**
 * Movable furniture: every item is one node of the GLB (extras: cat "furn", item, label, room),
 * with its origin at the center of its base. Copies made with "Duplicate" are clones of an item.
 */
export const ITEMS = new Map<string, THREE.Object3D>();
/** Time of the last gizmo release: the click that ends a drag must not deselect. */
export const gizmo = { lastUp: 0 };

type Orig = { pos: Vec3; rotY: number };

export function itemInfo(o: THREE.Object3D): SelectedInfo {
  return { id: o.userData.item, label: o.userData.label ?? o.userData.item, room: o.userData.room ?? "" };
}

export function itemTransform(o: THREE.Object3D) {
  return { pos: o.position.toArray() as Vec3, rotY: o.rotation.y };
}

const isCopy = (l: Layout, id: string) => l.added.some((a) => a.id === id);

export function setItemTransform(l: Layout, id: string, t: { pos: Vec3; rotY: number }): Layout {
  if (isCopy(l, id)) return { ...l, added: l.added.map((a) => (a.id === id ? { ...a, ...t } : a)) };
  return { ...l, items: { ...l.items, [id]: { ...t } } };
}

/** Bring the scene in line with the layout: transforms, deleted items, copies. */
export function applyLayout(scene: THREE.Object3D, layout: Layout, furnitureOn: boolean) {
  for (const [id, o] of ITEMS) {
    if (o.userData.copyOf) continue;
    const orig = o.userData.orig as Orig | undefined;
    const ov = layout.items[id];
    const t = ov ?? orig;
    if (t) {
      o.position.fromArray(t.pos);
      o.rotation.y = t.rotY;
    }
    o.visible = furnitureOn && !ov?.deleted;
  }
  const want = new Set(layout.added.map((a) => a.id));
  for (const [id, o] of ITEMS) {
    if (o.userData.copyOf && !want.has(id)) {
      o.removeFromParent();
      ITEMS.delete(id);
    }
  }
  for (const a of layout.added) {
    let c = ITEMS.get(a.id);
    if (!c) {
      const src = ITEMS.get(a.src);
      if (!src) continue;
      c = src.clone();
      c.userData = { ...src.userData, item: a.id, copyOf: a.src, label: `${src.userData.label} (kopie)` };
      scene.add(c);
      ITEMS.set(a.id, c);
    }
    c.position.fromArray(a.pos);
    c.rotation.y = a.rotY;
    c.visible = furnitureOn;
  }
}

// ---------------------------------------------------------------- actions on the selected item
const sel = () => {
  const s = useEdit.getState().selected;
  const o = s ? ITEMS.get(s.id) : undefined;
  return s && o ? { s, o } : null;
};

export function deleteSelected() {
  const x = sel();
  if (!x) return;
  const { s, o } = x;
  useEdit.getState().commit((l) =>
    isCopy(l, s.id)
      ? { ...l, added: l.added.filter((a) => a.id !== s.id) }
      : { ...l, items: { ...l.items, [s.id]: { ...itemTransform(o), deleted: true } } },
  );
  useEdit.getState().select(null);
}

export function rotateSelected(deg = 90) {
  const x = sel();
  if (!x) return;
  const t = itemTransform(x.o);
  t.rotY = Math.round((t.rotY + THREE.MathUtils.degToRad(deg)) / (Math.PI / 12)) * (Math.PI / 12);
  useEdit.getState().commit((l) => setItemTransform(l, x.s.id, t));
}

export function duplicateSelected() {
  const x = sel();
  if (!x) return;
  const src = (x.o.userData.copyOf as string | undefined) ?? x.s.id;
  const id = `${src}#${Math.random().toString(36).slice(2, 8)}`;
  const t = itemTransform(x.o);
  const pos: Vec3 = [t.pos[0] + 0.4, t.pos[1], t.pos[2] + 0.4];
  useEdit.getState().commit((l) => ({ ...l, added: [...l.added, { id, src, pos, rotY: t.rotY }] }));
  // The copy exists after the next applyLayout (a React effect); select it then.
  const trySelect = (n: number) => {
    const c = ITEMS.get(id);
    if (c) useEdit.getState().select(itemInfo(c));
    else if (n < 30) setTimeout(() => trySelect(n + 1), 30);
  };
  trySelect(0);
}

/** Put an original item back where the model has it (copies stay as they are). */
export function resetSelected() {
  const x = sel();
  if (!x || x.o.userData.copyOf) return;
  useEdit.getState().commit((l) => {
    const items = { ...l.items };
    delete items[x.s.id];
    return { ...l, items };
  });
}

export function restoreItem(id: string) {
  useEdit.getState().commit((l) => {
    const items = { ...l.items };
    const ov = items[id];
    if (ov) items[id] = { pos: ov.pos, rotY: ov.rotY };
    return { ...l, items };
  });
}

export function resetAll() {
  useEdit.getState().commit(() => ({ items: {}, added: [] }));
  useEdit.getState().select(null);
}

export function labelOf(id: string) {
  return ITEMS.get(id)?.userData.label ?? id;
}
