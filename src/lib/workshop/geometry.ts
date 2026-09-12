import * as THREE from "three";
import type { CornerDot, LrAxis, VolumeMode } from "./types";
import { meshLabel } from "./garage.ts";

export interface PickableMesh {
  mesh: THREE.Mesh;
  uuid: string;
  name: string;
  worldPositions: Float32Array;
  localPositions: Float32Array;
  index: Uint32Array | null;
  faceCount: number;
  vertexCount: number;
  centroid: THREE.Vector3;
}

export interface Volume {
  mode: VolumeMode;
  center: THREE.Vector3;
  axisX: THREE.Vector3;
  axisY: THREE.Vector3;
  axisZ: THREE.Vector3;
  halfX: number;
  halfY: number;
  halfZ: number;
  radius?: number;
}

export interface ExtractedGeom {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array | null;
  faceCount: number;
  vertexCount: number;
  centroid: THREE.Vector3;
  claimed: Set<string>;
}

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const pos = m.geometry.getAttribute("position");
    if (pos && pos.count > 0) out.push(m);
  });
  return out;
}

export function bakePickable(mesh: THREE.Mesh): PickableMesh {
  mesh.updateMatrixWorld(true);
  const g = mesh.geometry;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const local = new Float32Array(pos.array as ArrayLike<number> as Float32Array);
  const world = new Float32Array(local.length);
  const mw = mesh.matrixWorld;
  const centroid = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(mw);
    world[i * 3] = _v.x;
    world[i * 3 + 1] = _v.y;
    world[i * 3 + 2] = _v.z;
    centroid.add(_v);
  }
  if (pos.count > 0) centroid.multiplyScalar(1 / pos.count);
  const index = g.index ? new Uint32Array(g.index.array as ArrayLike<number>) : null;
  const vertexCount = pos.count;
  const faceCount = index ? index.length / 3 : Math.floor(vertexCount / 3);
  return {
    mesh,
    uuid: mesh.uuid,
    name: meshLabel(mesh),
    worldPositions: world,
    localPositions: local,
    index,
    faceCount,
    vertexCount,
    centroid,
  };
}

export function modelStats(pickables: PickableMesh[]) {
  let faces = 0;
  let vertices = 0;
  for (const p of pickables) {
    faces += p.faceCount;
    vertices += p.vertexCount;
  }
  return { meshes: pickables.length, faces, vertices };
}

export function nearestVertex(
  pickables: PickableMesh[],
  worldPoint: THREE.Vector3,
  maxDist = Infinity,
): CornerDot | null {
  let best = Infinity;
  let hit: CornerDot | null = null;
  const max2 = maxDist * maxDist;
  for (const p of pickables) {
    const arr = p.worldPositions;
    for (let i = 0; i < arr.length; i += 3) {
      const dx = arr[i] - worldPoint.x;
      const dy = arr[i + 1] - worldPoint.y;
      const dz = arr[i + 2] - worldPoint.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best && d2 <= max2) {
        best = d2;
        const vi = i / 3;
        hit = {
          id: `${p.uuid}:${vi}`,
          world: [arr[i], arr[i + 1], arr[i + 2]],
          vertexIndex: vi,
          meshUuid: p.uuid,
        };
      }
    }
  }
  return hit;
}

export function uniqueWorldVertices(pickables: PickableMesh[], eps = 1e-4): Float32Array {
  const map = new Map<string, [number, number, number]>();
  const k = 1 / eps;
  for (const p of pickables) {
    const a = p.worldPositions;
    for (let i = 0; i < a.length; i += 3) {
      const key = `${Math.round(a[i] * k)}:${Math.round(a[i + 1] * k)}:${Math.round(a[i + 2] * k)}`;
      if (!map.has(key)) map.set(key, [a[i], a[i + 1], a[i + 2]]);
    }
  }
  const out = new Float32Array(map.size * 3);
  let i = 0;
  for (const v of map.values()) {
    out[i++] = v[0];
    out[i++] = v[1];
    out[i++] = v[2];
  }
  return out;
}

