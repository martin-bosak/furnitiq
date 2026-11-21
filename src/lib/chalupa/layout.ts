import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { z } from "zod";
import { DATA_DIR } from "@/lib/db/repo";

/**
 * Furniture arrangement for the Chalupa viewer, stored as changes against the exported model:
 * moved/rotated items, deleted items and duplicates. One shared document (id "default").
 * Positions are three.js world coordinates (y up), rotation is radians around y.
 */
const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const LayoutSchema = z.object({
  items: z.record(z.string(), z.object({ pos: Vec3, rotY: z.number(), deleted: z.boolean().optional() })).default({}),
  added: z.array(z.object({ id: z.string(), src: z.string(), pos: Vec3, rotY: z.number() })).default([]),
});
export type Layout = z.infer<typeof LayoutSchema>;
export type StoredLayout = { layout: Layout; version: number; updatedAt: string };

const EMPTY: StoredLayout = { layout: { items: {}, added: [] }, version: 0, updatedAt: new Date(0).toISOString() };

type Store = { get(): Promise<StoredLayout>; put(layout: Layout, version: number): Promise<StoredLayout> };

function pgStore(url: string): Store {
  const g = globalThis as unknown as { __furnitiqSql?: ReturnType<typeof postgres> };
  const sql = (g.__furnitiqSql ??= postgres(url, { max: 5, prepare: false }));
  const ready = sql`
    CREATE TABLE IF NOT EXISTS chalupa_layouts (
      id text PRIMARY KEY, data jsonb NOT NULL, version integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now());
  `.simple();
  const get = async (): Promise<StoredLayout> => {
    await ready;
    const [row] = await sql<{ data: unknown; version: number; updated_at: Date }[]>`
      SELECT data, version, updated_at FROM chalupa_layouts WHERE id = 'default'`;
    if (!row) return EMPTY;
    return { layout: LayoutSchema.parse(row.data), version: row.version, updatedAt: row.updated_at.toISOString() };
  };
  return {
    get,
    async put(layout, version) {
      await ready;
      await sql`
        INSERT INTO chalupa_layouts (id, data, version) VALUES ('default', ${sql.json(layout as never)}, ${version})
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = now()`;
      return get();
    },
  };
}

function fileStore(): Store {
  const file = path.join(DATA_DIR, "chalupa", "layout.json");
  const get = async (): Promise<StoredLayout> => {
    try {
      const raw = JSON.parse(await fs.readFile(file, "utf8"));
      return { layout: LayoutSchema.parse(raw.layout), version: raw.version ?? 0, updatedAt: raw.updatedAt ?? EMPTY.updatedAt };
    } catch {
      return EMPTY;
    }
  };
  return {
    get,
    async put(layout, version) {
      const stored = { layout, version, updatedAt: new Date().toISOString() };
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(stored, null, 2));
      return stored;
    },
  };
}

let store: Store | undefined;
export function layoutStore(): Store {
  return (store ??= process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : fileStore());
}
