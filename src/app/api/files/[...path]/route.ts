import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/db/repo";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  glb: "model/gltf-binary",
  json: "application/json",
};

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const root = path.join(DATA_DIR, "files");
  const file = path.resolve(root, ...parts);
  if (!file.startsWith(root + path.sep)) return new Response("Forbidden", { status: 403 });
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
