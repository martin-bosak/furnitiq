import "server-only";
import { catalogItem } from "@/lib/scene/catalog";
import type { Camera, Scene } from "@/lib/scene/schema";
import { openrouter } from "./agent";

/**
 * Turns a viewport screenshot into a photorealistic image with an image model
 * on OpenRouter. The screenshot pins composition, geometry and camera; the
 * prompt supplies materials, light and style.
 */
export async function renderPhoto(opts: { image: string; scene: Scene; camera: Camera; extra?: string }) {
  const { image, scene, camera, extra } = opts;
  const model = process.env.FURNITIQ_IMAGE_MODEL ?? "google/gemini-2.5-flash-image";

  const items = [...new Set(scene.furniture.map((f) => f.name ?? catalogItem(f.type).label))].join(", ");
  const prompt = [
    `Transform this 3D massing render into a photorealistic interior photograph.`,
    `Keep EXACTLY the same camera position, perspective, room geometry, wall/window/door positions and furniture placement and proportions. Do not add or remove large objects.`,
    `Replace the simple geometry with realistic, high-end materials and furniture of the same type and color. Furniture visible may include: ${items}.`,
    `Style: ${scene.style.prompt}.`,
    extra ? `Additional direction: ${extra}.` : "",
    `Shot as an architectural photo, ${Math.round(camera.fov)}° field of view, natural light through the windows, soft global illumination, realistic shadows, 8k detail.`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await openrouter().chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
    // OpenRouter extension: ask for image output.
    ...({ modalities: ["image", "text"] } as object),
  });

  const msg = res.choices[0]?.message as unknown as { images?: { image_url: { url: string } }[]; content?: string };
  const url = msg?.images?.[0]?.image_url?.url;
  if (!url) throw new Error(`Model returned no image${msg?.content ? `: ${msg.content.slice(0, 200)}` : ""}`);
  return { image: url, prompt };
}

export async function imageToBuffer(url: string): Promise<{ data: Buffer; ext: string }> {
  const m = url.match(/^data:image\/(\w+);base64,(.+)$/);
  if (m) return { data: Buffer.from(m[2], "base64"), ext: m[1] === "jpeg" ? "jpg" : m[1] };
  const res = await fetch(url);
  const type = res.headers.get("content-type") ?? "image/png";
  return { data: Buffer.from(await res.arrayBuffer()), ext: type.split("/")[1]?.replace("jpeg", "jpg") ?? "png" };
}
