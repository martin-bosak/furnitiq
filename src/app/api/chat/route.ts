import { NextResponse } from "next/server";
import { runChatAgent } from "@/lib/ai/agent";
import { createAllioTask } from "@/lib/ai/allio";
import { parseScene } from "@/lib/scene/schema";

export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json();
  const ctx = {
    scene: parseScene(body.scene),
    message: String(body.message ?? ""),
    history: Array.isArray(body.history) ? body.history : [],
    selection: body.selection ?? null,
    pin: body.pin ?? null,
  };
  try {
    if (body.provider === "allio") {
      return NextResponse.json({ taskId: await createAllioTask(ctx, body.agent) });
    }
    return NextResponse.json(await runChatAgent(ctx));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
