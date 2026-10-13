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

/**
 * Save a scene. Unless `force` is set, `baseUpdatedAt` must match the stored
 * version; if the project has changed since
 * (another tab, the chat agent, an import), respond 409 with the current
 * version instead of overwriting it.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { scene, baseUpdatedAt, force } = await req.json();
  const repo = getRepo();
  if (!force) {
    const current = await repo.getProject(id);
    if (current && current.updatedAt !== baseUpdatedAt) {
      return NextResponse.json({ error: "conflict", project: current }, { status: 409 });
    }
  }
  return NextResponse.json(await repo.saveProject(id, parseScene(scene)));
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  await getRepo().deleteProject(id);
  return new NextResponse(null, { status: 204 });
}
