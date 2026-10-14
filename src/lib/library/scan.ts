import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { claudePrint, extractJson } from "@/lib/ai/claudeCli";
import { DATA_DIR } from "@/lib/db/repo";
import { CATALOG } from "@/lib/scene/catalog";
import type { Scene } from "@/lib/scene/schema";
import { createAsset } from "./service";
import type { LibraryAsset } from "./types";

/**
 * "Furnish from photos": room photos -> one library asset per distinct piece.
 * Claude (local Claude Code, vision) finds each piece, matches it to plan items,
 * groups identical ones (4 chairs -> 1 asset) and picks the clearest view; we
 * crop that view and queue it for the GPU generator.
 */

export type ScanItem = {
  name: string;
  category: string;
  sceneIds: string[];
  photo: string;
  box: [number, number, number, number];
  quality: "good" | "partial" | "poor";
  note?: string;
};

export type ScanResult = {
  items: (ScanItem & { assetId: string })[];
  skipped: { name: string; reason: string }[];
};

const MAX_SIDE = 1600; // what Claude looks at; crops come from the full-resolution original

export async function scanRoomPhotos(photos: { data: Buffer; name: string }[], scene: Scene, projectId?: string): Promise<ScanResult> {
  const id = `scan_${nanoid(6)}`;
  const dir = path.join(DATA_DIR, "files", "library", "scans", id);
  await fs.mkdir(dir, { recursive: true });

  const files: { name: string; full: string; small: string; w: number; h: number }[] = [];
  for (const [i, p] of photos.entries()) {
    const name = `photo-${String(i + 1).padStart(2, "0")}.jpg`;
    const img = sharp(p.data).rotate(); // respect EXIF orientation
    const full = path.join(dir, name);
    const meta = await img.clone().jpeg({ quality: 92 }).toFile(full);
    const small = path.join(dir, `small-${name}`);
    await img.clone().resize(MAX_SIDE, MAX_SIDE, { fit: "inside" }).jpeg({ quality: 85 }).toFile(small);
    files.push({ name, full, small, w: meta.width, h: meta.height });
  }

  const furniture = scene.furniture.map((f) => ({ id: f.id, name: f.name ?? f.type, type: f.type, size_m: f.size }));
  const prompt = `You are helping build 3D models of the real furniture in an apartment.

Photos (read every one with the Read tool):
${files.map((f) => `- ${f.small}  (id "${f.name}")`).join("\n")}

The apartment's floor plan already lists these furniture items (id, name, type, size [width, depth, height] m):
${JSON.stringify(furniture)}

Catalog types: ${Object.keys(CATALOG).join(", ")}.

Task: list each distinct physical furniture piece you can see. For each:
- name: short descriptive name (e.g. "Cherry wood cupboard", "Grey L-sofa")
- category: one catalog type
- sceneIds: ids of the plan items it corresponds to (identical pieces like 4 matching chairs = ONE entry listing all their ids; [] if not in the plan)
- photo: the photo id with the clearest, most complete, least occluded view of it
- box: [x0, y0, x1, y1] tight bounding box of the WHOLE piece in that photo, as fractions 0..1 of image width/height
- quality: "good" (whole piece clearly visible), "partial" (cut off or partly hidden), or "poor" (mostly hidden / cluttered)
- note: what blocks the view, if anything

Skip walls, doors, windows, curtains, lamps on the ceiling, small decor, clothes and toys. Prefer views where the piece is seen from the front or at a 3/4 angle.
Respond with ONLY JSON: {"items": [...]}`;

  const text = await claudePrint(prompt, {
    systemPrompt: "You are a precise visual analyst. You answer only with the requested JSON.",
    tools: ["Read"],
    addDirs: [dir],
    timeoutMs: 600_000,
  });
  const parsed = extractJson(text) as { items?: ScanItem[] };
  const sceneIds = new Set(scene.furniture.map((f) => f.id));

  const result: ScanResult = { items: [], skipped: [] };
  for (const it of parsed.items ?? []) {
    const file = files.find((f) => f.name === it.photo);
    if (!file || !Array.isArray(it.box) || it.box.length !== 4) {
      result.skipped.push({ name: it.name ?? "?", reason: "no usable photo/box" });
      continue;
    }
    // Rugs are flat: a texture, not a 3D model.
    if (it.category === "rug") {
      result.skipped.push({ name: it.name, reason: "flat item (rug), no 3D model needed" });
      continue;
    }
    // Mostly hidden pieces make poor models: ask for a dedicated photo instead of generating junk.
    if (it.quality === "poor") {
      result.skipped.push({ name: it.name, reason: `mostly hidden in the photos${it.note ? ` (${it.note})` : ""}; add one clear photo of it` });
      continue;
    }
    const [x0, y0, x1, y1] = it.box.map((v) => Math.min(1, Math.max(0, Number(v))));
    if (x1 - x0 < 0.04 || y1 - y0 < 0.04) {
      result.skipped.push({ name: it.name, reason: "too small in the photo" });
      continue;
    }
    // 6% padding so background removal sees the whole outline.
    const padX = (x1 - x0) * 0.06;
    const padY = (y1 - y0) * 0.06;
    const left = Math.max(0, Math.floor((x0 - padX) * file.w));
    const top = Math.max(0, Math.floor((y0 - padY) * file.h));
    const width = Math.min(file.w - left, Math.ceil((x1 - x0 + 2 * padX) * file.w));
    const height = Math.min(file.h - top, Math.ceil((y1 - y0 + 2 * padY) * file.h));
    const crop = await sharp(file.full).extract({ left, top, width, height }).jpeg({ quality: 95 }).toBuffer();

    const ids = (it.sceneIds ?? []).filter((x) => sceneIds.has(x));
    const first = scene.furniture.find((f) => f.id === ids[0]);
    const category = it.category in CATALOG ? it.category : (first?.type ?? "box");
    const size = first?.size ?? (CATALOG as Record<string, { size: [number, number, number] }>)[category]?.size ?? [0.6, 0.6, 0.6];
    const asset: LibraryAsset = await createAsset({
      name: it.name,
      category,
      size,
      color: first?.color,
      photos: [{ data: crop, ext: "jpg" }],
      source: { kind: "apartment", projectId, note: `${it.quality}${it.note ? ` · ${it.note}` : ""} · from ${it.photo}` },
    });
    result.items.push({ ...it, sceneIds: ids, category, assetId: asset.id });
  }
  return result;
}
