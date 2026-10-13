import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import postgres from "postgres";
import { parseScene, type Scene } from "@/lib/scene/schema";
import * as t from "./schema";

export type ProjectSummary = { id: string; name: string; updatedAt: string };
export type Project = ProjectSummary & { scene: Scene };
export type RenderRow = { id: string; projectId: string; url: string; cameraName: string; prompt: string; createdAt: string };

export interface Repo {
  kind: "postgres" | "local";
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(scene: Scene): Promise<Project>;
  saveProject(id: string, scene: Scene): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  listRenders(projectId: string): Promise<RenderRow[]>;
  addRender(r: Omit<RenderRow, "id" | "createdAt">): Promise<RenderRow>;
}

export const DATA_DIR = process.env.FURNITIQ_DATA_DIR || path.join(process.cwd(), "data");

// ── Postgres ───────────────────────────────────────────────────────────────

function postgresRepo(url: string): Repo {
  const g = globalThis as unknown as { __furnitiqSql?: ReturnType<typeof postgres> };
  const sql = (g.__furnitiqSql ??= postgres(url, { max: 5, prepare: false }));
  const drz = drizzle(sql, { schema: t });
  // Self-provision tables (the DB is usually only reachable from inside the hosting network).
  const ready = sql`
    CREATE TABLE IF NOT EXISTS projects (
      id text PRIMARY KEY, name text NOT NULL, scene jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS renders (
      id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      url text NOT NULL, camera_name text NOT NULL, prompt text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now());
  `.simple();
  const conn = async () => (await ready, drz);
  const toProject = (r: typeof t.projects.$inferSelect): Project => ({
    id: r.id,
    name: r.name,
    updatedAt: r.updatedAt.toISOString(),
    scene: parseScene(r.scene),
  });
  return {
    kind: "postgres",
    async listProjects() {
      const rows = await (await conn())
        .select({ id: t.projects.id, name: t.projects.name, updatedAt: t.projects.updatedAt })
        .from(t.projects)
        .orderBy(desc(t.projects.updatedAt));
      return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
    },
    async getProject(id) {
      const [row] = await (await conn()).select().from(t.projects).where(eq(t.projects.id, id));
      return row ? toProject(row) : null;
    },
    async createProject(scene) {
      const [row] = await (await conn()).insert(t.projects).values({ id: nanoid(10), name: scene.name, scene }).returning();
      return toProject(row);
    },
    async saveProject(id, scene) {
      const [row] = await (await conn())
        .insert(t.projects)
        .values({ id, name: scene.name, scene })
        .onConflictDoUpdate({ target: t.projects.id, set: { name: scene.name, scene, updatedAt: new Date() } })
        .returning();
      return toProject(row);
    },
    async deleteProject(id) {
      await (await conn()).delete(t.projects).where(eq(t.projects.id, id));
    },
    async listRenders(projectId) {
      const rows = await (await conn())
        .select()
        .from(t.renders)
        .where(eq(t.renders.projectId, projectId))
        .orderBy(desc(t.renders.createdAt));
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    },
    async addRender(r) {
      const [row] = await (await conn()).insert(t.renders).values({ id: nanoid(10), ...r }).returning();
      return { ...row, createdAt: row.createdAt.toISOString() };
    },
  };
}

// ── Local JSON files (fallback until DATABASE_URL is configured) ────────────

function localRepo(): Repo {
  const dir = path.join(DATA_DIR, "projects");
  const file = (id: string) => path.join(dir, `${id.replace(/[^\w-]/g, "")}.json`);
  type Stored = Project & { renders: RenderRow[] };
  const read = async (id: string): Promise<Stored | null> => {
    try {
      const raw = JSON.parse(await fs.readFile(file(id), "utf8"));
      return { ...raw, scene: parseScene(raw.scene), renders: raw.renders ?? [] };
    } catch {
      return null;
    }
  };
  const write = async (p: Stored) => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file(p.id), JSON.stringify(p, null, 2));
  };
  const strip = ({ renders: _r, ...p }: Stored): Project => p;
  return {
    kind: "local",
    async listProjects() {
      await fs.mkdir(dir, { recursive: true });
      const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json"));
      const all = await Promise.all(names.map((n) => read(n.slice(0, -5))));
      return all
        .filter((p): p is Stored => !!p)
        .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async getProject(id) {
      const p = await read(id);
      return p && strip(p);
    },
    async createProject(scene) {
      const p: Stored = { id: nanoid(10), name: scene.name, scene, updatedAt: new Date().toISOString(), renders: [] };
      await write(p);
      return strip(p);
    },
    async saveProject(id, scene) {
      const existing = await read(id);
      const p: Stored = { id, name: scene.name, scene, updatedAt: new Date().toISOString(), renders: existing?.renders ?? [] };
      await write(p);
      return strip(p);
    },
    async deleteProject(id) {
      await fs.rm(file(id), { force: true });
    },
    async listRenders(projectId) {
      return (await read(projectId))?.renders ?? [];
    },
    async addRender(r) {
      const p = await read(r.projectId);
      if (!p) throw new Error("Project not found");
      const row: RenderRow = { id: nanoid(10), createdAt: new Date().toISOString(), ...r };
      p.renders = [row, ...p.renders];
      await write(p);
      return row;
    },
  };
}

let repo: Repo | undefined;
export function getRepo(): Repo {
  return (repo ??= process.env.DATABASE_URL ? postgresRepo(process.env.DATABASE_URL) : localRepo());
}

// ── Local file storage (renders, uploads) ──────────────────────────────────

export async function saveFile(folder: string, data: Buffer, ext: string) {
  const name = `${nanoid(12)}.${ext}`;
  const dir = path.join(DATA_DIR, "files", folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), data);
  return `/api/files/${folder}/${name}`;
}
