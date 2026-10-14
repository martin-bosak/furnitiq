#!/bin/bash
# Furnitiq local 3D generator — environment setup for WSL2 + ROCm (AMD Radeon).
# Creates ~/furnitiq-gen with its own venv (does not touch other environments).
# Run inside WSL:  bash /mnt/c/Projects/furnitiq/gen/setup_wsl.sh
set -euo pipefail
export HSA_ENABLE_DXG_DETECTION=1

ROOT=~/furnitiq-gen
BASE=https://repo.radeon.com/rocm/manylinux/rocm-rel-7.2.4
WHEELS=(
  "torch-2.10.0+rocm7.2.4.lw.git3d3aa833-cp312-cp312-linux_x86_64.whl"
  "triton-3.6.0+rocm7.2.4.git4ed88892-cp312-cp312-linux_x86_64.whl"
  "torchvision-0.25.0+rocm7.2.4.git82df5f59-cp312-cp312-linux_x86_64.whl"
)

mkdir -p "$ROOT/wheels" && cd "$ROOT"
for w in "${WHEELS[@]}"; do
  [ -f "wheels/$w" ] && continue
  if [ -f ~/llm/wheels/"$w" ]; then cp ~/llm/wheels/"$w" wheels/; else wget -q "$BASE/${w//+/%2B}" -O "wheels/$w"; fi
done

[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q --upgrade pip wheel setuptools ninja pybind11
pip install -q wheels/*.whl
printf "torch==2.10.0\ntorchvision==0.25.0\n" > constraints.txt

[ -d Hunyuan3D-2 ] || git clone -q --depth 1 https://github.com/Tencent/Hunyuan3D-2.git
echo "SETUP_STEP1_DONE"

# ── Step 2: TripoSG (MIT) shape generator + texturing deps ──────────────────
# Hunyuan3D-2 is NOT used: its license excludes the EU/UK/South Korea.
[ -d TripoSG ] || git clone -q --depth 1 https://github.com/VAST-AI-Research/TripoSG.git
# numpy pin in upstream requirements is for py3.10; diso (CUDA-only) is stubbed below.
pip install -q -c constraints.txt diffusers transformers einops huggingface_hub opencv-python-headless trimesh \
  omegaconf scikit-image "numpy<2.3" peft jaxtyping typeguard pymeshlab xatlas open3d "rembg[cpu]" fastapi uvicorn python-multipart pillow
# Stub for the optional CUDA mesh extractor; TripoSG falls back to scikit-image marching cubes.
SITE=$(python -c "import site; print(site.getsitepackages()[0])")
mkdir -p "$SITE/diso"
cat > "$SITE/diso/__init__.py" <<'PY'
class DiffDMC:  # CUDA-only in upstream; not available on ROCm
    def __init__(self, *a, **k):
        raise RuntimeError("diso is not available on this machine (use hierarchical extraction)")
PY
echo "SETUP_STEP2_DONE"
