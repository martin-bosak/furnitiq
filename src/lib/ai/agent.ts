import "server-only";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { CATALOG } from "@/lib/scene/catalog";
import { applyOp, describeScene, type SceneOp } from "@/lib/scene/ops";
import type { Scene, Selection, Vec2 } from "@/lib/scene/schema";

export function openrouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set (see .env.example)");
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    defaultHeaders: { "HTTP-Referer": "https://furnitiq.local", "X-Title": "Furnitiq" },
  });
}

export type ChatContext = {
  scene: Scene;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  selection: Selection;
  pin: Vec2 | null;
};

export type AgentResult = { reply: string; ops: SceneOp[] };

const vec2 = { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } as const;
const FLOORS = ["oak", "walnut", "tile", "concrete", "carpet"];
const size3 = { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 } as const;

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ChatCompletionTool => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

export const TOOLS: ChatCompletionTool[] = [
  fn(
    "add_furniture",
    "Add a furniture item. `type` must be a catalog key. Size defaults to the catalog size.",
    {
      type: { type: "string", enum: Object.keys(CATALOG) },
      name: { type: "string" },
      position: { ...vec2, description: "Footprint center [x, y] in meters" },
      rotation: { type: "number", description: "Degrees, clockwise from above. 0 = front faces +y" },
      elevation: { type: "number" },
      size: { ...size3, description: "[width, depth, height] meters" },
      color: { type: "string", description: "Hex color" },
    },
    ["type", "position"],
  ),
  fn(
    "update_furniture",
    "Move, rotate, resize, recolor or rename an existing furniture item.",
    {
      id: { type: "string" },
      position: vec2,
      rotation: { type: "number" },
      elevation: { type: "number" },
      size: size3,
      color: { type: "string" },
      name: { type: "string" },
      type: { type: "string", enum: Object.keys(CATALOG) },
    },
    ["id"],
  ),
  fn("remove", "Remove any object (furniture, wall, opening, camera) by id.", { id: { type: "string" } }, ["id"]),
  fn(
    "add_wall",
    "Add a straight wall from a to b.",
    { a: vec2, b: vec2, thickness: { type: "number" }, height: { type: "number" } },
    ["a", "b"],
  ),
  fn(
    "update_wall",
    "Change a wall's endpoints, thickness, height or color.",
    { id: { type: "string" }, a: vec2, b: vec2, thickness: { type: "number" }, height: { type: "number" }, color: { type: "string" } },
    ["id"],
  ),
  fn(
    "add_opening",
    "Add a door or window to a wall. `offset` is the distance in meters from wall point a to the opening center.",
    {
      wallId: { type: "string" },
      kind: { type: "string", enum: ["door", "window"] },
      offset: { type: "number" },
      width: { type: "number" },
      height: { type: "number" },
      sill: { type: "number" },
    },
    ["wallId", "kind", "offset"],
  ),
  fn(
    "update_opening",
    "Resize or move an opening along its wall.",
    { id: { type: "string" }, offset: { type: "number" }, width: { type: "number" }, height: { type: "number" }, sill: { type: "number" } },
    ["id"],
  ),
  fn(
    "set_camera",
    "Create or update a camera. Omit id to create. `activate` makes it the one shown in the render view.",
    {
      id: { type: "string" },
      name: { type: "string" },
      position: vec2,
      target: { ...vec2, description: "Point on the plan the camera looks at" },
      height: { type: "number", description: "Eye height (default 1.6)" },
      fov: { type: "number" },
      activate: { type: "boolean" },
    },
  ),
  fn(
    "add_room",
    "Create a room: walls around a rectangle (corners a and b) or a polygon, plus its name/floor. Walls that already exist along an edge are reused, so rooms can share walls.",
    {
      a: { ...vec2, description: "Corner [x, y]" },
      b: { ...vec2, description: "Opposite corner [x, y]" },
      polygon: { type: "array", items: vec2, description: "Instead of a/b: corner points in order" },
      name: { type: "string" },
      floor: { type: "string", enum: FLOORS },
      height: { type: "number" },
    },
  ),
  fn(
    "set_room",
    "Name a room, change its floor material or hide its ceiling. Identify it by `id` (from the scene's rooms) or any point `at` inside it.",
    { id: { type: "string" }, at: vec2, name: { type: "string" }, floor: { type: "string", enum: FLOORS }, ceiling: { type: "boolean" } },
  ),
  fn(
    "add_zone",
    "Add a floor zone: a different floor material over part of a room (e.g. tiles in the kitchen part of an open-plan room).",
    { polygon: { type: "array", items: vec2 }, floor: { type: "string", enum: FLOORS }, name: { type: "string" } },
    ["polygon", "floor"],
  ),
  fn(
    "update_zone",
    "Change a floor zone's outline, floor or name.",
    { id: { type: "string" }, polygon: { type: "array", items: vec2 }, floor: { type: "string", enum: FLOORS }, name: { type: "string" } },
    ["id"],
  ),
  fn("set_style", "Set the interior style prompt used for photorealistic renders.", { prompt: { type: "string" } }, ["prompt"]),
];

