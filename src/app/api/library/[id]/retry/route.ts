import { NextResponse } from "next/server";
import { retryAsset } from "@/lib/library/service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const asset = await retryAsset((await params).id);
  return asset ? NextResponse.json(asset) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
