import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db/repo";
import { sampleScene } from "@/lib/scene/sample";
import { parseScene } from "@/lib/scene/schema";

export async function GET() {
  return NextResponse.json(await getRepo().listProjects());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const scene = body?.scene ? parseScene(body.scene) : sampleScene();
  return NextResponse.json(await getRepo().createProject(scene), { status: 201 });
}
