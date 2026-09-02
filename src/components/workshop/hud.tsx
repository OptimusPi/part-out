import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { exportPartedGltf } from "@/lib/workshop/exportGltf";
import { GARAGE, isUsefulName } from "@/lib/workshop/garage";
import { loadGlbFromBuffer } from "@/lib/workshop/loadGlb";
import { previewExtract, useStore } from "@/lib/workshop/store";
import { PART_META, type PartKind } from "@/lib/workshop/types";

const GROUPS: { label: string; kinds: PartKind[] }[] = [
  { label: "Body", kinds: ["hood", "trunk", "front_bumper", "rear_bumper", "grille"] },
  { label: "Doors", kinds: ["driver_door", "passenger_door", "driver_rear_door", "passenger_rear_door"] },
  { label: "Glass", kinds: ["windshield", "rear_window", "side_window_driver", "side_window_passenger"] },
  { label: "Wheels", kinds: ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"] },
  { label: "Trim", kinds: ["mirror_driver", "mirror_passenger", "custom"] },
];

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
      <p className="font-display text-lg tracking-wide">Drop GLB</p>
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
        if (r === "empty") toast.message("Empty cut — raise depth or grow");
        if (r === "need-mesh") toast.message("Click a mesh first");
        if (r === "need-dots") toast.message("Place corner dots first");
      }
      if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        s.undo();
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

