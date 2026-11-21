"use client";

import { Check, CloudOff, Copy, Loader2, Move, Redo2, RotateCcw, RotateCw, Trash2, Undo2, Undo, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useEdit } from "./editStore";
import { deleteSelected, duplicateSelected, labelOf, resetAll, resetSelected, restoreItem, rotateSelected } from "./items";

/** Floating toolbar for edit mode: selected item actions, undo/redo, save state, deleted items. */
export function EditBar() {
  const selected = useEdit((s) => s.selected);
  const tool = useEdit((s) => s.tool);
  const status = useEdit((s) => s.status);
  const past = useEdit((s) => s.past.length);
  const future = useEdit((s) => s.future.length);
  const layout = useEdit((s) => s.layout);
  const { setTool, undo, redo, select, setEdit } = useEdit.getState();
  const [showDeleted, setShowDeleted] = useState(false);
  const deleted = Object.entries(layout.items).filter(([, v]) => v.deleted);
  const isCopy = !!selected && layout.added.some((a) => a.id === selected.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      } else if (e.key.toLowerCase() === "r" && !mod) {
        rotateSelected(e.shiftKey ? -90 : 90);
      } else if (e.key.toLowerCase() === "g" && !mod) {
        setTool("move");
      } else if (e.key.toLowerCase() === "t" && !mod) {
        setTool("rotate");
      } else if (e.key === "Escape") {
        if (selected) select(null);
        else setEdit(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, undo, redo, select, setEdit, setTool]);

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-center gap-2">
      {showDeleted && deleted.length > 0 && (
        <div className="glass-strong pointer-events-auto max-h-48 w-72 overflow-y-auto rounded-2xl p-2 text-sm">
          <div className="mb-1 px-1 text-[11px] font-medium tracking-wide text-white/45 uppercase">Smazané kusy</div>
          {deleted.map(([id]) => (
            <button key={id} onClick={() => restoreItem(id)} className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-white/80 hover:bg-white/5">
              <span className="truncate">{labelOf(id)}</span>
              <span className="text-[11px] text-[#7cf0ff]">obnovit</span>
            </button>
          ))}
        </div>
      )}

      <div className="glass-strong pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full px-2 py-1.5">
        {selected ? (
          <>
            <div className="flex min-w-0 flex-col px-2 leading-tight">
              <span className="max-w-40 truncate text-[13px] font-semibold">{selected.label}</span>
              <span className="font-mono text-[10px] text-white/45">{selected.room}</span>
            </div>
            <Seg on={tool === "move"} onClick={() => setTool("move")} title="Posunout (G)">
              <Move size={15} /> Posunout
            </Seg>
            <Seg on={tool === "rotate"} onClick={() => setTool("rotate")} title="Otočit (T)">
              <RotateCw size={15} /> Otočit
            </Seg>
            <button className="icon-btn" title="Otočit o 90° (R)" onClick={() => rotateSelected(90)}>
              <span className="text-[11px] font-semibold">90°</span>
            </button>
            <button className="icon-btn" title="Duplikovat (Ctrl+D)" onClick={duplicateSelected}>
              <Copy size={15} />
            </button>
            {!isCopy && (
              <button className="icon-btn" title="Vrátit na původní místo" onClick={resetSelected}>
                <Undo size={15} />
              </button>
            )}
            <button className="icon-btn hover:!text-red-300" title="Smazat (Del)" onClick={deleteSelected}>
              <Trash2 size={15} />
            </button>
            <button className="icon-btn" title="Zrušit výběr (Esc)" onClick={() => select(null)}>
              <X size={15} />
            </button>
          </>
        ) : (
          <span className="px-3 text-[13px] text-white/70">Klikni na kus nábytku</span>
        )}
        <div className="mx-1 h-5 w-px bg-white/10" />
        <button className="icon-btn" title="Zpět (Ctrl+Z)" onClick={undo} disabled={!past}>
          <Undo2 size={15} />
        </button>
        <button className="icon-btn" title="Znovu (Ctrl+Shift+Z)" onClick={redo} disabled={!future}>
          <Redo2 size={15} />
        </button>
        {deleted.length > 0 && (
          <button className="btn !h-8 !px-2.5 !text-xs" onClick={() => setShowDeleted((v) => !v)}>
            Smazané ({deleted.length})
          </button>
        )}
        <button
          className="icon-btn"
          title="Vrátit vše do původního stavu"
          onClick={() => {
            if (window.confirm("Vrátit celé rozmístění nábytku do původního stavu?")) resetAll();
          }}
        >
          <RotateCcw size={15} />
        </button>
        <SaveState status={status} />
      </div>
    </div>
  );
}

function Seg({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className={`btn !h-8 !px-2.5 !text-xs ${on ? "!border-[#7cf0ff]/50 !bg-[#7cf0ff]/15 !text-white" : ""}`}>
      {children}
    </button>
  );
}

function SaveState({ status }: { status: string }) {
  if (status === "saving" || status === "loading")
    return (
      <span className="flex items-center gap-1 px-2 text-[11px] text-white/55">
        <Loader2 size={13} className="animate-spin" /> ukládám
      </span>
    );
  if (status === "error")
    return (
      <span className="flex items-center gap-1 px-2 text-[11px] text-red-300">
        <CloudOff size={13} /> neuloženo
      </span>
    );
  if (status === "conflict") return <span className="px-2 text-[11px] text-amber-300">načteny novější změny</span>;
  if (status === "saved")
    return (
      <span className="flex items-center gap-1 px-2 text-[11px] text-white/55">
        <Check size={13} /> uloženo
      </span>
    );
  return null;
}
