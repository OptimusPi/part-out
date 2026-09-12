import { create } from "zustand";
import * as THREE from "three";
import type {
  CarPart,
  CornerDot,
  LrAxis,
  MeshRow,
  MeshStats,
  PartKind,
  PickMode,
  ToolMode,
  VolumeMode,
} from "./types";
import { PART_META } from "./types";
import {
  bakePickable,
  collectMeshes,
  detectLrAxis,
  extractFaces,
  extractMeshes,
  fitAndCenter,
  growVolume,
  leftoverGeom,
  mirroredMeshUuids,
  modelStats,
  nearestVertex,
  guessDoorFromSideView,
  placeDot,
  type PickableMesh,
  uniqueWorldVertices,
  volumeFromDots,
  mirrorVolume,
} from "./geometry";
import { createDemoCar } from "./demoCar.ts";
import { DEFAULT_CAR_ID, garageById, guessKind, humanizeName, isUsefulName } from "./garage.ts";
import { disposeObject, loadGlbFromUrl } from "./loadGlb.ts";

export interface AppState {
  tool: ToolMode;
  pickMode: PickMode;
  activeKind: PartKind;
  depth: number;
  grow: number;
  explode: number;
  lrAxis: LrAxis;
  autoMirror: boolean;
  showVerts: boolean;
  showWire: boolean;
  showVolume: boolean;
  sourceName: string;
  stats: MeshStats;
  dots: CornerDot[];
  selectedMeshUuid: string | null;
  selectedMeshName: string;
  hoverSnap: CornerDot | null;
  parts: CarPart[];
  modelRevision: number;
  claimedFaces: Set<string>;
  leftoverFaces: number;
  notice: string;
  modelSize: number;
  meshList: MeshRow[];
  loading: boolean;
  loadError: string;
  garageId: string | null;

  setTool: (t: ToolMode) => void;
  setPickMode: (m: PickMode) => void;
  setKind: (k: PartKind) => void;
  setDepth: (n: number) => void;
  setGrow: (n: number) => void;
  setExplode: (n: number) => void;
  setLrAxis: (a: LrAxis) => void;
  setAutoMirror: (v: boolean) => void;
  setShowVerts: (v: boolean) => void;
  setShowWire: (v: boolean) => void;
  setShowVolume: (v: boolean) => void;
  setHoverSnap: (d: CornerDot | null) => void;
  undoDot: () => void;
  undo: () => void;
  clearDots: () => void;
  removePart: (id: string) => void;
  clearParts: () => void;
  loadObject: (root: THREE.Object3D, name: string, garageId?: string | null) => void;
  loadDemo: () => void;
  loadGarage: (id: string) => void;
  bootGarage: () => void;
  pickVertex: (world: THREE.Vector3) => CornerDot | null;
  pickMesh: (uuid: string, name: string) => void;
  commitPart: () => "ok" | "empty" | "need-dots" | "need-mesh";
  claimNamed: () => number;
  suggestDoor: () => number;
}

let sceneRoot: THREE.Group | null = null;
let pickables: PickableMesh[] = [];
let worldVerts: Float32Array = new Float32Array(0);
const modelCenter = new THREE.Vector3();

