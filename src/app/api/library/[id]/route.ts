import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/repo";
import { deleteAsset, syncAsset } from "@/lib/library/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const asset = await getRepo().getAsset((await params).id);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await syncAsset(asset));
}

/** Rename / change category or size (the model is rescaled to the size). */
export async function PATCH(req: Request, { params }: Ctx) {
  const repo = getRepo();
  const asset = await repo.getAsset((await params).id);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { name, category, size } = await req.json();
  return NextResponse.json(
    await repo.saveAsset({ ...asset, ...(name && { name }), ...(category && { category }), ...(size && { size }), updatedAt: new Date().toISOString() }),
  );
}

export async function DELETE(_: Request, { params }: Ctx) {
  await deleteAsset((await params).id);
  return new NextResponse(null, { status: 204 });
}