/** Keep at most `needed` snaps. Extra hits replace the nearest existing corner. */
export function placeDot(dots: CornerDot[], hit: CornerDot, needed: number): CornerDot[] {
  if (needed < 1) return dots;
  if (dots.some((d) => d.id === hit.id)) return dots;
  if (dots.length < needed) return [...dots, hit];
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < dots.length; i++) {
    const a = dots[i].world;
    const dx = a[0] - hit.world[0];
    const dy = a[1] - hit.world[1];
    const dz = a[2] - hit.world[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  const next = dots.slice();
  next[best] = hit;
  return next;
}

/** Sort points around their centroid in the best-fit plane (CCW). */
export function orderPolygon(pts: THREE.Vector3[]): THREE.Vector3[] {
  if (pts.length < 3) return pts.slice();
  const center = new THREE.Vector3();
  for (const p of pts) center.add(p);
  center.multiplyScalar(1 / pts.length);

  const n = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    n.x += (pts[i].y - pts[j].y) * (pts[i].z + pts[j].z);
    n.y += (pts[i].z - pts[j].z) * (pts[i].x + pts[j].x);
    n.z += (pts[i].x - pts[j].x) * (pts[i].y + pts[j].y);
  }
  if (n.lengthSq() < 1e-10) {
    _a.copy(pts[1]).sub(pts[0]);
    _b.copy(pts[Math.min(2, pts.length - 1)]).sub(pts[0]);
    n.copy(_a).cross(_b);
  }
  if (n.lengthSq() < 1e-10) n.set(0, 1, 0);
  n.normalize();

  const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(ref, n);
  if (u.lengthSq() < 1e-10) u.set(1, 0, 0);
  else u.normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();

  return pts
    .map((p) => {
      _tmp.copy(p).sub(center);
      return { p, a: Math.atan2(v.dot(_tmp), u.dot(_tmp)) };
    })
    .sort((x, y) => x.a - y.a)
    .map((x) => x.p);
}

function basisFromPoints(pts: THREE.Vector3[], inwardHint: THREE.Vector3) {
  const center = new THREE.Vector3();
  for (const p of pts) center.add(p);
  center.multiplyScalar(1 / pts.length);

  const n = new THREE.Vector3();
  const ordered = orderPolygon(pts);
  for (let i = 0; i < ordered.length; i++) {
    const j = (i + 1) % ordered.length;
    _a.copy(ordered[i]).sub(center);
    _b.copy(ordered[j]).sub(center);
    n.add(_c.copy(_a).cross(_b));
  }
  if (n.lengthSq() < 1e-10) n.set(0, 1, 0);
  n.normalize();
  // Depth axis should point outward so the volume sits on the skin, then we
  // thicken both ways. Flip so n points away from the model center.
  if (n.dot(inwardHint) > 0) n.negate();

  let bestLen = -1;
  const xAxis = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < ordered.length; i++) {
    const j = (i + 1) % ordered.length;
    _a.copy(ordered[j]).sub(ordered[i]);
    _a.addScaledVector(n, -_a.dot(n));
    const len = _a.length();
    if (len > bestLen) {
      bestLen = len;
      xAxis.copy(_a);
    }
  }
  if (xAxis.lengthSq() < 1e-10) xAxis.set(1, 0, 0);
  xAxis.normalize();
  const zAxis = n;
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
  if (yAxis.lengthSq() < 1e-10) {
    yAxis.set(0, 1, 0);
  } else {
    yAxis.normalize();
  }
  xAxis.crossVectors(yAxis, zAxis).normalize();

  let hx = 0;
  let hy = 0;
  for (const p of pts) {
    _tmp.copy(p).sub(center);
    hx = Math.max(hx, Math.abs(_tmp.dot(xAxis)));
    hy = Math.max(hy, Math.abs(_tmp.dot(yAxis)));
  }
  return { center, xAxis, yAxis, zAxis, hx, hy };
}

