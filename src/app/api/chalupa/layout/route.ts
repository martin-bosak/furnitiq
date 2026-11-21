import { NextResponse } from "next/server";
import { LayoutSchema, layoutStore } from "@/lib/chalupa/layout";

export async function GET() {
  return NextResponse.json(await layoutStore().get());
}

/**
 * Save the furniture arrangement. `baseVersion` must match the stored version, otherwise
 * someone else saved in the meantime: respond 409 with the current layout instead of overwriting it.
 */
export async function PUT(req: Request) {
  const body = await req.json();
  const parsed = LayoutSchema.safeParse(body.layout);
  if (!parsed.success) return NextResponse.json({ error: "invalid layout" }, { status: 400 });
  const store = layoutStore();
  const current = await store.get();
  if (!body.force && current.version !== body.baseVersion) {
    return NextResponse.json({ error: "conflict", current }, { status: 409 });
  }
  return NextResponse.json(await store.put(parsed.data, current.version + 1));
}
