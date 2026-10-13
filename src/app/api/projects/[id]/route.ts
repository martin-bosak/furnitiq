import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/repo";
import { parseScene } from "@/lib/scene/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const repo = getRepo();
  const project = await repo.getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...project, renders: await repo.listRenders(id) });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { scene } = await req.json();
  return NextResponse.json(await getRepo().saveProject(id, parseScene(scene)));
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  await getRepo().deleteProject(id);
  return new NextResponse(null, { status: 204 });
}
