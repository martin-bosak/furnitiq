"use client";

import { Check, ChevronDown, CloudOff, Download, FilePlus2, Loader2, MessageSquare, Redo2, Trash2, Undo2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { sampleScene } from "@/lib/scene/sample";
import { parseScene, type Scene } from "@/lib/scene/schema";
import { useEditor, type Render } from "@/store/editor";
import { CameraPanel } from "./CameraPanel";
import { ChatPanel } from "./ChatPanel";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { PlanView } from "./PlanView";

type Status = { db: "postgres" | "local"; openrouter: boolean; allio: boolean; allioDefaultAgent: string; chatModel: string; imageModel: string };
type ProjectSummary = { id: string; name: string; updatedAt: string };

export function Studio() {
  const [status, setStatus] = useState<Status | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const { load } = useEditor.getState();

  const openProject = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) return false;
      const p = (await res.json()) as { id: string; scene: Scene; renders: Render[] };
      load(p.id, parseScene(p.scene), p.renders);
      history.replaceState(null, "", `?p=${p.id}`);
      try {
        localStorage.setItem("furnitiq:last", p.id);
      } catch {}
      return true;
    },
    [load],
  );

  const createProject = useCallback(
    async (scene?: Scene) => {
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene }) });
      const p = await res.json();
      await openProject(p.id);
    },
    [openProject],
  );

  // Boot: status + last project (guarded against StrictMode double-run)
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      fetch("/api/status")
        .then((r) => r.json())
        .then((s: Status) => {
          setStatus(s);
          if (s.allioDefaultAgent && !useEditor.getState().allioAgent) useEditor.getState().setAllioAgent(s.allioDefaultAgent);
        })
        .catch(() => {});
      let last: string | null = new URLSearchParams(location.search).get("p");
      try {
        last ??= localStorage.getItem("furnitiq:last");
      } catch {}
      if (last && (await openProject(last))) return;
      const list: ProjectSummary[] = await fetch("/api/projects").then((r) => (r.ok ? r.json() : []));
      if (list[0] && (await openProject(list[0].id))) return;
      await createProject();
    })().catch((e) => console.error("[furnitiq] boot failed", e));
  }, [openProject, createProject]);

  useAutosave();
  useShortcuts();

  return (
    <div className="relative z-10 flex h-dvh flex-col gap-3 p-3">
      <TopBar status={status} openProject={openProject} createProject={createProject} />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_380px]">
        <section className="glass relative min-h-[320px] rounded-[2rem] p-1.5">
          <PlanView />
          <Inspector />
          <Palette />
        </section>
        <section className="glass relative min-h-[320px] rounded-[2rem] p-1.5">
          <CameraPanel />
        </section>
        <aside className="glass-strong hidden min-h-0 rounded-[2rem] xl:block">
          <ChatPanel allioAvailable={!!status?.allio} />
        </aside>
      </main>

      {/* Chat drawer for narrower screens */}
      <button onClick={() => setChatOpen(true)} className="glass-strong fixed right-5 bottom-5 z-30 grid h-12 w-12 place-items-center rounded-full text-cyan-100 xl:hidden">
        <MessageSquare size={18} />
      </button>
      <AnimatePresence>
        {chatOpen && (
          <motion.aside
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="glass-strong fixed top-3 right-3 bottom-3 z-40 w-[min(380px,calc(100vw-24px))] rounded-[2rem] xl:hidden"
          >
            <button onClick={() => setChatOpen(false)} className="icon-btn absolute top-3 right-3 z-10">
              <X size={16} />
            </button>
            <ChatPanel allioAvailable={!!status?.allio} />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function TopBar({ status, openProject, createProject }: { status: Status | null; openProject: (id: string) => Promise<boolean>; createProject: (s?: Scene) => Promise<void> }) {
  const name = useEditor((s) => s.scene.name);
  const dirty = useEditor((s) => s.dirty);
  const saving = useEditor((s) => s.saving);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const projectId = useEditor((s) => s.projectId);
  const { undo, redo, commit } = useEditor.getState();
  const [menu, setMenu] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (menu) fetch("/api/projects").then((r) => r.json()).then(setProjects).catch(() => {});
  }, [menu]);

  const exportJson = () => {
    const scene = useEditor.getState().scene;
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${scene.name.replace(/\W+/g, "-").toLowerCase()}.furnitiq.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      await createProject(parseScene(JSON.parse(await file.text())));
    } catch (e) {
      alert(`Invalid scene file: ${(e as Error).message}`);
    }
  };

  return (
    <header className="glass relative z-30 flex h-14 shrink-0 items-center gap-2 rounded-full pr-2 pl-4">
      <div className="flex items-center gap-2.5">
        <div className="relative h-7 w-7">
          <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_200deg,#7cf0ff,#a78bfa,#ffb86b,#7cf0ff)] blur-[6px] opacity-70" />
          <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_200deg,#7cf0ff,#a78bfa,#ffb86b,#7cf0ff)]" />
          <div className="absolute inset-[5px] rounded-full bg-[#0b0d13]" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">furnitiq</span>
      </div>

      <div className="mx-2 h-5 w-px bg-white/10" />

      <div className="relative">
        <div className="flex items-center">
          <input
            key={projectId ?? "none"}
            defaultValue={name}
            onBlur={(e) => e.target.value !== name && commit((s) => ({ ...s, name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-48 rounded-full bg-transparent px-2 py-1 text-sm text-white/85 outline-none hover:bg-white/5 focus:bg-white/5"
          />
          <button onClick={() => setMenu((v) => !v)} className="icon-btn !h-8 !w-8">
            <ChevronDown size={15} />
          </button>
        </div>
        <AnimatePresence>
          {menu && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="glass-strong absolute top-12 left-0 w-72 rounded-3xl p-2" onMouseLeave={() => setMenu(false)}>
              <button className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={() => (setMenu(false), createProject(sampleScene()))}>
                <FilePlus2 size={15} /> New from sample
              </button>
              <button className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={() => (setMenu(false), createProject(parseScene({ name: "Empty project" })))}>
                <FilePlus2 size={15} /> New empty
              </button>
              <div className="my-1 h-px bg-white/5" />
              <div className="scroll-thin max-h-72 overflow-y-auto">
                {projects.map((p) => (
                  <div key={p.id} className={`group flex items-center rounded-2xl hover:bg-white/5 ${p.id === projectId ? "bg-white/5" : ""}`}>
                    <button className="min-w-0 flex-1 px-3 py-2 text-left" onClick={() => (setMenu(false), openProject(p.id))}>
                      <div className="truncate text-sm text-white/85">{p.name}</div>
                      <div className="text-[11px] text-white/35">{new Date(p.updatedAt).toLocaleString()}</div>
                    </button>
                    {p.id !== projectId && (
                      <button
                        className="icon-btn mr-1 opacity-0 group-hover:opacity-100 hover:!text-rose-300"
                        onClick={async () => {
                          await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
                          setProjects((l) => l.filter((x) => x.id !== p.id));
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-1.5 pl-1 text-[11px] text-white/40">
        {saving ? (
          <>
            <Loader2 size={12} className="animate-spin" /> Saving
          </>
        ) : dirty ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Unsaved
          </>
        ) : (
          <>
            <Check size={12} /> Saved
          </>
        )}
      </div>

      <div className="flex-1" />

      {status && (
        <div className="hidden items-center gap-1.5 md:flex">
          {status.db === "local" && (
            <span className="flex h-7 items-center gap-1.5 rounded-full bg-amber-300/10 px-2.5 text-[11px] text-amber-200/80" title="Set DATABASE_URL to use Postgres">
              <CloudOff size={12} /> Local storage
            </span>
          )}
          <span className={`flex h-7 items-center gap-1.5 rounded-full bg-white/5 px-2.5 text-[11px] ${status.openrouter ? "text-white/55" : "text-rose-200/80"}`} title={`Chat: ${status.chatModel}\nImage: ${status.imageModel}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.openrouter ? "bg-emerald-300 shadow-[0_0_6px_#6ee7b7]" : "bg-rose-400"}`} />
            {status.openrouter ? "AI ready" : "No OPENROUTER_API_KEY"}
          </span>
        </div>
      )}

      <div className="mx-1 h-5 w-px bg-white/10" />
      <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 size={16} />
      </button>
      <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        <Redo2 size={16} />
      </button>
      <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Import scene JSON">
        <Upload size={16} />
      </button>
      <button className="icon-btn" onClick={exportJson} title="Export scene JSON">
        <Download size={16} />
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
    </header>
  );
}

function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = async () => {
      const st = useEditor.getState();
      if (!st.projectId || !st.dirty) return;
      const scene = st.scene;
      st.setSaving(true);
      try {
        await fetch(`/api/projects/${st.projectId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene }) });
        // Only mark clean if nothing changed while saving.
        if (useEditor.getState().scene === scene) useEditor.getState().markSaved();
        else useEditor.getState().setSaving(false);
      } catch {
        useEditor.getState().setSaving(false);
      }
    };
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.scene !== prev.scene && s.dirty) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(save, 900);
      }
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const sel = st.selection;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        st.applyOps([{ op: "remove", id: sel.id }]);
        st.select(null);
      } else if (e.key === "Escape") {
        st.select(null);
        st.setPin(null);
      } else if (sel?.kind === "furniture") {
        const f = st.scene.furniture.find((x) => x.id === sel.id);
        if (!f) return;
        if (e.key.toLowerCase() === "r" && !mod) {
          st.applyOps([{ op: "update_furniture", id: f.id, patch: { rotation: (f.rotation + (e.shiftKey ? 270 : 90)) % 360 } }]);
        } else if (mod && e.key.toLowerCase() === "d") {
          e.preventDefault();
          st.applyOps([{ op: "add_furniture", type: f.type, name: f.name, position: [f.position[0] + 0.3, f.position[1] + 0.3], rotation: f.rotation, size: f.size, color: f.color, elevation: f.elevation }]);
        } else if (e.key.startsWith("Arrow") && !(document.activeElement as HTMLElement)?.closest("[tabindex]")) {
          e.preventDefault();
          const step = e.shiftKey ? 0.25 : 0.05;
          const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
          st.applyOps([{ op: "update_furniture", id: f.id, patch: { position: [f.position[0] + dx, f.position[1] + dy] } }]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