export function Hud() {
  useHotkeys();
  const fileRef = useRef<HTMLInputElement>(null);
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
  const explode = useStore((s) => s.explode);
  const autoMirror = useStore((s) => s.autoMirror);
  const stats = useStore((s) => s.stats);
  const leftoverFaces = useStore((s) => s.leftoverFaces);
  const dots = useStore((s) => s.dots);
  const selectedMeshName = useStore((s) => s.selectedMeshName);
  const parts = useStore((s) => s.parts);
  const notice = useStore((s) => s.notice);
  const commitPart = useStore((s) => s.commitPart);
  const claimNamed = useStore((s) => s.claimNamed);
  const suggestDoor = useStore((s) => s.suggestDoor);
  const undo = useStore((s) => s.undo);
  const clearDots = useStore((s) => s.clearDots);
  const removePart = useStore((s) => s.removePart);
  const clearParts = useStore((s) => s.clearParts);
  const [sheet, setSheet] = useState<"parts" | "meshes" | null>(null);

  const meta = PART_META[activeKind];
  const needed = meta.dotsNeeded;
  const canCut =
    pickMode === "mesh" ? Boolean(selectedMeshName) : dots.length >= Math.min(2, needed);
  const namedCount = meshList.filter((m) => m.kind || isUsefulName(m.name)).length;
  const preview = useMemo(
    () => previewExtract(),
    [dots, selectedMeshName, depth, explode, activeKind, pickMode, autoMirror],
  );

  const onCut = useCallback(() => {
    const r = commitPart();
    if (r === "empty") toast.message("Empty cut — raise depth or grow");
    if (r === "need-mesh") toast.message("Click a mesh first");
    if (r === "need-dots") toast.message("Place corner dots first");
  }, [commitPart]);

  useEffect(() => {
    if (loadError) toast.error(loadError);
  }, [loadError]);

  const status =
    pickMode === "mesh"
      ? selectedMeshName
        ? selectedMeshName
        : "Click a panel"
      : tool === "orbit"
        ? "Drag to spin"
        : `Snap ${dots.length}/${needed} corners`;

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="pointer-events-auto">
            <p className="font-display text-sm font-medium tracking-[0.2em]">PART-OUT</p>
            <p className="mt-0.5 text-xs text-muted">Snap corners · cut parts · mirror L/R</p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
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
              className="btn-ghost"
              disabled={parts.length === 0}
              onClick={() => void exportPartedGltf()}
            >
              <Download className="size-3.5" />
              Export
            </button>
          </div>
        </div>
        <div className="pointer-events-auto mt-3 flex max-w-full gap-1 overflow-x-auto">
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
      </header>

      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <p className="rounded-full border border-border bg-surface px-4 py-2 font-mono text-xs text-muted">
            Loading GLB
          </p>
        </div>
      ) : null}

      {sheet === "parts" && parts.length > 0 ? (
        <aside className="pointer-events-auto absolute top-28 right-4 z-20 w-56 rounded-xl border border-border bg-surface p-3">
          <p className="label">Cut parts</p>
          <ul>
            {parts.map((p) => (
              <li key={p.id} className="flex items-center gap-2 border-b border-border py-2 text-sm">
                <span className="size-1.5 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate">
                  {p.label}
                  {p.mirrored ? " ±L/R" : ""}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted">{p.faceCount}</span>
                <button type="button" className="text-muted hover:text-fg" onClick={() => removePart(p.id)} aria-label="Remove">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-ghost mt-2 w-full" onClick={clearParts}>
            Reset
          </button>
        </aside>
      ) : null}

      {sheet === "meshes" ? (
        <aside className="pointer-events-auto absolute top-28 right-4 z-20 max-h-[50vh] w-56 overflow-auto rounded-xl border border-border bg-surface p-3">
          <p className="label">Meshes</p>
          <ul>
            {meshList.map((m) => (
              <li key={m.uuid}>
                <button
                  type="button"
                  onClick={() => useStore.getState().pickMesh(m.uuid, m.name)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-xs text-muted hover:text-fg"
                >
                  <span className="min-w-0 flex-1 truncate font-mono">{m.name}</span>
                  <span className="font-mono text-[10px] tabular-nums text-accent">
                    {m.kind ? PART_META[m.kind].label : m.faces}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-4">
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-3">
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {GROUPS.map((g) => (
              <div key={g.label} className="flex shrink-0 items-center gap-1">
                {g.kinds.map((k) => {
                  const m = PART_META[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      title={m.hint}
                      onClick={() => setKind(k)}
                      className={cn("chip", activeKind === k && "chip-on")}
                    >
                      <span className="size-1.5 rounded-full" style={{ background: m.color }} />
                      {m.label.replace("Passenger ", "P. ").replace("Driver ", "D. ")}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={tool === "place" && pickMode === "verts" ? "btn-solid" : "btn-ghost"} onClick={() => { setTool("place"); setPickMode("verts"); }}>
              Dots
            </button>
            <button type="button" className={tool === "place" && pickMode === "mesh" ? "btn-solid" : "btn-ghost"} onClick={() => { setTool("place"); setPickMode("mesh"); }}>
              Mesh
            </button>
            <button type="button" className={tool === "orbit" ? "btn-solid" : "btn-ghost"} onClick={() => setTool("orbit")}>
              Spin
            </button>
            <button
              type="button"
              className={autoMirror ? "btn-solid" : "btn-ghost"}
              onClick={() => useStore.getState().setAutoMirror(!autoMirror)}
            >
              L/R
            </button>
            <button type="button" className="btn-ghost" onClick={undo} disabled={!dots.length && !parts.length && !selectedMeshName}>
              Undo
            </button>
            <button type="button" className="btn-ghost" onClick={clearDots} disabled={!dots.length && !selectedMeshName}>
              Clear
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={loading || stats.vertices < 8}
              onClick={() => {
                const n = suggestDoor();
                if (n < 3) toast.message("No door poster — snap corners yourself");
                else toast.message(`${n} door snaps. Cut, then L/R.`);
              }}
            >
              Door 2D
            </button>
            {namedCount > 0 ? (
              <button type="button" className="btn-ghost" disabled={loading} onClick={() => claimNamed()}>
                Named
              </button>
            ) : null}
            <button
              type="button"
              className={cn("btn-ghost", sheet === "meshes" && "btn-solid")}
              onClick={() => setSheet((s) => (s === "meshes" ? null : "meshes"))}
            >
              List
            </button>
            <button
              type="button"
              className={cn("btn-ghost", sheet === "parts" && "btn-solid")}
              disabled={parts.length === 0}
              onClick={() => setSheet((s) => (s === "parts" ? null : "parts"))}
            >
              Parts {parts.length || ""}
            </button>
            <button type="button" className="btn-primary ml-auto" disabled={!canCut} onClick={onCut}>
              Cut {meta.label}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex min-w-36 flex-1 items-center gap-2 text-xs text-muted">
              Depth
              <input
                type="range"
                className="w-full accent-accent"
                min={0.04}
                max={1.4}
                step={0.01}
                value={depth}
                onChange={(e) => useStore.getState().setDepth(Number(e.target.value))}
              />
            </label>
            <label className="flex min-w-36 flex-1 items-center gap-2 text-xs text-muted">
              Explode
              <input
                type="range"
                className="w-full accent-accent"
                min={0}
                max={2.2}
                step={0.01}
                value={explode}
                onChange={(e) => useStore.getState().setExplode(Number(e.target.value))}
              />
            </label>
            <p className="font-mono text-xs tabular-nums text-muted">
              {stats.faces} faces · {leftoverFaces} left
            </p>
          </div>

          <p className="mt-2 font-mono text-xs text-accent">
            {meta.label}
            {meta.mirror && autoMirror ? " ±L/R" : ""} · {status}
            {preview > 0 ? ` · ${preview} faces` : ""}
            {notice ? ` · ${notice}` : ""}
          </p>
        </div>
      </div>
    </>
  );
}