export function getSceneRoot() {
  return sceneRoot;
}
export function getPickables() {
  return pickables;
}
export function getWorldVerts() {
  return worldVerts;
}
export function getModelCenter() {
  return modelCenter;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function buildMeshList(): MeshRow[] {
  return pickables.map((p) => ({
    uuid: p.uuid,
    name: p.name,
    kind: guessKind(p.name),
    faces: p.faceCount,
    vertices: p.vertexCount,
  }));
}

let loadGen = 0;

async function loadFromUrl(url: string, name: string, garageId: string | null) {
  const gen = ++loadGen;
  useStore.setState({
    loading: true,
    loadError: "",
    garageId,
    notice: `Loading ${name}`,
  });
  try {
    const scene = await loadGlbFromUrl(url);
    if (gen !== loadGen) {
      disposeObject(scene);
      return;
    }
    useStore.getState().loadObject(scene, name, garageId);
  } catch {
    if (gen !== loadGen) return;
    useStore.setState({
      loading: false,
      loadError: "Couldn't load that GLB",
      notice: "Couldn't load that GLB",
    });
  }
}

function refreshPickables(root: THREE.Object3D) {
  pickables = collectMeshes(root).map(bakePickable);
  worldVerts = uniqueWorldVertices(pickables);
  const box = new THREE.Box3().setFromObject(root);
  box.getCenter(modelCenter);
  return modelStats(pickables);
}

function toPart(
  kind: PartKind,
  extracted: ReturnType<typeof extractFaces>,
  extras: Partial<CarPart>,
): CarPart {
  const meta = PART_META[kind];
  return {
    id: uid(),
    kind,
    label: meta.label,
    color: meta.color,
    dots: [],
    meshUuid: null,
    mirrored: false,
    mode: meta.mode,
    pickMode: "verts",
    depth: 0,
    grow: 0,
    faceCount: extracted.faceCount,
    vertexCount: extracted.vertexCount,
    centroid: extracted.centroid.toArray() as [number, number, number],
    positions: extracted.positions,
    normals: extracted.normals,
    uvs: extracted.uvs,
    ...extras,
  };
}

function bootNotice(fused: boolean, named: number, meshes: number) {
  if (fused || meshes <= 1) return "Fused mesh — snap corner dots, then Cut";
  if (named > 0) return `${named} named meshes — click one or Claim named`;
  return `${meshes} panels — click a mesh, then Cut`;
}

export const useStore = create<AppState>((set, get) => ({
  tool: "place",
  pickMode: "verts",
  activeKind: "driver_door",
  depth: 0.28,
  grow: 0,
  explode: 0,
  lrAxis: "x",
  autoMirror: true,
  showVerts: true,
  showWire: false,
  showVolume: true,
  sourceName: "golf-cart.glb",
  stats: { meshes: 0, faces: 0, vertices: 0 },
  dots: [],
  selectedMeshUuid: null,
  selectedMeshName: "",
  hoverSnap: null,
  parts: [],
  modelRevision: 0,
  claimedFaces: new Set(),
  leftoverFaces: 0,
  notice: "",
  modelSize: 4,
  meshList: [],
  loading: false,
  loadError: "",
  garageId: null,

  setTool: (t) => set({ tool: t }),
  setPickMode: (m) => set({ pickMode: m, dots: [], selectedMeshUuid: null, selectedMeshName: "", notice: "" }),
  setKind: (k) => set({ activeKind: k, dots: [], notice: "" }),
  setDepth: (n) => set({ depth: n }),
  setGrow: (n) => set({ grow: n }),
  setExplode: (n) => set({ explode: n }),
  setLrAxis: (a) => set({ lrAxis: a }),
  setAutoMirror: (v) => set({ autoMirror: v }),
  setShowVerts: (v) => set({ showVerts: v }),
  setShowWire: (v) => set({ showWire: v }),
  setShowVolume: (v) => set({ showVolume: v }),
  setHoverSnap: (d) => set({ hoverSnap: d }),
  undoDot: () => set({ dots: get().dots.slice(0, -1), notice: "" }),
  undo: () => {
    const s = get();
    if (s.dots.length) {
      set({ dots: s.dots.slice(0, -1), notice: "" });
      return;
    }
    if (s.selectedMeshUuid) {
      set({ selectedMeshUuid: null, selectedMeshName: "", notice: "" });
      return;
    }
    const last = s.parts[s.parts.length - 1];
    if (!last) return;
    const parts = s.parts.slice(0, -1);
    const claimed = rebuildClaimed(parts, s);
    set({
      parts,
      claimedFaces: claimed,
      leftoverFaces: s.stats.faces - claimed.size,
      notice: `Undid ${last.label}`,
    });
  },
  clearDots: () => set({ dots: [], selectedMeshUuid: null, selectedMeshName: "", notice: "" }),

  removePart: (id) => {
    const parts = get().parts.filter((p) => p.id !== id);
    const claimed = rebuildClaimed(parts, get());
    set({ parts, claimedFaces: claimed, leftoverFaces: get().stats.faces - claimed.size, notice: "" });
  },
  clearParts: () => {
    set({ parts: [], claimedFaces: new Set(), leftoverFaces: get().stats.faces, notice: "" });
  },

  loadObject: (root, name, garageId = null) => {
    if (!sceneRoot) sceneRoot = new THREE.Group();
    for (const child of [...sceneRoot.children]) {
      sceneRoot.remove(child);
      disposeObject(child);
    }
    const wrapper = new THREE.Group();
    wrapper.add(root);
    const fitted = fitAndCenter(wrapper, 4);
    sceneRoot.add(wrapper);
    const stats = refreshPickables(sceneRoot);
    const lr = detectLrAxis(sceneRoot);
    const meshList = buildMeshList();
    const car = garageId ? garageById(garageId) : null;
    const fused = Boolean(car?.fused) || stats.meshes <= 1;
    const named = meshList.filter((m) => m.kind || isUsefulName(m.name)).length;
    set({
      sourceName: name,
      stats,
      dots: [],
      selectedMeshUuid: null,
      selectedMeshName: "",
      parts: [],
      claimedFaces: new Set(),
      leftoverFaces: stats.faces,
      lrAxis: lr,
      modelRevision: get().modelRevision + 1,
      notice: bootNotice(fused, named, stats.meshes),
      hoverSnap: null,
      modelSize: Math.max(fitted.size.x, fitted.size.y, fitted.size.z),
      meshList,
      loading: false,
      loadError: "",
      garageId,
      pickMode: "verts",
      tool: "place",
      explode: 0,
    });
  },

  loadDemo: () => {
    get().loadObject(createDemoCar(), "demo-lowpoly-car", "demo");
  },

  loadGarage: (id) => {
    const car = garageById(id);
    if (!car) return;
    void loadFromUrl(car.src, `${car.id}.glb`, car.id);
  },

  bootGarage: () => {
    if (get().modelRevision > 0 || get().loading) return;
    get().loadGarage(DEFAULT_CAR_ID);
  },

  pickVertex: (world) => {
    const s = get();
    const max = Math.max(0.35, s.modelSize * 0.08);
    const hit = nearestVertex(pickables, world, max);
    if (!hit) return null;
    const needed = PART_META[s.activeKind].dotsNeeded;
    const dots = placeDot(s.dots, hit, needed);
    const full = dots.length >= needed;
    set({
      dots,
      notice: full ? `${needed} corners — Cut` : "",
    });
    return hit;
  },

  pickMesh: (uuid, name) => {
    const kind = guessKind(name);
    set({
      selectedMeshUuid: uuid,
      selectedMeshName: name || "mesh",
      pickMode: "mesh",
      tool: "place",
      ...(kind ? { activeKind: kind } : {}),
      notice: kind ? `Guessed ${PART_META[kind].label}` : "",
    });
  },

  commitPart: () => {
    const s = get();
    const meta = PART_META[s.activeKind];

    if (s.pickMode === "mesh") {
      if (!s.selectedMeshUuid) return "need-mesh";
      const uuids = s.autoMirror && meta.mirror
        ? mirroredMeshUuids(pickables, s.selectedMeshUuid, s.lrAxis, s.modelSize)
        : new Set([s.selectedMeshUuid]);
      const extracted = extractMeshes(pickables, uuids, s.claimedFaces);
      if (extracted.faceCount < 1) {
        set({ notice: "That mesh is already claimed." });
        return "empty";
      }
      const part = toPart(s.activeKind, extracted, {
        meshUuid: s.selectedMeshUuid,
        mirrored: uuids.size > 1,
        pickMode: "mesh",
        depth: s.depth,
        grow: s.grow,
      });
      const nextClaimed = new Set(s.claimedFaces);
      extracted.claimed.forEach((k) => nextClaimed.add(k));
      set({
        parts: [...s.parts, part],
        dots: [],
        selectedMeshUuid: null,
        selectedMeshName: "",
        claimedFaces: nextClaimed,
        leftoverFaces: s.stats.faces - nextClaimed.size,
        notice: `${part.label}: ${part.faceCount} faces`,
      });
      return "ok";
    }

    const needed = meta.dotsNeeded;
    if (s.dots.length < Math.min(2, needed)) return "need-dots";

    const mode: VolumeMode = meta.mode;
    let vol = volumeFromDots(s.dots, mode, s.depth, modelCenter);
    if (!vol) return "need-dots";
    vol = growVolume(vol, s.grow);
    const volumes = [vol];
    const shouldMirror = s.autoMirror && meta.mirror;
    if (shouldMirror) volumes.push(mirrorVolume(vol, s.lrAxis));

    const extracted = extractFaces(pickables, volumes, s.claimedFaces);
    if (extracted.faceCount < 1) {
      set({ notice: "Nothing in that volume. Raise depth or grow, or switch to mesh claim." });
      return "empty";
    }
    const part = toPart(s.activeKind, extracted, {
      dots: s.dots.slice(),
      mirrored: shouldMirror,
      mode,
      pickMode: "verts",
      depth: s.depth,
      grow: s.grow,
    });
    const nextClaimed = new Set(s.claimedFaces);
    extracted.claimed.forEach((k) => nextClaimed.add(k));
    set({
      parts: [...s.parts, part],
      dots: [],
      claimedFaces: nextClaimed,
      leftoverFaces: s.stats.faces - nextClaimed.size,
      notice: `${part.label}: ${part.faceCount} faces`,
    });
    return "ok";
  },

  claimNamed: () => {
    const nextParts = [...get().parts];
    const nextClaimed = new Set(get().claimedFaces);
    let n = 0;
    for (const p of pickables) {
      const kind = guessKind(p.name);
      const useful = isUsefulName(p.name);
      if (!kind && !useful) continue;
      const extracted = extractMeshes(pickables, new Set([p.uuid]), nextClaimed);
      if (extracted.faceCount < 1) continue;
      const partKind = kind ?? "custom";
      const part = toPart(partKind, extracted, {
        meshUuid: p.uuid,
        mirrored: false,
        pickMode: "mesh",
        label: kind ? PART_META[kind].label : humanizeName(p.name),
      });
      extracted.claimed.forEach((k) => nextClaimed.add(k));
      nextParts.push(part);
      n++;
    }
    set({
      parts: nextParts,
      claimedFaces: nextClaimed,
      leftoverFaces: get().stats.faces - nextClaimed.size,
      selectedMeshUuid: null,
      selectedMeshName: "",
      explode: n > 0 ? 1.05 : get().explode,
      notice: n ? `Claimed ${n} named parts` : "No named parts on this model",
    });
    return n;
  },

  suggestDoor: () => {
    const s = get();
    const max = Math.max(0.5, s.modelSize * 0.2);
    const dots = guessDoorFromSideView(pickables, s.lrAxis, max);
    if (dots.length < 3) {
      set({ notice: "No door poster on this mesh" });
      return 0;
    }
    set({
      dots: dots.slice(0, 4),
      pickMode: "verts",
      tool: "place",
      activeKind: "driver_door",
      notice: "Door 2D — four corners. Cut.",
    });
    return Math.min(dots.length, 4);
  },
}));

function rebuildClaimed(parts: CarPart[], s: AppState) {
  const claimed = new Set<string>();
  for (const part of parts) {
    if (part.pickMode === "mesh" && part.meshUuid) {
      const uuids = part.mirrored
        ? mirroredMeshUuids(pickables, part.meshUuid, s.lrAxis, s.modelSize)
        : new Set([part.meshUuid]);
      const extracted = extractMeshes(pickables, uuids, claimed);
      extracted.claimed.forEach((k) => claimed.add(k));
      continue;
    }
    const meta = PART_META[part.kind];
    let vol = volumeFromDots(part.dots, part.mode || meta.mode, part.depth, modelCenter);
    if (!vol) continue;
    vol = growVolume(vol, part.grow);
    const volumes = [vol];
    if (part.mirrored && meta.mirror) volumes.push(mirrorVolume(vol, s.lrAxis));
    const extracted = extractFaces(pickables, volumes, claimed);
    extracted.claimed.forEach((k) => claimed.add(k));
  }
  return claimed;
}

export function leftoverNow() {
  return leftoverGeom(pickables, useStore.getState().claimedFaces, true);
}

export function leftoverAll() {
  return leftoverGeom(pickables, useStore.getState().claimedFaces, false);
}

export function previewExtract() {
  const s = useStore.getState();
  if (s.pickMode === "mesh") {
    if (!s.selectedMeshUuid) return 0;
    const meta = PART_META[s.activeKind];
    const uuids = s.autoMirror && meta.mirror
      ? mirroredMeshUuids(pickables, s.selectedMeshUuid, s.lrAxis, s.modelSize)
      : new Set([s.selectedMeshUuid]);
    return extractMeshes(pickables, uuids, s.claimedFaces).faceCount;
  }
  if (s.dots.length < 2) return 0;
  const meta = PART_META[s.activeKind];
  let vol = volumeFromDots(s.dots, meta.mode, s.depth, modelCenter);
  if (!vol) return 0;
  vol = growVolume(vol, s.grow);
  const volumes = [vol];
  if (s.autoMirror && meta.mirror) volumes.push(mirrorVolume(vol, s.lrAxis));
  return extractFaces(pickables, volumes, s.claimedFaces).faceCount;
}