export function volumeFromDots(
  dots: CornerDot[],
  mode: VolumeMode,
  depth: number,
  modelCenter: THREE.Vector3,
): Volume | null {
  if (dots.length < 2) return null;
  const pts = dots.map((d) => new THREE.Vector3(...d.world));

  if (mode === "wheel") {
    const hub = pts[0];
    const rim = pts[1] ?? pts[0];
    const radius = Math.max(hub.distanceTo(rim), 1e-4);
    const axis = new THREE.Vector3(1, 0, 0);
    _a.copy(hub).sub(modelCenter);
    _a.y = 0;
    if (_a.lengthSq() > 1e-8) axis.copy(_a).normalize();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const zAxis = new THREE.Vector3().crossVectors(axis, yAxis);
    if (zAxis.lengthSq() < 1e-8) zAxis.set(0, 0, 1);
    zAxis.normalize();
    yAxis.crossVectors(zAxis, axis).normalize();
    const halfAxis = Math.max(depth * 0.5, radius * 0.18);
    return {
      mode,
      center: hub.clone(),
      axisX: axis,
      axisY: yAxis,
      axisZ: zAxis,
      halfX: halfAxis,
      halfY: radius * 1.08,
      halfZ: radius * 1.08,
      radius: radius * 1.08,
    };
  }

  if (mode === "box2") {
    const min = pts[0].clone();
    const max = pts[0].clone();
    for (const p of pts) {
      min.min(p);
      max.max(p);
    }
    const center = min.clone().add(max).multiplyScalar(0.5);
    const size = max.clone().sub(min);
    const pad = Math.max(depth, 0);
    return {
      mode,
      center,
      axisX: new THREE.Vector3(1, 0, 0),
      axisY: new THREE.Vector3(0, 1, 0),
      axisZ: new THREE.Vector3(0, 0, 1),
      halfX: size.x * 0.5 + pad,
      halfY: size.y * 0.5 + pad,
      halfZ: size.z * 0.5 + pad,
    };
  }

  const inward = modelCenter.clone().sub(pts[0]);
  if (inward.lengthSq() < 1e-10) inward.set(0, 0, -1);
  else inward.normalize();
  const { center, xAxis, yAxis, zAxis, hx, hy } = basisFromPoints(pts, inward);
  return {
    mode,
    center,
    axisX: xAxis,
    axisY: yAxis,
    axisZ: zAxis,
    halfX: hx + Math.max(depth * 0.04, 0.004),
    halfY: hy + Math.max(depth * 0.04, 0.004),
    // Straddle the skin so surface faces are inside, not sitting on the plane.
    halfZ: Math.max(depth * 0.5, 0.02),
  };
}

export function mirrorVolume(vol: Volume, axis: LrAxis): Volume {
  const flip = (v: THREE.Vector3) => {
    const c = v.clone();
    if (axis === "x") c.x *= -1;
    else c.z *= -1;
    return c;
  };
  return {
    ...vol,
    center: flip(vol.center),
    axisX: flip(vol.axisX),
    axisY: flip(vol.axisY),
    axisZ: flip(vol.axisZ),
    radius: vol.radius,
  };
}

export function growVolume(vol: Volume, amount: number): Volume {
  const add = Math.max(0, amount);
  return {
    ...vol,
    halfX: vol.halfX + add,
    halfY: vol.halfY + add,
    halfZ: vol.halfZ + add,
    radius: vol.radius != null ? vol.radius + add : undefined,
  };
}

export function pointInVolume(p: THREE.Vector3, vol: Volume) {
  _tmp.copy(p).sub(vol.center);
  const x = _tmp.dot(vol.axisX);
  const y = _tmp.dot(vol.axisY);
  const z = _tmp.dot(vol.axisZ);
  if (vol.mode === "wheel" && vol.radius != null) {
    const radial = Math.sqrt(y * y + z * z);
    return Math.abs(x) <= vol.halfX && radial <= vol.radius;
  }
  return Math.abs(x) <= vol.halfX && Math.abs(y) <= vol.halfY && Math.abs(z) <= vol.halfZ;
}

