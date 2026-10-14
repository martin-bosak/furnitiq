import { NextResponse } from "next/server";
import { getRepo, saveFile } from "@/lib/db/repo";
import { syncAsset } from "@/lib/library/service";

/** Replace an asset's photos (e.g. after a "retake" warning) and regenerate it in place. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const repo = getRepo();
  const asset = await repo.getAsset((await params).id);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const form = await req.formData();
  const photos: string[] = [];
  let i = 0;
  for (const f of form.getAll("photos")) {
    if (typeof f === "string") continue;
    const ext = /png/i.test(f.type) ? "png" : "jpg";
    photos.push(await saveFile(`library/${asset.id}`, Buffer.from(await f.arrayBuffer()), ext, `retake-${Date.now()}-${++i}.${ext}`));
  }
  if (!photos.length) return NextResponse.json({ error: "Add a photo" }, { status: 400 });
  const next = {
    ...asset,
    // A dedicated photo shows the whole piece: no box prompt needed.
    source: { ...asset.source, photos, box: undefined },
    thumbnail: photos[0],
    status: "queued" as const,
    jobId: undefined,
    error: undefined,
    warning: undefined,
    stage: "Waiting for the generator",
    updatedAt: new Date().toISOString(),
  };
  await repo.saveAsset(next);
  return NextResponse.json(await syncAsset(next));
}
