"use client";

import { Camera, Check, Home, ImagePlus, Link2, Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { LibraryAsset } from "@/lib/library/types";
import { CATALOG, CATALOG_KEYS, type CatalogKey } from "@/lib/scene/catalog";
import { useEditor } from "@/store/editor";
import { useLibrary } from "@/store/library";

type Mode = "photo" | "link" | "room";

type ScanReply = { items: { name: string; quality: string; sceneIds: string[]; assetId: string; note?: string }[]; skipped: { name: string; reason: string }[] };

/** Create a My-library asset from photos or a product link; generation runs on the local GPU. */
export function LibraryDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (a: LibraryAsset) => void }) {
  const [mode, setMode] = useState<Mode>("photo");
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [found, setFound] = useState<{ images: string[]; name?: string } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CatalogKey>("armchair");
  const [cm, setCm] = useState<[string, string, string]>(() => CATALOG.armchair.size.map((v) => String(Math.round(v * 100))) as [string, string, string]);
  const [sizeTouched, setSizeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generator, setGenerator] = useState<{ ok: boolean; gpu?: string } | null>(null);
  const [roomFiles, setRoomFiles] = useState<File[]>([]);
  const [scan, setScan] = useState<ScanReply | null>(null);
  const roomRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => setGenerator(s.generator ?? { ok: false }))
      .catch(() => setGenerator({ ok: false }));
  }, []);

  // Category sets a sensible default size until the user types one.
  const pickCategory = (k: CatalogKey) => {
    setCategory(k);
    if (!sizeTouched) setCm(CATALOG[k].size.map((v) => String(Math.round(v * 100))) as [string, string, string]);
  };

  const addFiles = (list: FileList | File[]) => setFiles((f) => [...f, ...[...list].filter((x) => x.type.startsWith("image/"))].slice(0, 4));

  const fetchLink = async () => {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/library/from-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFound(data);
      setPicked(data.images.slice(0, 1)); // the first picked image drives the shape
      if (data.name) setName(data.name);
      if (data.size) {
        setCm(data.size.map((v: number) => String(Math.round(v * 100))) as [string, string, string]);
        setSizeTouched(true);
      }
      if (!data.images.length) setError("No product images found on that page; switch to Photos and upload some.");
    } catch (e) {
      setError(`Couldn't read that page: ${(e as Error).message}`);
    } finally {
      setFetching(false);
    }
  };

  const scanRoom = async () => {
    const st = useEditor.getState();
    const form = new FormData();
    roomFiles.forEach((f) => form.append("photos", f));
    form.set("scene", JSON.stringify(st.scene));
    if (st.projectId) form.set("projectId", st.projectId);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/library/scan", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const reply = data as ScanReply;
      // Link the plan items to their new library models (one undoable step).
      const ops = reply.items.flatMap((it) => it.sceneIds.map((id) => ({ op: "update_furniture" as const, id, patch: { assetId: it.assetId } })));
      if (ops.length) useEditor.getState().applyOps(ops);
      setScan(reply);
      void useLibrary.getState().refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const size = cm.map((v) => parseFloat(v.replace(",", ".")) / 100);
    if (size.some((v) => !(v > 0.02))) return setError("Enter width, depth and height in cm");
    const form = new FormData();
    form.set("name", name.trim() || CATALOG[category].label);
    form.set("category", category);
    form.set("size", JSON.stringify(size));
    if (mode === "photo") files.forEach((f) => form.append("photos", f));
    else {
      form.set("imageUrls", JSON.stringify(picked));
      form.set("sourceUrl", url);
      form.set("sourceKind", "url");
    }
    const projectId = useEditor.getState().projectId;
    if (projectId) form.set("projectId", projectId);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/library", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated(data);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const canSubmit = !busy && (mode === "photo" ? files.length > 0 : picked.length > 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-md" onPointerDown={onClose}>
      <motion.div
        initial={{ scale: 0.97, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-strong scroll-thin max-h-[90vh] w-[min(560px,100%)] overflow-y-auto rounded-[1.8rem] p-5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="flex-1">
            <div className="text-base font-medium">New furniture for My library</div>
            <div className="text-xs text-white/45">A detailed, textured 3D model is generated on your GPU and saved for all projects.</div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {generator && !generator.ok && (
          <div className="mb-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
            The local generator isn&apos;t running. You can still add items; they wait in the queue until you start it in WSL:
            <code className="mt-1 block font-mono text-[11px] text-amber-50/80">bash /mnt/c/Projects/furnitiq/gen/run_wsl.sh</code>
          </div>
        )}

        <div className="mb-4 flex rounded-full bg-white/5 p-1 text-sm">
          {(
            [
              ["photo", "Photos", Camera],
              ["link", "Product link", Link2],
              ["room", "Room photos", Home],
            ] as const
          ).map(([m, label, Icon]) => (
            <button key={m} onClick={() => setMode(m)} className={`flex flex-1 items-center justify-center gap-2 rounded-full py-1.5 transition ${mode === m ? "bg-white/15 text-white" : "text-white/55 hover:text-white"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {mode === "room" ? (
          <RoomScan
            files={roomFiles}
            setFiles={setRoomFiles}
            inputRef={roomRef}
            busy={busy}
            scan={scan}
            onScan={scanRoom}
            onDone={onClose}
          />
        ) : mode === "photo" ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            className="mb-4 rounded-3xl border border-dashed border-white/15 p-3"
          >
            <div className="grid grid-cols-4 gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white/80">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {files.length < 4 && (
                <button onClick={() => fileRef.current?.click()} className="grid aspect-square place-items-center rounded-2xl bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white">
                  <span className="flex flex-col items-center gap-1 text-[11px]">
                    <ImagePlus size={18} /> Add photo
                  </span>
                </button>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-white/40">
              1–4 photos of one piece. Best: the whole item, front or 3/4 view, little clutter. Drop files here or click Add.
            </p>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          </div>
        ) : (
          <div className="mb-4">
            <div className="flex gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url && fetchLink()} placeholder="https://www.ikea.com/…" className="field !h-9" />
              <button onClick={fetchLink} disabled={!url || fetching} className="btn shrink-0">
                {fetching ? <Loader2 size={14} className="animate-spin" /> : "Read page"}
              </button>
            </div>
            {found && found.images.length > 0 && (
              <>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {found.images.map((src) => {
                    const on = picked.includes(src);
                    return (
                      <button
                        key={src}
                        onClick={() => setPicked((p) => (on ? p.filter((x) => x !== src) : [...p, src].slice(0, 4)))}
                        className={`relative aspect-square overflow-hidden rounded-2xl border-2 bg-white transition ${on ? "border-cyan-300" : "border-transparent opacity-60 hover:opacity-100"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
                        {on && (
                          <span className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-cyan-300 text-[#07080c]">
                            <Check size={12} strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-white/40">Pick up to 4 images of the item itself. The first one shapes the model, so choose a clean studio shot. Models are for your personal use.</p>
              </>
            )}
          </div>
        )}

        {mode !== "room" && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-white/45">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={CATALOG[category].label} className="field" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-white/45">Type</span>
            <select value={category} onChange={(e) => pickCategory(e.target.value as CatalogKey)} className="field">
              {CATALOG_KEYS.map((k) => (
                <option key={k} value={k} className="bg-[#14161d]">
                  {CATALOG[k].label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-white/45">Size (cm)</span>
            {(["width", "depth", "height"] as const).map((label, i) => (
              <label key={label} className="relative flex-1">
                <input
                  value={cm[i]}
                  onChange={(e) => {
                    setSizeTouched(true);
                    setCm((c) => c.map((v, j) => (j === i ? e.target.value : v)) as [string, string, string]);
                  }}
                  inputMode="decimal"
                  className="field !pr-12 font-mono"
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-white/35">{label}</span>
              </label>
            ))}
          </div>
          <p className="pl-22 text-[11px] text-white/35">Real measurements give the best result; the model is scaled to them.</p>
        </div>
        )}

        {error && <div className="mt-3 rounded-2xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>}

        {mode !== "room" && (
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex h-9 items-center gap-2 rounded-full bg-gradient-to-br from-cyan-300 to-violet-400 px-4 text-sm font-medium text-[#07080c] transition hover:scale-[1.02] disabled:opacity-30"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Generate 3D model
          </button>
        </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function RoomScan({
  files,
  setFiles,
  inputRef,
  busy,
  scan,
  onScan,
  onDone,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  busy: boolean;
  scan: ScanReply | null;
  onScan: () => void;
  onDone: () => void;
}) {
  if (scan)
    return (
      <div>
        <div className="mb-2 text-sm text-white/85">
          Found {scan.items.length} piece{scan.items.length === 1 ? "" : "s"}; they are being generated one by one in My library.
        </div>
        <div className="scroll-thin max-h-72 space-y-1 overflow-y-auto">
          {scan.items.map((it) => (
            <div key={it.assetId} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-1.5 text-xs">
              <span className={`h-2 w-2 rounded-full ${it.quality === "good" ? "bg-emerald-300" : it.quality === "partial" ? "bg-amber-300" : "bg-rose-400"}`} />
              <span className="flex-1 truncate text-white/80">{it.name}</span>
              <span className="text-white/40">{it.sceneIds.length ? `${it.sceneIds.length} in plan` : "not in plan"}</span>
            </div>
          ))}
          {scan.skipped.map((s, i) => (
            <div key={i} className="px-3 text-[11px] text-white/35">
              Skipped {s.name}: {s.reason}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-white/45">
          Amber/red items were partly hidden in the photos. If a model comes out rough, take one clear photo of that piece and use Retry with the Photos tab.
        </p>
        <div className="mt-4 flex justify-end">
          <button className="btn" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setFiles([...files, ...[...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))].slice(0, 30));
        }}
        className="rounded-3xl border border-dashed border-white/15 p-4 text-center"
      >
        <div className="text-sm text-white/80">{files.length ? `${files.length} room photo${files.length === 1 ? "" : "s"} selected` : "Drop room photos here"}</div>
        <p className="mt-1 text-[11px] leading-relaxed text-white/40">
          Claude (your local Claude Code) finds each furniture piece, matches it to the plan, groups identical pieces and picks the clearest view. Up to 30 photos.
        </p>
        <button className="btn mx-auto mt-3" onClick={() => inputRef.current?.click()}>
          <ImagePlus size={14} /> Choose photos
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && setFiles([...files, ...e.target.files].slice(0, 30))} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
        <button
          onClick={onScan}
          disabled={!files.length || busy}
          className="flex h-9 items-center gap-2 rounded-full bg-gradient-to-br from-cyan-300 to-violet-400 px-4 text-sm font-medium text-[#07080c] transition hover:scale-[1.02] disabled:opacity-30"
        >
          {busy && <Loader2 size={14} className="animate-spin" />} {busy ? "Looking at the photos… (a few minutes)" : "Find furniture & generate"}
        </button>
      </div>
    </div>
  );
}
