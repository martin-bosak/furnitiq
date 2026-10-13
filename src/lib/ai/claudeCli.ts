import "server-only";
import { execFile, spawn } from "node:child_process";
import os from "node:os";
import { applyOp, type SceneOp } from "@/lib/scene/ops";
import { systemPrompt, type AgentResult, type ChatContext } from "./agent";

/**
 * Local Claude Code provider: runs the user's `claude` CLI in headless mode
 * (`claude -p`) with all tools disabled. Uses the CLI's own login, so no API
 * key is needed. Only works where the CLI is installed (local dev).
 */

const BIN = process.env.FURNITIQ_CLAUDE_BIN || "claude";
const TIMEOUT_MS = 240_000;

let available: Promise<boolean> | undefined;
export function claudeCliAvailable(): Promise<boolean> {
  if (process.env.FURNITIQ_CLAUDE_CLI === "0") return Promise.resolve(false);
  return (available ??= new Promise((resolve) => {
    execFile(BIN, ["--version"], { timeout: 10_000, windowsHide: true }, (err) => resolve(!err));
  }));
}

const OPS_SPEC = `SceneOp JSON shapes (all coordinates in meters, rotation in degrees):
{"op":"add_furniture","type":<catalog type>,"position":[x,y],"rotation"?:n,"size"?:[w,d,h],"color"?:"#hex","name"?:s,"elevation"?:n}
{"op":"update_furniture","id":s,"patch":{"position"?:[x,y],"rotation"?:n,"size"?:[w,d,h],"color"?:s,"name"?:s,"elevation"?:n,"type"?:s}}
{"op":"remove","id":s}
{"op":"add_wall","a":[x,y],"b":[x,y],"thickness"?:n,"height"?:n}
{"op":"update_wall","id":s,"patch":{"a"?:[x,y],"b"?:[x,y],"thickness"?:n,"height"?:n,"color"?:s}}
{"op":"add_opening","wallId":s,"kind":"door"|"window","offset":n,"width"?:n,"height"?:n,"sill"?:n}
{"op":"update_opening","id":s,"patch":{"offset"?:n,"width"?:n,"height"?:n,"sill"?:n}}
{"op":"set_camera","id"?:s,"name"?:s,"position"?:[x,y],"target"?:[x,y],"height"?:n,"fov"?:n,"activate"?:bool}
{"op":"add_room","a"?:[x,y],"b"?:[x,y],"polygon"?:[[x,y],...],"name"?:s,"floor"?:"oak"|"walnut"|"tile"|"concrete"|"carpet","height"?:n}
{"op":"set_room","id"?:s,"at"?:[x,y],"name"?:s,"floor"?:s,"ceiling"?:bool}
{"op":"add_zone","polygon":[[x,y],...],"floor":s,"name"?:s}
{"op":"update_zone","id":s,"patch":{"polygon"?:[[x,y],...],"floor"?:s,"name"?:s}}
{"op":"set_style","prompt":s}`;

export async function runClaudeCli(ctx: ChatContext): Promise<AgentResult> {
  const history = ctx.history
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = `${systemPrompt(ctx).replace(
    "Make all needed changes with tool calls (you may call several at once), then reply",
    "Express all needed changes as SceneOps, then reply",
  )}

${OPS_SPEC}

${history ? `Conversation so far:\n${history}\n\n` : ""}User request: ${ctx.message}

Respond with ONLY a JSON object, no prose and no code fences: {"reply": "<1-3 sentences>", "ops": [SceneOp, ...]}`;

  const args = [
    "-p",
    "--output-format", "json",
    "--tools", "",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--system-prompt", "You are Furnitiq's interior design agent. You answer only with the requested JSON.",
  ];
  if (process.env.FURNITIQ_CLAUDE_MODEL) args.push("--model", process.env.FURNITIQ_CLAUDE_MODEL);

  const stdout = await new Promise<string>((resolve, reject) => {
    // Run outside the project so the CLI doesn't pick up this repo's CLAUDE.md/AGENTS.md.
    const child = spawn(BIN, args, { cwd: os.tmpdir(), windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Claude Code CLI timed out"));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not start "${BIN}": ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`Claude Code CLI exited with ${code}: ${(err || out).slice(0, 400)}`));
    });
    child.stdin.end(prompt);
  });

  const envelope = JSON.parse(stdout) as { result?: string; is_error?: boolean };
  if (envelope.is_error || typeof envelope.result !== "string") throw new Error(`Claude Code CLI error: ${stdout.slice(0, 400)}`);
  const parsed = extractJson(envelope.result) as { reply?: string; ops?: SceneOp[] };

  // Keep only ops that apply cleanly, so one bad reference doesn't sink the rest.
  let scene = ctx.scene;
  const ops: SceneOp[] = [];
  const skipped: string[] = [];
  for (const op of parsed.ops ?? []) {
    try {
      scene = applyOp(scene, op);
      ops.push(op);
    } catch (e) {
      skipped.push((e as Error).message);
    }
  }
  const reply = (parsed.reply ?? "Done.") + (skipped.length ? `\n(Skipped ${skipped.length} invalid change(s): ${skipped.join("; ")})` : "");
  return { reply, ops };
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`Claude replied without JSON: ${text.slice(0, 200)}`);
  return JSON.parse(body.slice(start, end + 1));
}
