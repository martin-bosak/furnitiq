import { NextResponse } from "next/server";
import { claudeCliAvailable } from "@/lib/ai/claudeCli";
import { getRepo } from "@/lib/db/repo";
import { generatorHealth } from "@/lib/library/service";

export async function GET() {
  return NextResponse.json({
    db: getRepo().kind,
    openrouter: !!process.env.OPENROUTER_API_KEY,
    claudeCli: await claudeCliAvailable(),
    generator: await generatorHealth(),
    allio: !!(process.env.ALLIO_URL && process.env.ALLIO_TOKEN && process.env.ALLIO_GROUP),
    allioDefaultAgent: process.env.ALLIO_DEFAULT_AGENT ?? "",
    chatModel: process.env.FURNITIQ_CHAT_MODEL ?? "anthropic/claude-sonnet-5.5",
    imageModel: process.env.FURNITIQ_IMAGE_MODEL ?? "google/gemini-2.5-flash-image",
  });
}
