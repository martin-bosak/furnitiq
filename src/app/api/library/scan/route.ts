import { NextResponse } from "next/server";
import { scanRoomPhotos } from "@/lib/library/scan";
import { parseScene } from "@/lib/scene/schema";

export const maxDuration = 900;

/**
 * Room photos -> detected furniture -> one queued library asset per distinct piece.
 * multipart: photos[] (up to 30), scene (JSON, to match plan items), projectId?
 * Returns the created assets and which plan items they belong to.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const photos: { data: Buffer; name: string }[] = [];
  for (const f of form.getAll("photos")) {
    if (typeof f === "string") continue;
    photos.push({ data: Buffer.from(await f.arrayBuffer()), name: f.name });
  }
  if (!photos.length) return NextResponse.json({ error: "Add room photos" }, { status: 400 });
  if (photos.length > 30) return NextResponse.json({ error: "Up to 30 photos at a time" }, { status: 400 });
  try {
    const scene = parseScene(JSON.parse(String(form.get("scene") ?? "{}")));
    const result = await scanRoomPhotos(photos, scene, (form.get("projectId") as string) || undefined);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
