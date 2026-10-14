"""Furnitiq local 3D generator (runs in WSL2 on the AMD GPU via ROCm).

Photo(s) of one furniture piece -> textured GLB scaled to real dimensions.

Pipeline (all permissive licenses, usable in the EU):
  1. Background removal ............ rembg / IS-Net (MIT/Apache)
  2. Shape ......................... TripoSG (MIT), on the GPU
  3. Clean-up + decimation ......... pymeshlab
  4. UV unwrap ..................... xatlas
  5. Texture v1 .................... project the photo onto visible surfaces (open3d ray casting),
                                     fill hidden surfaces from the nearest visible point
  6. Scale to [width, depth, height], bottom-center origin, front facing +Z, export GLB

Start:  bash /mnt/c/Projects/furnitiq/gen/run_wsl.sh   (listens on :8199)
API:    POST /jobs (multipart images[], size=[w,d,h] m, name) -> {id}
        GET /jobs/{id} -> {status, stage, progress, error}
        GET /jobs/{id}/model.glb, GET /jobs/{id}/thumbnail.png, GET /health
"""
from __future__ import annotations

import json
import os
import queue
import sys
import threading
import time
import traceback
import uuid

ROOT = os.path.expanduser("~/furnitiq-gen")
sys.path.insert(0, os.path.join(ROOT, "TripoSG"))
sys.path.insert(0, os.path.join(ROOT, "TripoSG", "scripts"))
os.environ.setdefault("HSA_ENABLE_DXG_DETECTION", "1")

import cv2
import numpy as np
import open3d as o3d
import pymeshlab
import torch
import trimesh
import xatlas
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from scipy.spatial import cKDTree
from skimage.measure import label

JOBS_DIR = os.path.join(ROOT, "jobs")
os.makedirs(JOBS_DIR, exist_ok=True)
GENERATOR = "TripoSG + photo projection v1"
TEX = 1024
FACES = 60_000

app = FastAPI(title="furnitiq-gen")
jobs: dict[str, dict] = {}
work: "queue.Queue[str]" = queue.Queue()

# ── models (lazy, kept on the GPU) ─────────────────────────────────────────
_pipe = None
_rembg = None
_sam = None


def shape_pipe():
    global _pipe
    if _pipe is None:
        from huggingface_hub import snapshot_download
        from triposg.pipelines.pipeline_triposg import TripoSGPipeline

        weights = snapshot_download("VAST-AI/TripoSG", local_dir=os.path.join(ROOT, "weights", "TripoSG"))
        _pipe = TripoSGPipeline.from_pretrained(weights).to("cuda", torch.float16)
    return _pipe


def rembg_session():
    global _rembg
    if _rembg is None:
        from rembg import new_session

        _rembg = new_session("isnet-general-use")
    return _rembg


def sam_session():
    """Segment Anything (Apache-2.0): segments the object inside a box prompt."""
    global _sam
    if _sam is None:
        from rembg import new_session

        _sam = new_session("sam")
    return _sam


# ── pipeline steps ─────────────────────────────────────────────────────────
def cutout(path: str, box: list[float] | None = None) -> Image.Image:
    """RGBA of the furniture piece only.

    With `box` ([x0, y0, x1, y1] as fractions, e.g. from the room scan) SAM segments exactly that object;
    otherwise salient-object removal, retried with SAM on the central area when the result is implausibly small.
    Only the largest connected part is kept (drops bins, plants next to it).
    """
    from rembg import remove

    src = Image.open(path).convert("RGB")
    W, H = src.size

    def sam(b):
        x0, y0, x1, y1 = b[0] * W, b[1] * H, b[2] * W, b[3] * H
        prompt = [{"type": "rectangle", "label": 1, "data": [x0, y0, x1, y1]}, {"type": "point", "label": 1, "data": [(x0 + x1) / 2, (y0 + y1) / 2]}]
        return np.array(remove(src, session=sam_session(), sam_prompt=prompt))

    if box:
        rgba = sam(box)
    else:
        rgba = np.array(remove(src, session=rembg_session()))
        fg = rgba[..., 3] > 110
        ys_, xs_ = np.nonzero(fg)
        too_small = fg.mean() < 0.12 or not len(xs_) or (xs_.max() - xs_.min()) < 0.3 * W or (ys_.max() - ys_.min()) < 0.3 * H
        if too_small:
            print("salient cutout looks wrong, retrying with SAM", flush=True)
            rgba = sam([0.06, 0.06, 0.94, 0.94])
    # Hard mask: soft mattes on dark objects fail TripoSG's alpha check (it then falls back to RMBG).
    rgba[..., 3] = np.where(rgba[..., 3] > 110, 255, 0).astype(np.uint8)
    alpha = rgba[..., 3] > 127
    lab = label(alpha)
    if lab.max() > 1:
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        keep = lab == sizes.argmax()
        rgba[..., 3] = np.where(keep, rgba[..., 3], 0)
    ys, xs = np.nonzero(rgba[..., 3] > 127)
    crop = rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    # Transparent margin (12%): TripoSG only trusts an alpha channel that has real background in it.
    m = int(max(crop.shape[:2]) * 0.12)
    out = np.zeros((crop.shape[0] + 2 * m, crop.shape[1] + 2 * m, 4), np.uint8)
    out[m : m + crop.shape[0], m : m + crop.shape[1]] = crop
    return Image.fromarray(out)


