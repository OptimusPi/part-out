import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoxSelect, Crosshair, Download, RotateCcw, Spline, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { exportPartedGltf } from "@/lib/workshop/exportGltf";
import { GARAGE, isUsefulName } from "@/lib/workshop/garage";
import { loadGlbFromBuffer } from "@/lib/workshop/loadGlb";
import { previewExtract, useStore } from "@/lib/workshop/store";
import { PART_META, PART_ORDER, type PartKind } from "@/lib/workshop/types";

async function ingestFile(file: File) {
  if (!/\.(glb|gltf)$/i.test(file.name)) {
    toast.error("Drop a .glb or .gltf");
    return;
  }
  const buf = await file.arrayBuffer();
  try {
    const scene = await loadGlbFromBuffer(buf);
    useStore.getState().loadObject(scene, file.name, null);
  } catch {
    toast.error("Couldn't parse that GLB");
  }
}

export function DropOverlay() {
  const [over, setOver] = useState(false);

  useEffect(() => {
    const onDrag = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes("Files")) setOver(true);
    };
    const onLeave = (e: DragEvent) => {
      e.preventDefault();
      if (!e.relatedTarget) setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void ingestFile(file);
    };
    window.addEventListener("dragover", onDrag);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDrag);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  if (!over) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center border-2 border-dashed border-accent bg-bg/80">
      <div className="text-center">
        <p className="font-display text-lg tracking-wide">Drop GLB</p>
        <p className="mt-1 text-sm text-muted">Scaled to the bench and centered</p>
      </div>
    </div>
  );
}

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const s = useStore.getState();
      if (e.key === " ") {
        e.preventDefault();
        s.setTool(s.tool === "place" ? "orbit" : "place");
      }
      if (e.key === "Enter") {
        const r = s.commitPart();
        if (r === "empty") toast.message("Empty cut — raise depth or switch to mesh claim");
        if (r === "need-mesh") toast.message("Click a mesh first");
        if (r === "need-dots") toast.message("Place corner dots first");
      }
      if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        s.undoDot();
      }
      if (e.key === "Backspace" || e.key === "Escape") s.clearDots();
      if (e.key === "e" || e.key === "E") s.setExplode(s.explode > 0.05 ? 0 : 1.15);
      if (e.key === "m" || e.key === "M") s.setAutoMirror(!s.autoMirror);
      if (e.key === "v" || e.key === "V") s.setPickMode(s.pickMode === "verts" ? "mesh" : "verts");
      if (e.key === "c" || e.key === "C") {
        const n = s.claimNamed();
        if (n < 1) toast.message("No named parts on this model");
        else toast.message(`Claimed ${n} named parts`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function PreviewLine() {
  const dots = useStore((s) => s.dots);
  const selected = useStore((s) => s.selectedMeshUuid);
  const depth = useStore((s) => s.depth);
  const grow = useStore((s) => s.grow);
  const kind = useStore((s) => s.activeKind);
  const pickMode = useStore((s) => s.pickMode);
  const mirror = useStore((s) => s.autoMirror);
  const n = useMemo(
    () => previewExtract(),
    [dots, selected, depth, grow, kind, pickMode, mirror],
  );
  if (n < 1) return null;
  return <p className="font-mono text-xs text-accent">Would claim {n} faces</p>;
}

export function Hud() {
  useHotkeys();
  const fileRef = useRef<HTMLInputElement>(null);
  const loadDemo = useStore((s) => s.loadDemo);
  const loadGarage = useStore((s) => s.loadGarage);
  const garageId = useStore((s) => s.garageId);
  const loading = useStore((s) => s.loading);
  const loadError = useStore((s) => s.loadError);
  const meshList = useStore((s) => s.meshList);
  const tool = useStore((s) => s.tool);
  const pickMode = useStore((s) => s.pickMode);
  const activeKind = useStore((s) => s.activeKind);
  const setKind = useStore((s) => s.setKind);
  const setTool = useStore((s) => s.setTool);
  const setPickMode = useStore((s) => s.setPickMode);
  const depth = useStore((s) => s.depth);
  const grow = useStore((s) => s.grow);
  const explode = useStore((s) => s.explode);
  const autoMirror = useStore((s) => s.autoMirror);
  const lrAxis = useStore((s) => s.lrAxis);
  const showVerts = useStore((s) => s.showVerts);
  const showWire = useStore((s) => s.showWire);
  const showVolume = useStore((s) => s.showVolume);
  const stats = useStore((s) => s.stats);
  const sourceName = useStore((s) => s.sourceName);
  const leftoverFaces = useStore((s) => s.leftoverFaces);
  const dots = useStore((s) => s.dots);
  const selectedMeshUuid = useStore((s) => s.selectedMeshUuid);
  const selectedMeshName = useStore((s) => s.selectedMeshName);
  const parts = useStore((s) => s.parts);
  const notice = useStore((s) => s.notice);
  const commitPart = useStore((s) => s.commitPart);
  const claimNamed = useStore((s) => s.claimNamed);
  const pickMesh = useStore((s) => s.pickMesh);
  const undoDot = useStore((s) => s.undoDot);
  const clearDots = useStore((s) => s.clearDots);
  const removePart = useStore((s) => s.removePart);
  const clearParts = useStore((s) => s.clearParts);
  const [partsOpen, setPartsOpen] = useState(false);

  const meta = PART_META[activeKind];
  const needed = meta.dotsNeeded;
  const canCut =
    pickMode === "mesh" ? Boolean(selectedMeshName) : dots.length >= Math.min(2, needed);
  const namedCount = meshList.filter((m) => m.kind || isUsefulName(m.name)).length;
  const garageHint = GARAGE.find((c) => c.id === garageId)?.hint;

  const onCut = useCallback(() => {
    const r = commitPart();
    if (r === "empty") toast.message("Empty cut — raise depth or switch to mesh claim");
    if (r === "need-mesh") toast.message("Click a mesh first");
    if (r === "need-dots") toast.message("Place corner dots first");
  }, [commitPart]);

  const onClaimNamed = useCallback(() => {
    const n = claimNamed();
    if (n < 1) toast.message("No named parts on this model");
    else toast.message(`Claimed ${n} named parts`);
  }, [claimNamed]);

  useEffect(() => {
    if (loadError) toast.error(loadError);
  }, [loadError]);

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto">
            <p className="font-display text-xs font-medium tracking-[0.22em] text-fg">PART-OUT</p>
            <p className="text-xs text-muted">Drop a GLB · claim meshes · snap verts</p>
          </div>
          <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" />
              Open
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void ingestFile(f);
              }}
            />
            <button
              type="button"
              className={garageId === "demo" ? "btn-solid" : "btn-ghost"}
              onClick={loadDemo}
            >
              Boxes
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={parts.length === 0}
              onClick={() => void exportPartedGltf()}
            >
              <Download className="size-3.5" />
              Export
            </button>
          </div>
        </div>
        <div className="pointer-events-auto mt-3 flex max-w-full gap-1 overflow-x-auto pb-1">
          {GARAGE.map((car) => (
            <button
              key={car.id}
              type="button"
              className={cn("chip", garageId === car.id && "chip-on")}
              onClick={() => loadGarage(car.id)}
              disabled={loading}
            >
              {car.label}
              {car.fused ? <span className="font-mono text-[9px] tracking-wider text-muted">1</span> : null}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <p className="rounded-full border border-border bg-surface/90 px-4 py-2 font-mono text-xs text-muted">
            Loading GLB
          </p>
        </div>
      ) : null}

      <aside className="panel-left pointer-events-auto absolute top-28 bottom-16 left-3 z-20 hidden w-60 overflow-auto rounded-xl border border-border bg-surface/90 p-3 sm:block">
        <p className="label">Slice as</p>
        <p className="mb-3 text-xs leading-snug text-muted">{meta.hint}</p>
        <div className="flex flex-col gap-0.5">
          {PART_ORDER.map((k) => {
            const m = PART_META[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k as PartKind)}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm",
                  activeKind === k ? "bg-bg-subtle text-fg" : "text-muted hover:text-fg",
                )}
              >
                <span className="size-1.5 rounded-full" style={{ background: m.color }} />
                <span className="flex-1 truncate">{m.label}</span>
                {m.mirror ? <span className="font-mono text-[10px] tracking-wider text-accent">LR</span> : null}
              </button>
            );
          })}
        </div>
      </aside>

      <aside className="panel-right pointer-events-auto absolute top-28 bottom-16 right-3 z-20 hidden w-64 overflow-auto rounded-xl border border-border bg-surface/90 p-3 sm:block">
        <p className="label">Bench</p>
        <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2">
          <Stat label="File" value={sourceName} />
          <Stat label="Meshes" value={String(stats.meshes)} />
          <Stat label="Faces" value={String(stats.faces)} />
          <Stat label="Body left" value={String(leftoverFaces)} />
        </dl>
        {garageHint ? <p className="mb-3 text-xs leading-snug text-muted">{garageHint}</p> : null}

        <div className="mb-3 flex gap-2">
          <button type="button" className={tool === "place" ? "btn-solid" : "btn-ghost"} onClick={() => setTool("place")}>
            <Crosshair className="size-3.5" />
            Place
          </button>
          <button type="button" className={tool === "orbit" ? "btn-solid" : "btn-ghost"} onClick={() => setTool("orbit")}>
            Spin
          </button>
        </div>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            className={pickMode === "mesh" ? "btn-solid" : "btn-ghost"}
            onClick={() => setPickMode("mesh")}
          >
            <BoxSelect className="size-3.5" />
            Mesh
          </button>
          <button
            type="button"
            className={pickMode === "verts" ? "btn-solid" : "btn-ghost"}
            onClick={() => setPickMode("verts")}
          >
            <Spline className="size-3.5" />
            Verts
          </button>
        </div>

        <Slider label="Cut depth" value={depth} min={0.04} max={1.4} step={0.01} onChange={useStore.getState().setDepth} />
        <Slider label="Grow" value={grow} min={0} max={0.6} step={0.01} onChange={useStore.getState().setGrow} />
        <Slider label="Explode" value={explode} min={0} max={2.2} step={0.01} onChange={useStore.getState().setExplode} />

        <label className="check">
          <input type="checkbox" checked={autoMirror} onChange={(e) => useStore.getState().setAutoMirror(e.target.checked)} />
          Mirror L/R on sided parts
        </label>
        <label className="check">
          L/R axis
          <select
            className="ml-auto rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg"
            value={lrAxis}
            onChange={(e) => useStore.getState().setLrAxis(e.target.value as "x" | "z")}
          >
            <option value="x">X width</option>
            <option value="z">Z width</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={showVerts} onChange={(e) => useStore.getState().setShowVerts(e.target.checked)} />
          Vertex cloud
        </label>
        <label className="check">
          <input type="checkbox" checked={showWire} onChange={(e) => useStore.getState().setShowWire(e.target.checked)} />
          Wireframe
        </label>
        <label className="check">
          <input type="checkbox" checked={showVolume} onChange={(e) => useStore.getState().setShowVolume(e.target.checked)} />
          Slice volume
        </label>

        <p className="mt-3 font-mono text-xs text-accent">
          {pickMode === "mesh"
            ? selectedMeshName
              ? `Mesh · ${selectedMeshName}`
              : "Click a named mesh"
            : `Dots ${dots.length} / ${needed}`}
        </p>
        <PreviewLine />
        {notice ? <p className="mt-1 text-xs text-muted">{notice}</p> : null}

        <div className="mt-2 flex gap-2">
          <button type="button" className="btn-ghost" onClick={undoDot} disabled={!dots.length}>
            Undo
          </button>
          <button type="button" className="btn-ghost" onClick={clearDots} disabled={!dots.length && !selectedMeshName}>
            Clear
          </button>
        </div>
        <button type="button" className="btn-primary mt-2 w-full" disabled={!canCut} onClick={onCut}>
          Cut {meta.label}
        </button>
        <button
          type="button"
          className="btn-ghost mt-2 w-full"
          disabled={namedCount < 1 || loading}
          onClick={onClaimNamed}
        >
          Claim named
        </button>

        <p className="label mt-5">Meshes</p>
        {meshList.length === 0 ? (
          <p className="text-xs text-muted">Load a car to inspect meshes.</p>
        ) : (
          <ul className="mt-1">
            {meshList.map((m) => (
              <li key={m.uuid}>
                <button
                  type="button"
                  onClick={() => pickMesh(m.uuid, m.name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                    selectedMeshUuid === m.uuid ? "bg-bg-subtle text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-mono">{m.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-accent">
                    {m.kind ? PART_META[m.kind].label : m.faces}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="label mt-5">Parts</p>
        {parts.length === 0 ? (
          <p className="text-xs text-muted">Nothing claimed yet.</p>
        ) : (
          <ul className="mt-1">
            {parts.map((p) => (
              <li key={p.id} className="flex items-center gap-2 border-b border-border py-2 text-sm">
                <span className="size-1.5 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.label}{p.mirrored ? " ±L/R" : ""}</span>
                  <span className="font-mono text-[10px] text-muted">{p.faceCount} faces</span>
                </span>
                <button type="button" className="text-muted hover:text-fg" onClick={() => removePart(p.id)} aria-label="Remove">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {parts.length > 0 && (
          <button type="button" className="btn-ghost mt-2" onClick={clearParts}>
            <RotateCcw className="size-3.5" />
            Reset parts
          </button>
        )}
      </aside>

      <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 sm:hidden">
        <div className="rounded-xl border border-border bg-surface/95 p-3">
          <div className="mb-2 flex gap-1 overflow-x-auto">
            {GARAGE.map((car) => (
              <button
                key={car.id}
                type="button"
                className={cn("chip", garageId === car.id && "chip-on")}
                onClick={() => loadGarage(car.id)}
                disabled={loading}
              >
                {car.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={pickMode === "mesh" ? "btn-solid" : "btn-ghost"} onClick={() => setPickMode("mesh")}>
              Mesh
            </button>
            <button type="button" className={pickMode === "verts" ? "btn-solid" : "btn-ghost"} onClick={() => setPickMode("verts")}>
              Verts
            </button>
            <button type="button" className="btn-ghost" disabled={namedCount < 1} onClick={onClaimNamed}>
              Named
            </button>
            <button type="button" className="btn-primary ml-auto" disabled={!canCut} onClick={onCut}>
              Cut
            </button>
          </div>
          <p className="mt-2 truncate font-mono text-xs text-accent">
            {meta.label}
            {pickMode === "mesh"
              ? selectedMeshName
                ? ` · ${selectedMeshName}`
                : " · tap a panel"
              : ` · ${dots.length}/${needed} dots`}
          </p>
          <button type="button" className="mt-2 text-xs text-muted" onClick={() => setPartsOpen((v) => !v)}>
            {partsOpen ? "Hide parts list" : "Parts & settings"}
          </button>
          {partsOpen && (
            <div className="mt-2 max-h-48 overflow-auto">
              {PART_ORDER.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={cn("block w-full rounded-md px-2 py-2 text-left text-sm", activeKind === k && "bg-bg-subtle")}
                  onClick={() => setKind(k)}
                >
                  {PART_META[k].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 text-center text-[11px] text-muted sm:block">
        Garage loads a GLB · click a mesh or C claims named · Enter cuts · Space place/spin · E explode · V
        mesh/verts
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="truncate font-mono text-xs text-fg" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="mb-3 block">
      <span className="flex justify-between text-xs text-muted">
        {label}
        <span className="font-mono text-fg">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        className="mt-1 w-full accent-accent"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
