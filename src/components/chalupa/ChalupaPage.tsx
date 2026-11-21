"use client";

import { ArrowLeft, Armchair, Box, Eye, Footprints, House, Layers, Moon, PencilRuler, RotateCcw, Tag, Trees } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FLOORS, ROOMS } from "./data";
import { EditBar } from "./EditBar";
import { useEdit } from "./editStore";
import { Minimap } from "./Minimap";
import { useChalupa, type View } from "./store";
import { walkToRoom } from "./walkPhysics";

const ChalupaScene = dynamic(() => import("./ChalupaScene").then((m) => m.ChalupaScene), { ssr: false });
const LoadingOverlay = dynamic(() => import("./ChalupaScene").then((m) => m.LoadingOverlay), { ssr: false });

const VIEWS: { id: View; name: string }[] = [{ id: 0, name: "Exteriér" }, ...FLOORS.map((f) => ({ id: f.id as View, name: f.name }))];

export function ChalupaPage() {
  const view = useChalupa((s) => s.view);
  const room = useChalupa((s) => s.room);
  const cut = useChalupa((s) => s.cut);
  const layers = useChalupa((s) => s.layers);
  const mode = useChalupa((s) => s.mode);
  const night = useChalupa((s) => s.night);
  const walkRoom = useChalupa((s) => s.walkRoom);
  const { setView, setRoom, setCut, toggle, resetCamera, setMode, setNight } = useChalupa.getState();
  const walk = mode === "walk";
  const [panel, setPanel] = useState(true);
  const rooms = walk ? ROOMS : ROOMS.filter((r) => view === 0 || r.floor === view);
  const active = room ? ROOMS.find((r) => r.id === room) : undefined;
  const edit = useEdit((s) => s.edit);

  // The saved furniture arrangement is shown to everyone, not only in edit mode.
  useEffect(() => {
    void useEdit.getState().load();
  }, []);

  return (
    <div className="relative z-10 flex h-dvh flex-col gap-3 p-3">
      <header className="glass relative z-30 flex h-14 shrink-0 items-center gap-2 rounded-full pr-2 pl-2">
        <Link href="/" className="icon-btn" title="Zpět do studia">
          <ArrowLeft size={17} />
        </Link>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[15px] font-semibold tracking-tight">Chalupa Brtníky 69</span>
          <span className="hidden text-[11px] text-white/45 xl:block">interaktivní model · furnitiq</span>
        </div>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                setMode("orbit");
                setView(v.id);
              }}
              className={`btn shrink-0 ${view === v.id && !walk ? "!border-[#7cf0ff]/50 !bg-[#7cf0ff]/15 !text-white" : ""}`}
            >
              {v.id === 0 && <House size={14} />}
              {v.name}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex shrink-0 rounded-full border border-white/10 bg-white/5 p-0.5" role="group" aria-label="Režim">
          <button
            onClick={() => setMode("orbit")}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition ${!walk ? "bg-[#7cf0ff]/15 text-white" : "text-white/60 hover:text-white"}`}
            aria-pressed={!walk}
            title="Model zvenku a v řezech"
          >
            <Box size={14} />
            <span className="max-lg:hidden">Model</span>
          </button>
          <button
            onClick={() => {
              useEdit.getState().setEdit(false);
              setMode("walk");
            }}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition ${walk ? "bg-[#7cf0ff]/15 text-white" : "text-white/60 hover:text-white"}`}
            aria-pressed={walk}
            title="Procházka v úrovni očí"
          >
            <Footprints size={14} />
            <span className="max-lg:hidden">Procházka</span>
          </button>
        </div>
        <button
          onClick={() => setNight(!night)}
          className={`btn shrink-0 ${night ? "!border-[#ffb86b]/60 !bg-[#ffb86b]/15 !text-white" : ""}`}
          aria-pressed={night}
          title="Večer: rozsvícené lampy"
        >
          <Moon size={14} />
          <span className="max-xl:hidden">Večer</span>
        </button>
        {!walk && (
        <button
          onClick={() => {
            useEdit.getState().setEdit(!edit);
            if (!edit && !layers.furniture) toggle("furniture");
          }}
          className={`btn shrink-0 ${edit ? "!border-[#ffb86b]/60 !bg-[#ffb86b]/15 !text-white" : ""}`}
          title="Přesouvání nábytku"
        >
          <PencilRuler size={14} />
          <span className="max-xl:hidden">{edit ? "Hotovo" : "Upravit"}</span>
        </button>
        )}
        <button onClick={() => setPanel((p) => !p)} className="icon-btn" title="Panel">
          <Layers size={17} />
        </button>
        <button
          onClick={() => {
            setMode("orbit");
            resetCamera();
          }}
          className="icon-btn"
          title="Výchozí pohled"
        >
          <RotateCcw size={16} />
        </button>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden rounded-[1.75rem] border border-white/10">
        <ChalupaScene />
        <LoadingOverlay />

        {panel && (
          <aside className="glass-strong absolute top-3 left-3 flex max-h-[calc(100%-1.5rem)] w-64 flex-col gap-3 overflow-y-auto rounded-3xl p-3 text-sm max-md:top-auto max-md:right-3 max-md:bottom-3 max-md:max-h-[45%] max-md:w-auto">
            <section>
              <h2 className="mb-1.5 px-1 text-[11px] font-medium tracking-wide text-white/45 uppercase">
                {walk ? "Přejít do místnosti" : view === 0 ? "Místnosti" : `Místnosti · ${FLOORS.find((f) => f.id === view)?.name}`}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {rooms.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => (walk ? walkToRoom(r.id) : setRoom(r.id === room ? null : r.id, r.floor))}
                      className={`flex w-full items-baseline gap-2 rounded-xl px-2 py-1.5 text-left transition ${
                        r.id === (walk ? walkRoom : room) ? "bg-[#7cf0ff]/15 text-white" : "text-white/80 hover:bg-white/5"
                      }`}
                    >
                      <span className="w-8 shrink-0 font-mono text-[11px] text-white/45">{r.id}</span>
                      <span className="truncate">{r.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {view !== 0 && !walk && (
              <section className="px-1">
                <label className="mb-1 flex items-center justify-between text-[11px] font-medium tracking-wide text-white/45 uppercase">
                  Výška řezu <span className="font-mono normal-case text-white/70">{cut.toFixed(1)} m</span>
                </label>
                <input type="range" min={0.9} max={2.6} step={0.1} value={cut} onChange={(e) => setCut(+e.target.value)} className="w-full accent-[#7cf0ff]" />
              </section>
            )}

            <section className="flex flex-wrap gap-1.5">
              <Toggle on={layers.furniture} onClick={() => toggle("furniture")} icon={<Armchair size={14} />} label="Nábytek" />
              {!walk && (
                <>
                  <Toggle on={layers.roof} onClick={() => toggle("roof")} icon={<House size={14} />} label="Střecha" disabled={view !== 0} />
                  <Toggle on={layers.site} onClick={() => toggle("site")} icon={<Trees size={14} />} label="Okolí" />
                  <Toggle on={layers.labels} onClick={() => toggle("labels")} icon={<Tag size={14} />} label="Popisky" disabled={view === 0} />
                  <Toggle on={layers.xray} onClick={() => toggle("xray")} icon={<Eye size={14} />} label="Odkrýt zdi" disabled={view === 0} />
                </>
              )}
            </section>
          </aside>
        )}

        {edit && <EditBar />}

        {walk && (
          <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-2">
            <Minimap />
          </div>
        )}

        {walk && (
          <div className="glass pointer-events-none absolute bottom-3 left-1/2 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-full px-4 py-2 text-center text-[11.5px] leading-snug text-white/70 max-md:hidden">
            W A S D / šipky: chůze · Shift: rychleji · tažením se rozhlížíte · klik na podlahu: dojdete tam · klik na dveře: otevřít · Esc: zpět na model
          </div>
        )}
        {walk && (
          <div className="glass pointer-events-none absolute bottom-3 left-1/2 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-full px-4 py-2 text-center text-[11.5px] text-white/70 md:hidden">
            tažením se rozhlížíte · klepnutím na podlahu dojdete tam · na dveře: otevřít
          </div>
        )}

        {active && !edit && !walk && (
          <div className="glass pointer-events-none absolute right-3 bottom-3 rounded-2xl px-4 py-2.5 max-md:hidden">
            <div className="font-mono text-[11px] text-white/50">{active.id}</div>
            <div className="text-[15px] font-semibold">{active.name}</div>
          </div>
        )}

        {!walk && (
          <div className="pointer-events-none absolute right-3 top-3 hidden text-right text-[11px] leading-relaxed text-white/40 md:block">
            {edit ? "klik: výběr · G posun · T otáčení · R 90° · Del smazat · Ctrl+Z zpět" : "tažení: otáčení · pravé tl.: posun · kolečko: zoom · klik na dveře: otevřít"}
          </div>
        )}
      </main>
    </div>
  );
}

function Toggle({ on, onClick, icon, label, disabled }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`btn !h-8 !px-2.5 !text-xs ${on && !disabled ? "!border-[#7cf0ff]/40 !bg-[#7cf0ff]/12 !text-white" : ""}`}>
      {icon}
      {label}
    </button>
  );
}
