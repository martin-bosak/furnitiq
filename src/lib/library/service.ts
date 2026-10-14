import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { DATA_DIR, getRepo, saveFile } from "@/lib/db/repo";
import type { LibraryAsset } from "./types";

/**
 * Talks to the local 3D generator (gen/server.py, runs in WSL on the GPU) and
 * keeps library assets in sync with its jobs. Generation is local-only: when
 * the generator isn't reachable assets stay "queued" and are submitted later.
 */
const GEN_URL = (process.env.FURNITIQ_GEN_URL || "http://127.0.0.1:8199").replace(/\/$/, "");

export type GeneratorHealth = { ok: boolean; gpu?: string; vram?: number; queue?: number; error?: string };

export async function generatorHealth(): Promise<GeneratorHealth> {
  try {
    const res = await fetch(`${GEN_URL}/health`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, ...(await res.json()) };
  } catch {
    return { ok: false, error: "Generator not running" };
  }
}

const folder = (id: string) => `library/${id}`;
const filePath = (url: string) => path.join(DATA_DIR, "files", ...url.replace(/^\/api\/files\//, "").split("/"));

export async function createAsset(input: {
  name: string;
  category: string;
  size: [number, number, number];
  color?: string;
  photos: { data: Buffer; ext: string }[];
  source: Omit<LibraryAsset["source"], "photos">;
}): Promise<LibraryAsset> {
  const id = `a_${nanoid(8)}`;
  const photos: string[] = [];
  for (const [i, p] of input.photos.entries()) photos.push(await saveFile(folder(id), p.data, p.ext, `input-${i + 1}.${p.ext}`));
  const now = new Date().toISOString();
  const asset: LibraryAsset = {
    id,
    name: input.name,
    category: input.category,
    size: input.size,
    color: input.color,
    status: "queued",
    stage: "Waiting for the generator",
    source: { ...input.source, photos },
    thumbnail: photos[0],
    createdAt: now,
    updatedAt: now,
  };
  await getRepo().saveAsset(asset);
  return syncAsset(asset);
}

/** Advance one asset: submit queued work, poll running jobs, collect results. */
export async function syncAsset(asset: LibraryAsset): Promise<LibraryAsset> {
  if (asset.status === "ready" || asset.status === "failed") return asset;
  const repo = getRepo();
  const save = (patch: Partial<LibraryAsset>) => repo.saveAsset((asset = { ...asset, ...patch, updatedAt: new Date().toISOString() }));

  try {
    if (!asset.jobId) {
      const form = new FormData();
      for (const url of asset.source.photos) {
        const data = await fs.readFile(filePath(url));
        form.append("images", new Blob([new Uint8Array(data)]), path.basename(url));
      }
      form.append("size", JSON.stringify(asset.size));
      form.append("name", asset.name);
      if (asset.color) form.append("color", asset.color);
      const res = await fetch(`${GEN_URL}/jobs`, { method: "POST", body: form, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`Generator rejected the job: ${await res.text()}`);
      const job = (await res.json()) as { id: string };
      return await save({ jobId: job.id, status: "processing", stage: "Queued on GPU", error: undefined });
    }

    const res = await fetch(`${GEN_URL}/jobs/${asset.jobId}`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (res.status === 404) return await save({ jobId: undefined, status: "queued", stage: "Generator restarted, resubmitting" });
    const job = (await res.json()) as { status: string; stage?: string; progress?: number; error?: string; generator?: string };
    if (job.status === "failed") return await save({ status: "failed", error: job.error ?? "Generation failed", stage: undefined });
    if (job.status !== "done") return await save({ status: "processing", stage: job.stage, progress: job.progress });

    const [model, thumb] = await Promise.all([
      fetch(`${GEN_URL}/jobs/${asset.jobId}/model.glb`).then((r) => r.arrayBuffer()),
      fetch(`${GEN_URL}/jobs/${asset.jobId}/thumbnail.png`).then((r) => (r.ok ? r.arrayBuffer() : null)),
    ]);
    const modelUrl = await saveFile(folder(asset.id), Buffer.from(model), "glb", "model.glb");
    const thumbUrl = thumb ? await saveFile(folder(asset.id), Buffer.from(thumb), "png", "thumbnail.png") : asset.thumbnail;
    return await save({ status: "ready", model: modelUrl, thumbnail: thumbUrl, stage: undefined, progress: 1, generator: job.generator });
  } catch (e) {
    const msg = (e as Error).message;
    // Generator offline: keep the asset queued; it is submitted on a later sync.
    if (/fetch failed|ECONNREFUSED|timeout|aborted/i.test(msg)) return await save({ stage: "Waiting for the generator (start it in WSL)" });
    return await save({ status: "failed", error: msg, stage: undefined });
  }
}

export async function syncAll() {
  const assets = await getRepo().listAssets();
  return Promise.all(assets.map((a) => (a.status === "queued" || a.status === "processing" ? syncAsset(a) : a)));
}

export async function retryAsset(id: string) {
  const asset = await getRepo().getAsset(id);
  if (!asset) return null;
  const reset: LibraryAsset = { ...asset, status: "queued", jobId: undefined, error: undefined, stage: "Waiting for the generator", updatedAt: new Date().toISOString() };
  await getRepo().saveAsset(reset);
  return syncAsset(reset);
}

export async function deleteAsset(id: string) {
  const asset = await getRepo().getAsset(id);
  // Free the GPU queue too (best effort; the generator may be offline).
  if (asset?.jobId && asset.status !== "ready") await fetch(`${GEN_URL}/jobs/${asset.jobId}`, { method: "DELETE", signal: AbortSignal.timeout(3000) }).catch(() => {});
  await getRepo().deleteAsset(id);
  await fs.rm(path.join(DATA_DIR, "files", "library", id.replace(/[^\w-]/g, "")), { recursive: true, force: true });
}
