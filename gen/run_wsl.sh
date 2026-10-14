#!/bin/bash
# Start the Furnitiq local 3D generator (inside WSL). Windows reaches it at http://127.0.0.1:8199
set -euo pipefail
export HSA_ENABLE_DXG_DETECTION=1
export PYTHONDONTWRITEBYTECODE=1  # keep the project tree quiet (Next.js watches it)
source ~/furnitiq-gen/.venv/bin/activate
cd /mnt/c/Projects/furnitiq/gen
exec uvicorn server:app --host 0.0.0.0 --port 8199 --log-level warning
