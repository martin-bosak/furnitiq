"""Feasibility test: photo -> background removal (rembg) -> TripoSG shape -> GLB.

Run inside WSL:
  source ~/furnitiq-gen/.venv/bin/activate
  python /mnt/c/Projects/furnitiq/gen/test_shape.py IN.jpg OUT_DIR
"""
import os
import sys
import time

ROOT = os.path.expanduser("~/furnitiq-gen")
sys.path.insert(0, os.path.join(ROOT, "TripoSG"))
sys.path.insert(0, os.path.join(ROOT, "TripoSG", "scripts"))

import numpy as np
import torch
import trimesh
from huggingface_hub import snapshot_download
from PIL import Image
from rembg import new_session, remove

from image_process import prepare_image  # TripoSG helper; uses our alpha, no RMBG-1.4
from triposg.pipelines.pipeline_triposg import TripoSGPipeline

src, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
t0 = time.time()

# 1. Cut out the object (U2-Net, Apache-2.0) -> RGBA
cut = remove(Image.open(src).convert("RGB"), session=new_session("isnet-general-use"))
rgba = os.path.join(out_dir, "cutout.png")
cut.save(rgba)
print(f"[{time.time()-t0:.0f}s] cutout saved", flush=True)

# 2. TripoSG (MIT)
weights = snapshot_download("VAST-AI/TripoSG", local_dir=os.path.join(ROOT, "weights", "TripoSG"))
print(f"[{time.time()-t0:.0f}s] weights ready", flush=True)
pipe = TripoSGPipeline.from_pretrained(weights).to("cuda", torch.float16)
print(f"[{time.time()-t0:.0f}s] pipeline on GPU", flush=True)

img = prepare_image(rgba, bg_color=np.array([1.0, 1.0, 1.0]), rmbg_net=None)
img.save(os.path.join(out_dir, "prepared.png"))
t1 = time.time()
with torch.no_grad():
    out = pipe(image=img, generator=torch.Generator(device="cuda").manual_seed(42), num_inference_steps=50, guidance_scale=7.0).samples[0]
print(f"[{time.time()-t0:.0f}s] shape generated in {time.time()-t1:.0f}s, peak VRAM {torch.cuda.max_memory_allocated()/1e9:.1f} GB", flush=True)

mesh = trimesh.Trimesh(out[0].astype(np.float32), np.ascontiguousarray(out[1]))
mesh.export(os.path.join(out_dir, "shape.glb"))
print(f"[{time.time()-t0:.0f}s] DONE vertices={len(mesh.vertices)} faces={len(mesh.faces)} extents={np.round(mesh.extents, 3).tolist()}", flush=True)