/** Converts a tool call into a SceneOp. */
export function toolCallToOp(name: string, args: Record<string, any>): SceneOp {
  switch (name) {
    case "add_furniture":
      return { op: "add_furniture", ...(args as any) };
    case "update_furniture": {
      const { id, ...patch } = args;
      return { op: "update_furniture", id, patch };
    }
    case "remove":
      return { op: "remove", id: args.id };
    case "add_wall":
      return { op: "add_wall", ...(args as any) };
    case "update_wall": {
      const { id, ...patch } = args;
      return { op: "update_wall", id, patch };
    }
    case "add_opening":
      return { op: "add_opening", ...(args as any) };
    case "update_opening": {
      const { id, ...patch } = args;
      return { op: "update_opening", id, patch };
    }
    case "set_camera":
      return { op: "set_camera", ...args };
    case "add_room":
      return { op: "add_room", ...(args as any) };
    case "set_room":
      return { op: "set_room", ...(args as any) };
    case "add_zone":
      return { op: "add_zone", ...(args as any) };
    case "update_zone": {
      const { id, ...patch } = args;
      return { op: "update_zone", id, patch };
    }
    case "set_style":
      return { op: "set_style", prompt: args.prompt };
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

export function systemPrompt(ctx: Omit<ChatContext, "message" | "history">) {
  const catalog = Object.entries(CATALOG)
    .map(([k, v]) => `${k} (${v.size.join("×")} m)`)
    .join(", ");
  const sel = ctx.selection ? `The user has selected ${ctx.selection.kind} "${ctx.selection.id}".` : "Nothing is selected.";
  const pin = ctx.pin ? `The user pinned plan location [${ctx.pin.map((n) => n.toFixed(2)).join(", ")}].` : "";
  return `You are Furnitiq, an expert interior designer that edits a 2D/3D apartment model through tools.

Coordinate system: meters. Plan x → right (east), y → down (south). Rotation in degrees clockwise seen from above; at rotation 0 an item's front faces +y (south), 90 → west, 180 → north, 270 → east. Furniture position is the footprint center; size is [width, depth, height]. Keep items inside rooms, not overlapping walls (walls are centered on their line, ~0.12 m thick), and leave ≥0.8 m walkways. Put backs of sofas, beds, wardrobes against walls when sensible.

Rooms: floors and ceilings are generated automatically from walls — every closed loop of walls is a room, and moving a wall reshapes its room. To create a room use add_room (or add walls that form a closed loop); never try to draw floors separately. Walls must meet end-to-end or end-on-wall to close a loop. Use set_room to name a room or change its floor, and add_zone for a different floor in part of a room. The scene lists closed rooms with their polygons; "openEnds" are wall ends that don't connect (rooms there are not closed yet).

Catalog types: ${catalog}.

${sel} ${pin}
When the user says "here", "this", "it" — use the selection / pinned location.

Make all needed changes with tool calls (you may call several at once), then reply in 1–3 short sentences describing what you changed. If a request is ambiguous, make a tasteful choice rather than asking. If a request is impossible, say so.

Current scene:
${JSON.stringify(describeScene(ctx.scene))}`;
}

export async function runChatAgent(ctx: ChatContext): Promise<AgentResult> {
  const client = openrouter();
  const model = process.env.FURNITIQ_CHAT_MODEL ?? "anthropic/claude-sonnet-5.5";
  let scene = ctx.scene;
  const ops: SceneOp[] = [];
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(ctx) },
    ...ctx.history.slice(-12),
    { role: "user", content: ctx.message },
  ];

  for (let step = 0; step < 6; step++) {
    const res = await client.chat.completions.create({ model, messages, tools: TOOLS, temperature: 0.3 });
    const msg = res.choices[0]?.message;
    if (!msg) throw new Error("Empty response from model");
    const calls = msg.tool_calls ?? [];
    if (!calls.length) return { reply: msg.content?.trim() || "Done.", ops };

    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const call of calls) {
      if (call.type !== "function") continue;
      let result: string;
      try {
        const op = toolCallToOp(call.function.name, JSON.parse(call.function.arguments || "{}"));
        scene = applyOp(scene, op);
        ops.push(op);
        result = "ok";
      } catch (e) {
        result = `error: ${(e as Error).message}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  return { reply: "I made the changes (stopped after several steps).", ops };
}
