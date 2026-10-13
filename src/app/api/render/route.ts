import { NextResponse } from "next/server";
import { imageToBuffer, renderPhoto } from "@/lib/ai/render";
import { getRepo, saveFile } from "@/lib/db/repo";
import { parseScene } from "@/lib/scene/schema";

export const maxDuration = 180;

export async function POST(req: Request) {
  const body = await req.json();
  const scene = parseScene(body.scene);
  const camera = scene.cameras.find((c) => c.id === body.cameraId) ?? scene.cameras[0];
  if (!camera) return NextResponse.json({ error: "Scene has no camera" }, { status: 400 });
  try {
    const { image, prompt } = await renderPhoto({ image: body.image, scene, camera, extra: body.extra });
    const { data, ext } = await imageToBuffer(image);
    const url = await saveFile("renders", data, ext);
    const repo = getRepo();
    const row = body.projectId
      ? await repo.addRender({ projectId: body.projectId, url, cameraName: camera.name, prompt })
      : { id: url, url, cameraName: camera.name, prompt, createdAt: new Date().toISOString() };
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
