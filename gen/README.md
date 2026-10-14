# Local 3D generator

Turns photos of one furniture piece into a textured GLB model, sized to its real measurements, on the local AMD GPU (WSL2 + ROCm). The app talks to it at `FURNITIQ_GEN_URL` (default `http://127.0.0.1:8199`). Generation is local-only: on the hosted site, assets wait in the queue.

## Setup (once, inside WSL Ubuntu 24.04 with ROCm 7.2.x)

```bash
bash /mnt/c/Projects/furnitiq/gen/setup_wsl.sh       # venv in ~/furnitiq-gen, PyTorch ROCm, TripoSG
bash /mnt/c/Projects/furnitiq/gen/download_weights.sh # ~7.5 GB, resumes if Hugging Face stalls
```

## Run

```bash
bash /mnt/c/Projects/furnitiq/gen/run_wsl.sh          # uvicorn on :8199
```

## Pipeline (`server.py`)

| Step | Tool | License |
|---|---|---|
| Background removal | rembg (IS-Net) | MIT / Apache-2.0 |
| Shape | TripoSG (code and weights) | MIT |
| Mesh clean-up / decimation (60k faces) | pymeshlab | GPL (separate tool, not linked into the app) |
| UV unwrap | xatlas | MIT |
| Texture v1 | photo projection with Open3D ray casting, nearest-visible fill | MIT |

Hunyuan3D-2 is deliberately **not** used: its license doesn't apply in the EU, UK or South Korea. TripoSG's optional `diso` (CUDA-only) is stubbed, and the scikit-image marching-cubes path is used instead. BRIA RMBG-1.4 (non-commercial) is not used either.

About 75 s per item on an RX 9070: shape ~15 s, mesh extraction and clean-up ~40 s, texture ~10 s.

Known limits of texture v1: only the side the photo shows gets real detail, and photo shadows are baked in. Planned v2: MV-Adapter (Apache-2.0) 6-view generation with CPU baking.