function faceHitsVolume(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  volumes: Volume[],
) {
  for (const vol of volumes) {
    const ia = pointInVolume(a, vol);
    const ib = pointInVolume(b, vol);
    const ic = pointInVolume(c, vol);
    if (ia && ib && ic) return true;
    _tmp.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (pointInVolume(_tmp, vol)) return true;
  }
  return false;
}

export function faceKey(meshUuid: string, faceIndex: number) {
  return `${meshUuid}:${faceIndex}`;
}

function faceCorners(p: PickableMesh, f: number) {
  let i0: number;
  let i1: number;
  let i2: number;
  if (p.index) {
    i0 = p.index[f * 3];
    i1 = p.index[f * 3 + 1];
    i2 = p.index[f * 3 + 2];
  } else {
    i0 = f * 3;
    i1 = f * 3 + 1;
    i2 = f * 3 + 2;
  }
  _a.set(p.worldPositions[i0 * 3], p.worldPositions[i0 * 3 + 1], p.worldPositions[i0 * 3 + 2]);
  _b.set(p.worldPositions[i1 * 3], p.worldPositions[i1 * 3 + 1], p.worldPositions[i1 * 3 + 2]);
  _c.set(p.worldPositions[i2 * 3], p.worldPositions[i2 * 3 + 1], p.worldPositions[i2 * 3 + 2]);
  return { i0, i1, i2 };
}

function pushFace(
  p: PickableMesh,
  i0: number,
  i1: number,
  i2: number,
  pos: number[],
  nrm: number[],
  uv: number[],
  uvAttr: THREE.BufferAttribute | undefined,
  centroid: THREE.Vector3,
) {
  _a.set(p.worldPositions[i0 * 3], p.worldPositions[i0 * 3 + 1], p.worldPositions[i0 * 3 + 2]);
  _b.set(p.worldPositions[i1 * 3], p.worldPositions[i1 * 3 + 1], p.worldPositions[i1 * 3 + 2]);
  _c.set(p.worldPositions[i2 * 3], p.worldPositions[i2 * 3 + 1], p.worldPositions[i2 * 3 + 2]);
  pos.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
  _n.copy(_b).sub(_a).cross(_tmp.copy(_c).sub(_a));
  if (_n.lengthSq() < 1e-12) _n.set(0, 1, 0);
  else _n.normalize();
  nrm.push(_n.x, _n.y, _n.z, _n.x, _n.y, _n.z, _n.x, _n.y, _n.z);
  if (uvAttr) {
    uv.push(uvAttr.getX(i0), uvAttr.getY(i0), uvAttr.getX(i1), uvAttr.getY(i1), uvAttr.getX(i2), uvAttr.getY(i2));
  }
  centroid.add(_a).add(_b).add(_c);
}

function finishExtract(
  pos: number[],
  nrm: number[],
  uv: number[],
  hasUv: boolean,
  centroid: THREE.Vector3,
  claimed: Set<string>,
): ExtractedGeom {
  const nVerts = pos.length / 3;
  if (nVerts > 0) centroid.multiplyScalar(1 / nVerts);
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    uvs: hasUv && uv.length ? new Float32Array(uv) : null,
    faceCount: nVerts / 3,
    vertexCount: nVerts,
    centroid,
    claimed,
  };
}