def generate_shape(rgba_path: str) -> trimesh.Trimesh:
    from image_process import prepare_image

    img = prepare_image(rgba_path, bg_color=np.array([1.0, 1.0, 1.0]), rmbg_net=None)
    with torch.no_grad():
        # use_flash_decoder=False: the flash path needs the CUDA-only `diso`; hierarchical extraction
        # (scikit-image marching cubes) works on ROCm.
        out = shape_pipe()(
            image=img,
            generator=torch.Generator(device="cuda").manual_seed(42),
            num_inference_steps=50,
            guidance_scale=7.0,
            use_flash_decoder=False,
        ).samples[0]
    if out is None or out[0] is None:
        raise RuntimeError("Shape extraction produced no surface (try a clearer photo of the whole piece)")
    return trimesh.Trimesh(out[0].astype(np.float32), np.ascontiguousarray(out[1]), process=False)


def clean(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    ms = pymeshlab.MeshSet()
    ms.add_mesh(pymeshlab.Mesh(vertex_matrix=mesh.vertices, face_matrix=mesh.faces))
    ms.meshing_merge_close_vertices()
    ms.meshing_remove_duplicate_faces()
    ms.meshing_remove_connected_component_by_diameter(mincomponentdiag=pymeshlab.PercentageValue(5))
    if mesh.faces.shape[0] > FACES:
        ms.meshing_decimation_quadric_edge_collapse(targetfacenum=FACES, preservenormal=True, preservetopology=True)
    m = ms.current_mesh()
    return trimesh.Trimesh(m.vertex_matrix(), m.face_matrix(), process=True)


def bake_texture(mesh: trimesh.Trimesh, rgba: Image.Image):
    """UV-unwrap and paint: photo colors where the photo sees the surface, nearest visible color elsewhere."""
    vmap, faces, uvs = xatlas.parametrize(mesh.vertices, mesh.faces)
    verts = mesh.vertices[vmap]
    vnorm = mesh.vertex_normals[vmap]

    # Rasterize UV triangles -> face index per texel.
    fid = np.full((TEX, TEX), -1, np.int32)
    tri_px = uvs[faces] * (TEX - 1)
    tri_px[..., 1] = (TEX - 1) - tri_px[..., 1]  # glTF UV origin is top-left after flip
    for i, t in enumerate(tri_px):
        cv2.fillConvexPoly(fid, np.round(t).astype(np.int32), int(i))
    ys, xs = np.nonzero(fid >= 0)
    f = fid[ys, xs]
    a, b, c = tri_px[f, 0], tri_px[f, 1], tri_px[f, 2]
    p = np.stack([xs, ys], 1).astype(np.float64)
    v0, v1, v2 = b - a, c - a, p - a
    d00 = (v0 * v0).sum(1); d01 = (v0 * v1).sum(1); d11 = (v1 * v1).sum(1)
    d20 = (v2 * v0).sum(1); d21 = (v2 * v1).sum(1)
    den = d00 * d11 - d01 * d01
    den[np.abs(den) < 1e-12] = 1e-12
    w1 = (d11 * d20 - d01 * d21) / den
    w2 = (d00 * d21 - d01 * d20) / den
    bary = np.clip(np.stack([1 - w1 - w2, w1, w2], 1), 0, 1)
    tri = faces[f]
    pos = (verts[tri] * bary[..., None]).sum(1)
    nrm = (vnorm[tri] * bary[..., None]).sum(1)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9

    # Orthographic front projection (TripoSG frame: front faces +Z, Y up), aligned to the photo's silhouette.
    img = np.array(rgba.convert("RGBA")).astype(np.float32) / 255.0
    H, W = img.shape[:2]
    # Map the mesh's front silhouette onto the object's outline in the photo (not the padded image).
    oy, ox = np.nonzero(img[..., 3] > 0.5)
    bx0, bx1, by0, by1 = ox.min(), ox.max(), oy.min(), oy.max()
    lo, hi = mesh.vertices.min(0), mesh.vertices.max(0)
    u = bx0 + (pos[:, 0] - lo[0]) / (hi[0] - lo[0] + 1e-9) * (bx1 - bx0)
    v = by0 + (hi[1] - pos[:, 1]) / (hi[1] - lo[1] + 1e-9) * (by1 - by0)
    ui, vi = np.clip(np.round(u).astype(int), 0, W - 1), np.clip(np.round(v).astype(int), 0, H - 1)

    # Visible = faces the camera and nothing in front of it along +Z.
    scene = o3d.t.geometry.RaycastingScene()
    scene.add_triangles(o3d.core.Tensor(mesh.vertices.astype(np.float32)), o3d.core.Tensor(mesh.faces.astype(np.uint32)))
    origins = (pos + nrm * 2e-3).astype(np.float32)
    dirs = np.tile(np.array([0, 0, 1], np.float32), (len(origins), 1))
    hit = scene.cast_rays(o3d.core.Tensor(np.concatenate([origins, dirs], 1))) ["t_hit"].numpy()
    visible = (nrm[:, 2] > 0.15) & ~np.isfinite(hit) & (img[vi, ui, 3] > 0.5)

    color = np.zeros((len(pos), 3), np.float32)
    color[visible] = img[vi[visible], ui[visible], :3]
    if visible.sum() > 50:
        tree = cKDTree(pos[visible])
        _, nn = tree.query(pos[~visible], k=4)
        color[~visible] = color[visible][nn].mean(1)
    else:
        color[:] = np.median(img[img[..., 3] > 0.5][:, :3], axis=0)

    tex = np.zeros((TEX, TEX, 3), np.uint8)
    tex[ys, xs] = np.clip(color * 255, 0, 255).astype(np.uint8)
    # Pad UV islands so mip-mapping doesn't bleed black seams.
    empty = (fid < 0).astype(np.uint8)
    tex = cv2.inpaint(tex, empty, 3, cv2.INPAINT_TELEA)
    coverage = float(visible.mean())
    return verts, faces, uvs, Image.fromarray(tex), coverage


def _rot(pitch: float, roll: float, yaw: float) -> np.ndarray:
    cx, sx = np.cos(pitch), np.sin(pitch)
    cz, sz = np.cos(roll), np.sin(roll)
    cy, sy = np.cos(yaw), np.sin(yaw)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    return ry @ rz @ rx


def upright(verts: np.ndarray) -> np.ndarray:
    """Rotation that removes camera tilt: furniture is boxy, so the tightest axis-aligned
    bounding box over small pitch/roll/yaw angles puts it square to floor and walls."""
    rng = np.random.default_rng(0)
    pts = verts[rng.choice(len(verts), min(6000, len(verts)), replace=False)] - verts.mean(0)

    def volume(r):
        q = pts @ r.T
        return float(np.prod(q.max(0) - q.min(0)))

    start = volume(np.eye(3))
    best, best_v = np.eye(3), start
    deg = np.deg2rad
    for pitch in np.arange(-40, 41, 4):
        for roll in np.arange(-24, 25, 4):
            for yaw in np.arange(-30, 31, 6):
                r = _rot(deg(pitch), deg(roll), deg(yaw))
                v = volume(r)
                if v < best_v * 0.995:
                    best, best_v = r, v
    # Only straighten when it clearly helps (a level, non-boxy piece stays as generated).
    return best if best_v < start * 0.92 else np.eye(3)


def plausibility(verts: np.ndarray, size) -> float:
    """Worst ratio between the model's proportions and the real ones (1 = perfect)."""
    ext = verts.max(0) - verts.min(0)
    model = np.array([ext[0], ext[2], ext[1]])  # width, depth, height
    real = np.array(size, dtype=float)
    a = model / model.max()
    b = real / real.max()
    return float(np.max(np.maximum(a / b, b / a)))


def fit_and_export(verts, faces, uvs, tex: Image.Image, size, out_path: str):
    """Scale per axis to [width (X), height (Y), depth (Z)], bottom-center at the origin, export GLB."""
    w, d, h = size
    lo, hi = verts.min(0), verts.max(0)
    ext = np.maximum(hi - lo, 1e-6)
    scale = np.array([w / ext[0], h / ext[1], d / ext[2]])
    center = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    v = (verts - center) * scale
    material = trimesh.visual.material.PBRMaterial(baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.7, doubleSided=False)
    mesh = trimesh.Trimesh(v, faces, visual=trimesh.visual.TextureVisuals(uv=uvs, material=material), process=False)
    mesh.export(out_path)
    return mesh


def run_job(job_id: str):
    job = jobs[job_id]
    jdir = os.path.join(JOBS_DIR, job_id)

    def stage(name: str, progress: float):
        job.update(stage=name, progress=progress)
        print(f"[{job_id}] {progress:.0%} {name}", flush=True)

    t0 = time.time()
    stage("Removing background", 0.05)
    rgba = cutout(job["images"][0], job.get("box"))
    rgba_path = os.path.join(jdir, "cutout.png")
    rgba.save(rgba_path)
    thumb = rgba.copy()
    thumb.thumbnail((512, 512))
    thumb.save(os.path.join(jdir, "thumbnail.png"))

    stage("Generating 3D shape on the GPU", 0.15)
    raw = generate_shape(rgba_path)
    stage("Cleaning the mesh", 0.7)
    mesh = clean(raw)
    stage("Painting textures", 0.8)
    verts, faces, uvs, tex, coverage = bake_texture(mesh, rgba)
    tex.save(os.path.join(jdir, "texture.png"))
    stage("Straightening", 0.9)
    # Texture was baked in the camera frame; now remove the camera's tilt from the geometry.
    r = upright(verts) if job.get("upright", True) else np.eye(3)
    verts = (verts - verts.mean(0)) @ r.T
    mismatch = plausibility(verts, job["size"])
    stage("Saving model", 0.95)
    fit_and_export(verts, faces, uvs, tex, job["size"], os.path.join(jdir, "model.glb"))
    warning = None
    if mismatch > 2.2:
        warning = "The shape doesn't match the real proportions, likely a partly hidden view. Retake one clear photo of the whole piece."
    elif coverage < 0.05:
        warning = "Very little of the piece was visible, so most of the texture is guessed. A clearer photo will look better."
    job.update(status="done", stage="Done", progress=1.0, generator=GENERATOR, warning=warning,
               stats={"faces": int(len(faces)), "photo_coverage": round(coverage, 3), "proportion_mismatch": round(mismatch, 2), "seconds": round(time.time() - t0)})
    print(f"[{job_id}] done in {time.time() - t0:.0f}s, {len(faces)} faces, photo covers {coverage:.0%}, mismatch x{mismatch:.2f}", flush=True)


def worker():
    while True:
        job_id = work.get()
        job = jobs.get(job_id)
        if not job or job.get("status") == "cancelled":
            continue
        job["status"] = "processing"
        try:
            run_job(job_id)
        except Exception as e:  # report, keep the worker alive
            traceback.print_exc()
            job.update(status="failed", error=f"{type(e).__name__}: {e}", stage=None)
        finally:
            torch.cuda.empty_cache()
            with open(os.path.join(JOBS_DIR, job_id, "job.json"), "w") as fh:
                json.dump({k: v for k, v in job.items() if k != "images"}, fh)


threading.Thread(target=worker, daemon=True).start()


# ── API ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    props = torch.cuda.get_device_properties(0) if torch.cuda.is_available() else None
    return {"gpu": props.name if props else None, "vram": round(props.total_memory / 1e9, 1) if props else None,
            "queue": work.qsize(), "generator": GENERATOR, "loaded": _pipe is not None}


@app.post("/jobs")
async def create_job(images: list[UploadFile] = File(...), size: str = Form(...), name: str = Form(""), box: str = Form(""), upright: str = Form("1")):
    sz = json.loads(size)
    if len(sz) != 3 or not all(0.005 < float(v) < 10 for v in sz):
        raise HTTPException(400, "size must be [width, depth, height] in meters")
    job_id = uuid.uuid4().hex[:12]
    jdir = os.path.join(JOBS_DIR, job_id)
    os.makedirs(jdir)
    paths = []
    for i, im in enumerate(images[:4]):
        p = os.path.join(jdir, f"input-{i + 1}{os.path.splitext(im.filename or '.jpg')[1] or '.jpg'}")
        with open(p, "wb") as fh:
            fh.write(await im.read())
        paths.append(p)
    bx = json.loads(box) if box else None
    if bx is not None and (len(bx) != 4 or not all(0 <= float(v) <= 1 for v in bx)):
        raise HTTPException(400, "box must be [x0, y0, x1, y1] fractions")
    jobs[job_id] = {"id": job_id, "name": name, "size": [float(v) for v in sz], "images": paths, "box": bx, "upright": upright != "0",
                    "status": "queued", "stage": "Queued on GPU", "progress": 0.0}
    work.put(job_id)
    return {"id": job_id}


@app.delete("/jobs/{job_id}")
def cancel_job(job_id: str):
    job = jobs.get(job_id)
    if job and job["status"] == "queued":
        job.update(status="cancelled", stage=None)
    return {"ok": True}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "unknown job")
    return {k: v for k, v in job.items() if k != "images"}


@app.get("/jobs/{job_id}/{name}")
def job_file(job_id: str, name: str):
    if name not in ("model.glb", "thumbnail.png", "texture.png", "cutout.png") or job_id not in jobs:
        raise HTTPException(404)
    path = os.path.join(JOBS_DIR, job_id, name)
    if not os.path.exists(path):
        raise HTTPException(404)
    return FileResponse(path)
