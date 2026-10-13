# furnitiq

AI home layout designer: a 2D floor plan editor, a live 3D camera view, one-click photorealistic renders, and a chat assistant that edits the model.

```bash
npm install
cp .env.example .env.local   # add OPENROUTER_API_KEY, optionally DATABASE_URL / ALLIO_*
npm run dev
```

## Architecture

| Layer | Tech |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript |
| Plan editor | SVG (`src/components/PlanView.tsx`) |
| 3D view | three.js via React Three Fiber + drei (`src/components/three/`) |
| State | Zustand with undo/redo (`src/store/editor.ts`) |
| UI | Tailwind v4 + motion, glass design tokens in `src/app/globals.css` |
| AI | OpenAI SDK pointed at OpenRouter (`src/lib/ai/`), or Allio agents |
| Data | Postgres via Drizzle when `DATABASE_URL` is set, otherwise JSON in `./data`. Render images go to `./data/files` |

### Scene format: `furnitiq.scene` v1

`src/lib/scene/schema.ts` (zod) defines the single source of truth. It contains walls (segments with thickness and height), openings (door or window on a wall at an offset), rooms (polygons with a floor material), furniture (catalog type, footprint center, rotation, size), cameras (eye position and target) and a render style prompt. Units are meters. Plan y points down (south). Rotation is in degrees clockwise, and rotation 0 means the item's front faces +y.

All edits go through **`SceneOp`s** (`src/lib/scene/ops.ts`). The UI, the chat agent's tool calls and external agents all use the same operations.

### AI flows

- **Chat** (`POST /api/chat`): the model gets a compact scene, the selection and the pinned point, and edits through tools. The tools are applied server-side for validation, and the ops are applied client-side as one undoable step.
- **Photo** (`POST /api/render`): the viewport is captured and sent with a style prompt to an image model (`FURNITIQ_IMAGE_MODEL`). The model keeps the geometry and camera and replaces materials and lighting. The lightbox has a before/after slider.
- **Claude Code provider** (local): if the `claude` CLI is installed where the server runs, chat can go through `claude -p` headless mode with all tools disabled. It uses your Claude Code login, so no API key is needed. It is selected automatically when `OPENROUTER_API_KEY` is missing. Photo renders still need OpenRouter, because Claude doesn't generate images.
- **Saving** uses optimistic concurrency: every save sends the version it was based on, and a stale tab gets `409` plus the latest version instead of overwriting newer work. Scripts can pass `"force": true`.
- **Allio provider**: the chat request becomes an Allio board task assigned to an agent. The agent replies by setting `status=done` and appending:

  ````
  ```furnitiq-result
  {"reply": "…", "ops": [ { "op": "update_furniture", "id": "f_sofa", "patch": { "position": [2, 1.5] } } ]}
  ```
  ````

### Case A / B (photos → model) — next

An external agent (a skill or MCP server) produces a `furnitiq.scene` JSON from photos. The JSON is then imported with the upload button in the top bar, or posted to `POST /api/projects` with `{ "scene": … }`.

## Shortcuts

Plan: drag items, use the cyan handle to rotate (Alt for fine snap), click empty space to pin, wheel to zoom, drag to pan.
3D: drag to look, wheel to move, WASD to walk, Q/E for height.
Global: `R` rotates 90°, `Ctrl+D` duplicates, `Del` deletes, arrow keys nudge, `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo, `Esc` clears.
