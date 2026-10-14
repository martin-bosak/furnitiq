import { NextResponse } from "next/server";
import { safeFetch } from "@/lib/library/fromUrl";
import { createAsset, syncAll } from "@/lib/library/service";
import { CATALOG } from "@/lib/scene/catalog";

/** List My library (and advance any running generations). */
export async function GET() {
  return NextResponse.json(await syncAll());
}

const extOf = (type: string, name = "") =>
  /png/i.test(type) || /\.png$/i.test(name) ? "png" : /webp/i.test(type) || /\.webp$/i.test(name) ? "webp" : "jpg";

/**
 * Create an asset from uploaded photos and/or image links.
 * multipart: photos[] (files), imageUrls (JSON array), name, category, size (JSON [w,d,h] m), color?, sourceUrl?, sourceKind?, projectId?
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim() || "Furniture";
  const category = String(form.get("category") ?? "box");
  const size = JSON.parse(String(form.get("size") ?? "[0.6,0.6,0.6]")) as [number, number, number];
  if (!(category in CATALOG)) return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  if (size.length !== 3 || size.some((v) => !(v > 0.02 && v < 10))) return NextResponse.json({ error: "Size must be three values in meters" }, { status: 400 });

  const photos: { data: Buffer; ext: string }[] = [];
  for (const f of form.getAll("photos")) {
    if (typeof f === "string") continue;
    if (f.size > 25_000_000) return NextResponse.json({ error: `${f.name} is larger than 25 MB` }, { status: 400 });
    photos.push({ data: Buffer.from(await f.arrayBuffer()), ext: extOf(f.type, f.name) });
  }
  try {
    for (const u of JSON.parse(String(form.get("imageUrls") ?? "[]")) as string[]) {
      const img = await safeFetch(u, 25_000_000, "image/*");
      if (!/^image\//.test(img.type)) continue;
      photos.push({ data: img.data, ext: extOf(img.type, u) });
    }
  } catch (e) {
    return NextResponse.json({ error: `Could not download an image: ${(e as Error).message}` }, { status: 400 });
  }
  if (!photos.length) return NextResponse.json({ error: "Add at least one photo" }, { status: 400 });

  const sourceKind = String(form.get("sourceKind") ?? "photo") as "photo" | "url" | "apartment";
  const asset = await createAsset({
    name,
    category,
    size,
    color: (form.get("color") as string) || undefined,
    photos: photos.slice(0, 4),
    source: {
      kind: sourceKind,
      url: (form.get("sourceUrl") as string) || undefined,
      projectId: (form.get("projectId") as string) || undefined,
    },
  });
  return NextResponse.json(asset, { status: 201 });
}