export function extractFaces(
  pickables: PickableMesh[],
  volumes: Volume[],
  alreadyClaimed: Set<string>,
): ExtractedGeom {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  let hasUv = false;
  const claimed = new Set<string>();
  const centroid = new THREE.Vector3();

  for (const p of pickables) {
    const uvAttr = p.mesh.geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
    if (uvAttr) hasUv = true;
    for (let f = 0; f < p.faceCount; f++) {
      const key = faceKey(p.uuid, f);
      if (alreadyClaimed.has(key)) continue;
      const { i0, i1, i2 } = faceCorners(p, f);
      if (!faceHitsVolume(_a, _b, _c, volumes)) continue;
      claimed.add(key);
      pushFace(p, i0, i1, i2, pos, nrm, uv, uvAttr, centroid);
    }
  }
  return finishExtract(pos, nrm, uv, hasUv, centroid, claimed);
}

export function extractMeshes(
  pickables: PickableMesh[],
  uuids: Set<string>,
  alreadyClaimed: Set<string>,
): ExtractedGeom {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  let hasUv = false;
  const claimed = new Set<string>();
  const centroid = new THREE.Vector3();

  for (const p of pickables) {
    if (!uuids.has(p.uuid)) continue;
    const uvAttr = p.mesh.geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
    if (uvAttr) hasUv = true;
    for (let f = 0; f < p.faceCount; f++) {
      const key = faceKey(p.uuid, f);
      if (alreadyClaimed.has(key)) continue;
      const { i0, i1, i2 } = faceCorners(p, f);
      claimed.add(key);
      pushFace(p, i0, i1, i2, pos, nrm, uv, uvAttr, centroid);
    }
  }
  return finishExtract(pos, nrm, uv, hasUv, centroid, claimed);
}

export function meshClaimState(p: PickableMesh, claimed: Set<string>): "none" | "all" | "partial" {
  if (p.faceCount === 0) return "none";
  let n = 0;
  for (let f = 0; f < p.faceCount; f++) {
    if (claimed.has(faceKey(p.uuid, f))) n++;
  }
  if (n === 0) return "none";
  if (n >= p.faceCount) return "all";
  return "partial";
}
export function leftoverGeom(
  pickables: PickableMesh[],
  claimed: Set<string>,
  onlyPartial = false,
): ExtractedGeom {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  let hasUv = false;
  const centroid = new THREE.Vector3();

  for (const p of pickables) {
    if (onlyPartial && meshClaimState(p, claimed) !== "partial") continue;
    const uvAttr = p.mesh.geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
    if (uvAttr) hasUv = true;
    for (let f = 0; f < p.faceCount; f++) {
      if (claimed.has(faceKey(p.uuid, f))) continue;
      const { i0, i1, i2 } = faceCorners(p, f);
      pushFace(p, i0, i1, i2, pos, nrm, uv, uvAttr, centroid);
    }
  }
  return finishExtract(pos, nrm, uv, hasUv, centroid, new Set());
}

export function mirroredMeshUuids(
  pickables: PickableMesh[],
  sourceUuid: string,
  axis: LrAxis,
  modelSize: number,
): Set<string> {
  const uuids = new Set<string>([sourceUuid]);
  const src = pickables.find((p) => p.uuid === sourceUuid);
  if (!src) return uuids;
  const target = src.centroid.clone();
  if (axis === "x") target.x *= -1;
  else target.z *= -1;
  const tol = Math.max(modelSize * 0.12, 0.05);
  let best: PickableMesh | null = null;
  let bestD = Infinity;
  for (const p of pickables) {
    if (p.uuid === sourceUuid) continue;
    const d = p.centroid.distanceTo(target);
    if (d < bestD && d <= tol) {
      bestD = d;
      best = p;
    }
  }
  if (best) uuids.add(best.uuid);
  return uuids;
}

export function fitAndCenter(root: THREE.Object3D, targetSize = 4) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  const s = targetSize / maxDim;
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  const grounded = box.setFromObject(root).getSize(size);
  return { size: grounded, scale: s };
}

export function detectLrAxis(root: THREE.Object3D): LrAxis {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return size.x <= size.z ? "x" : "z";
}

function axisGet(x: number, y: number, z: number, axis: "x" | "y" | "z") {
  return axis === "x" ? x : axis === "y" ? y : z;
}

