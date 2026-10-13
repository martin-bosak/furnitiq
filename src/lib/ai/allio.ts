import "server-only";
import { describeScene, type SceneOp } from "@/lib/scene/ops";
import { systemPrompt, type ChatContext } from "./agent";

/**
 * Allio provider: the chat request becomes a board task assigned to an Allio
 * agent. The agent edits nothing directly — it answers by setting the task to
 * `done` and appending a fenced block to the description:
 *
 * ```furnitiq-result
 * { "reply": "Moved the sofa under the window.", "ops": [ { "op": "update_furniture", ... } ] }
 * ```
 *
 * `ops` uses the SceneOp format from src/lib/scene/ops.ts.
 */

function cfg() {
  const url = process.env.ALLIO_URL;
  const token = process.env.ALLIO_TOKEN;
  const group = process.env.ALLIO_GROUP;
  if (!url || !token || !group) throw new Error("ALLIO_URL, ALLIO_TOKEN and ALLIO_GROUP must be set (see .env.example)");
  return { url: url.replace(/\/$/, ""), token, group };
}

async function allio<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { url, token } = cfg();
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Allio ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

type AllioTask = { id: string; title: string; status: string; description?: string | null };

export async function createAllioTask(ctx: ChatContext, agent?: string) {
  const { group } = cfg();
  const assignee = agent || process.env.ALLIO_DEFAULT_AGENT;
  const description = `${ctx.message}

---
${systemPrompt(ctx).replace(/Current scene:[\s\S]*$/, "")}
Respond by setting this task's status to "done" and appending a fenced block with language \`furnitiq-result\` containing JSON: {"reply": string, "ops": SceneOp[]}.
SceneOp kinds: add_furniture, update_furniture{id,patch}, remove{id}, add_wall, update_wall{id,patch}, add_opening, update_opening{id,patch}, add_room{a,b|polygon,name,floor}, set_room{id|at,name,floor,ceiling}, add_zone{polygon,floor,name}, update_zone{id,patch}, set_camera, set_style{prompt}. Floors/ceilings come from closed wall loops automatically.

Scene:
\`\`\`json
${JSON.stringify(describeScene(ctx.scene))}
\`\`\``;
  const task = await allio<AllioTask>("POST", `/api/groups/${group}/tasks`, {
    title: `Furnitiq: ${ctx.message.slice(0, 80)}`,
    description,
    ...(assignee && { assignee }),
    status: "todo",
    importance: "medium",
    project_name: "furnitiq",
  });
  return task.id;
}

export async function pollAllioTask(id: string): Promise<{ status: string; reply?: string; ops?: SceneOp[] }> {
  const { group } = cfg();
  const tasks = await allio<AllioTask[]>("GET", `/api/groups/${group}/tasks`);
  const task = tasks.find((t) => t.id === id);
  if (!task) return { status: "missing" };
  const m = task.description?.match(/```furnitiq-result\s*([\s\S]*?)```/);
  if (!m) return { status: task.status };
  const parsed = JSON.parse(m[1]) as { reply?: string; ops?: SceneOp[] };
  return { status: "done", reply: parsed.reply ?? "Done.", ops: parsed.ops ?? [] };
}
