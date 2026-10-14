#!/bin/bash
# Download/resume the TripoSG weights (MIT) into ~/furnitiq-gen/weights. Retries when the transfer stalls.
source ~/furnitiq-gen/.venv/bin/activate
export HF_HUB_DOWNLOAD_TIMEOUT=60
for i in $(seq 1 20); do
  python - <<'PY' && { echo "WEIGHTS_OK"; exit 0; }
import os
from huggingface_hub import snapshot_download
snapshot_download("VAST-AI/TripoSG", local_dir=os.path.expanduser("~/furnitiq-gen/weights/TripoSG"))
PY
  echo "attempt $i failed, retrying in 5s"; sleep 5
done
exit 1
