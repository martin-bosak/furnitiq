"use client";

import { ArrowUp, Bot, MapPin, MousePointer2, Sparkles, Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import { catalogItem } from "@/lib/scene/catalog";
import type { SceneOp } from "@/lib/scene/ops";
import { useEditor, type ChatMessage } from "@/store/editor";

const SUGGESTIONS = [
  "Make the living room feel cozier",
  "Add a reading corner at the pin",
  "Rotate the selected item to face the window",
  "Add a desk with a chair in the bedroom",
];

export function ChatPanel({ allioAvailable }: { allioAvailable: boolean }) {
  const messages = useEditor((s) => s.messages);
  const selection = useEditor((s) => s.selection);
  const pin = useEditor((s) => s.pin);
  const scene = useEditor((s) => s.scene);
  const provider = useEditor((s) => s.provider);
  const allioAgent = useEditor((s) => s.allioAgent);
  const { setProvider, setAllioAgent, select, setPin } = useEditor.getState();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const selLabel = (() => {
    if (!selection) return null;
    if (selection.kind === "furniture") {
      const f = scene.furniture.find((x) => x.id === selection.id);
      return f ? (f.name ?? catalogItem(f.type).label) : null;
    }
    if (selection.kind === "camera") return scene.cameras.find((c) => c.id === selection.id)?.name ?? null;
    return selection.kind[0].toUpperCase() + selection.kind.slice(1);
  })();

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const st = useEditor.getState();
    const history = st.messages.filter((m) => !m.pending && m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    st.pushMessage({ id: nanoid(), role: "user", content: message, context: { selection: selLabel ?? undefined, pin: st.pin ?? undefined } });
    const replyId = nanoid();
    st.pushMessage({ id: replyId, role: "assistant", content: "", pending: true });
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: st.scene, message, history, selection: st.selection, pin: st.pin, provider: st.provider, agent: st.allioAgent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      let result: { reply: string; ops: SceneOp[] } = data;
      if (data.taskId) {
        st.updateMessage(replyId, { content: `Sent to Allio agent${st.allioAgent ? ` **${st.allioAgent}**` : ""} · waiting…` });
        result = await pollAllio(data.taskId, (status) => st.updateMessage(replyId, { content: `Allio task ${status}…` }));
      }
      if (result.ops?.length) useEditor.getState().applyOps(result.ops);
      st.updateMessage(replyId, { content: result.reply, ops: result.ops, pending: false });
    } catch (e) {
      st.updateMessage(replyId, { content: `⚠ ${(e as Error).message}`, pending: false, role: "system" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-cyan-300/30 to-violet-400/30 text-cyan-100">
          <Sparkles size={15} />
        </div>
        <div className="flex-1 text-sm font-medium">Design assistant</div>
        <div className="flex rounded-full bg-white/5 p-0.5 text-[11px]">
          {(["openrouter", "allio"] as const).map((p) => (
            <button
              key={p}
              disabled={p === "allio" && !allioAvailable}
              title={p === "allio" && !allioAvailable ? "Set ALLIO_* env vars to enable" : undefined}
              onClick={() => setProvider(p)}
              className={`rounded-full px-2.5 py-1 transition disabled:opacity-30 ${provider === p ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`}
            >
              {p === "openrouter" ? "OpenRouter" : "Allio"}
            </button>
          ))}
        </div>
      </div>

      {provider === "allio" && (
        <div className="px-4 pb-2">
          <div className="relative">
            <Bot size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-white/40" />
            <input value={allioAgent} onChange={(e) => setAllioAgent(e.target.value)} placeholder="Agent (assignee), e.g. interior-designer" className="field !pl-8" />
          </div>
        </div>
      )}

      <div ref={listRef} className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 py-2">
        {!messages.length && (
          <div className="pt-6">
            <p className="mb-4 text-sm leading-relaxed text-white/45">
              Describe changes in plain words. Select an object or click the plan to pin a spot — it&apos;s sent along as context.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left text-[13px] text-white/65 transition hover:border-cyan-300/25 hover:bg-white/[0.06] hover:text-white">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
        </AnimatePresence>
      </div>

      <div className="p-3">
        <div className="glass rounded-[1.4rem] p-1.5">
          {(selLabel || pin) && (
            <div className="flex flex-wrap gap-1 px-1.5 pt-1 pb-1.5">
              {selLabel && (
                <Chip icon={<MousePointer2 size={11} />} onClear={() => select(null)}>
                  {selLabel}
                </Chip>
              )}
              {pin && (
                <Chip icon={<MapPin size={11} />} onClear={() => setPin(null)}>
                  {pin[0].toFixed(2)}, {pin[1].toFixed(2)}
                </Chip>
              )}
            </div>
          )}
          <div className="flex items-end gap-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Move the sofa under the window…"
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-white/30 [field-sizing:content]"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || busy}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-violet-400 text-[#07080c] transition hover:scale-105 disabled:opacity-25"
            >
              <ArrowUp size={17} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  const undo = useEditor((s) => s.undo);
  const mine = m.role === "user";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-[1.2rem] px-3.5 py-2.5 text-[13px] leading-relaxed ${
          mine ? "rounded-br-md bg-gradient-to-br from-cyan-300/20 to-violet-400/20 text-white" : m.role === "system" ? "bg-rose-500/10 text-rose-200" : "rounded-bl-md bg-white/[0.05] text-white/85"
        }`}
      >
        {m.pending && !m.content ? (
          <span className="flex gap-1 py-1">
            {[0, 1, 2].map((i) => (
              <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-white/60" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </span>
        ) : (
          <span className="whitespace-pre-wrap">{m.content.replace(/\*\*/g, "")}</span>
        )}
        {mine && (m.context?.selection || m.context?.pin) && (
          <div className="mt-1 flex gap-2 text-[10px] text-white/40">
            {m.context.selection && <span>↳ {m.context.selection}</span>}
            {m.context.pin && <span>◎ {m.context.pin.map((n) => n.toFixed(1)).join(", ")}</span>}
          </div>
        )}
        {!!m.ops?.length && (
          <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2 text-[11px] text-white/45">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_#6ee7b7]" />
            {m.ops.length} change{m.ops.length > 1 ? "s" : ""} applied
            <button onClick={undo} className="ml-auto flex items-center gap-1 text-white/55 hover:text-white">
              <Undo2 size={11} /> Undo
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Chip({ icon, children, onClear }: { icon: React.ReactNode; children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="flex h-6 items-center gap-1 rounded-full bg-violet-400/15 pr-1 pl-2 text-[11px] text-violet-100">
      {icon}
      {children}
      <button onClick={onClear} className="grid h-4 w-4 place-items-center rounded-full text-violet-200/70 hover:bg-white/10 hover:text-white">
        <X size={10} />
      </button>
    </span>
  );
}

async function pollAllio(taskId: string, onStatus: (s: string) => void) {
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`/api/chat/allio/${taskId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Allio poll failed");
    if (data.status === "done" && data.reply !== undefined) return { reply: data.reply as string, ops: (data.ops ?? []) as SceneOp[] };
    if (data.status === "missing") throw new Error("Allio task was deleted");
    onStatus(data.status.replace("_", " "));
  }
  throw new Error("Timed out waiting for the Allio agent");
}
