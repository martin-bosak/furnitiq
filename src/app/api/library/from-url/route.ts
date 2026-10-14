import { NextResponse } from "next/server";
import { readProductPage } from "@/lib/library/fromUrl";

/** Read a product page: name, images, dimensions (for the "From link" dialog). */
export async function POST(req: Request) {
  const { url } = await req.json();
  try {
    return NextResponse.json(await readProductPage(String(url)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
