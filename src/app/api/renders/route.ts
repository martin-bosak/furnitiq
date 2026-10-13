import { NextResponse } from "next/server";
import { imageToBuffer } from "@/lib/ai/render";
import { getRepo, saveFile } from "@/lib/db/repo";

/** Store a client-rendered image (e.g. a path-traced photo) in the project gallery. */
export async function POST(req: Request) {
  const { projectId, image, cameraName, prompt } = await req.json();
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Expected a data:image URL" }, { status: 400 });
  }
  const { data, ext } = await imageToBuffer(image);
  const url = await saveFile("renders", data, ext);
  const row = projectId
    ? await getRepo().addRender({ projectId, url, cameraName: cameraName ?? "Camera", prompt: prompt ?? "Path traced" })
    : { id: url, url, cameraName: cameraName ?? "Camera", prompt: prompt ?? "Path traced", createdAt: new Date().toISOString() };
  return NextResponse.json(row);
}