function axisSet(v: THREE.Vector3, axis: "x" | "y" | "z", n: number) {
  if (axis === "x") v.x = n;
  else if (axis === "y") v.y = n;
  else v.z = n;
}

/** Side-elevation door poster. Not a 10M-object net. Snap 4 corners to real verts. */
export function guessDoorFromSideView(
  pickables: PickableMesh[],
  lrAxis: LrAxis,
  maxSnap = Infinity,
): CornerDot[] {
  const longAxis: "x" | "z" = lrAxis === "x" ? "z" : "x";
  let minL = Infinity;
  let maxL = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of pickables) {
    const a = p.worldPositions;
    for (let i = 0; i < a.length; i += 3) {
      const L = axisGet(a[i], a[i + 1], a[i + 2], longAxis);
      const Y = a[i + 1];
      const S = axisGet(a[i], a[i + 1], a[i + 2], lrAxis);
      if (L < minL) minL = L;
      if (L > maxL) maxL = L;
      if (Y < minY) minY = Y;
      if (Y > maxY) maxY = Y;
      if (S < minLat) minLat = S;
      if (S > maxLat) maxLat = S;
    }
  }
  const len = maxL - minL;
  const hy = maxY - minY;
  const span = maxLat - minLat;
  if (!(len > 1e-4 && hy > 1e-4 && span > 1e-4)) return [];

  const groundCut = minY + hy * 0.18;
  let frontSum = 0;
  let frontN = 0;
  let rearSum = 0;
  let rearN = 0;
  const midL = (minL + maxL) * 0.5;
  for (const p of pickables) {
    const a = p.worldPositions;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i + 1] > groundCut) continue;
      const L = axisGet(a[i], a[i + 1], a[i + 2], longAxis);
      if (L < midL) {
        frontSum += L;
        frontN++;
      } else {
        rearSum += L;
        rearN++;
      }
    }
  }
  const front = frontN ? frontSum / frontN : minL + len * 0.18;
  const rear = rearN ? rearSum / rearN : maxL - len * 0.18;
  const loL = front + (rear - front) * 0.22;
  const hiL = front + (rear - front) * 0.68;
  const loY = minY + hy * 0.2;
  const hiY = minY + hy * 0.56;

  const midLat = (minLat + maxLat) * 0.5;
  let outer = minLat;
  let outerScore = 0;
  for (const p of pickables) {
    const a = p.worldPositions;
    for (let i = 0; i < a.length; i += 3) {
      const L = axisGet(a[i], a[i + 1], a[i + 2], longAxis);
      const Y = a[i + 1];
      if (L < loL || L > hiL || Y < loY || Y > hiY) continue;
      const S = axisGet(a[i], a[i + 1], a[i + 2], lrAxis);
      const score = Math.abs(S - midLat);
      if (score >= outerScore) {
        outerScore = score;
        outer = S;
      }
    }
  }

  const poster: [number, number][] = [
    [loL, loY],
    [hiL, loY],
    [hiL, hiY],
    [loL, hiY],
  ];
  const dots: CornerDot[] = [];
  const seen = new Set<string>();
  for (const [L, Y] of poster) {
    const q = new THREE.Vector3();
    axisSet(q, longAxis, L);
    q.y = Y;
    axisSet(q, lrAxis, outer);
    const hit = nearestVertex(pickables, q, maxSnap);
    if (!hit || seen.has(hit.id)) continue;
    seen.add(hit.id);
    dots.push(hit);
  }
  return dots.length >= 3 ? dots : [];
}

export function makeGeom(ex: ExtractedGeom) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(ex.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(ex.normals, 3));
  if (ex.uvs) g.setAttribute("uv", new THREE.BufferAttribute(ex.uvs, 2));
  return g;
}

export function volumeQuaternion(vol: Volume) {
  const m = new THREE.Matrix4().makeBasis(vol.axisX, vol.axisY, vol.axisZ);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
