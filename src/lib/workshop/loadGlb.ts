import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

let loader: GLTFLoader | null = null;

function getLoader() {
  if (loader) return loader;
  const next = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("/draco/");
  next.setDRACOLoader(draco);
  loader = next;
  return next;
}

function prepareMaterial(mat: THREE.Material) {
  const std = mat as THREE.MeshStandardMaterial;
  if ("metalness" in std) std.metalness = Math.min(Number(std.metalness ?? 0.2), 0.42);
  if ("roughness" in std) std.roughness = Math.max(Number(std.roughness ?? 0.45), 0.18);
  if ("envMapIntensity" in std) std.envMapIntensity = 1;
  const phys = mat as THREE.MeshPhysicalMaterial;
  if ("transmission" in phys && phys.transmission > 0.15 && (phys.thickness ?? 0) > 0.4) {
    phys.transmission = 0;
    phys.thickness = 0;
  }
  std.needsUpdate = true;
}

/** Clone materials so hiding one mesh cannot mute siblings that shared a slot. */
export function cloneSharedMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    if (Array.isArray(m.material)) m.material = m.material.map((mat) => mat.clone());
    else m.material = m.material.clone();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) prepareMaterial(mat);
    m.castShadow = true;
    m.receiveShadow = true;
  });
}

export async function loadGlbFromUrl(url: string): Promise<THREE.Group> {
  const gltf = await getLoader().loadAsync(url);
  cloneSharedMaterials(gltf.scene);
  return gltf.scene;
}

export async function loadGlbFromBuffer(buf: ArrayBuffer, path = ""): Promise<THREE.Group> {
  const gltf = await getLoader().parseAsync(buf, path);
  cloneSharedMaterials(gltf.scene);
  return gltf.scene;
}

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) mat?.dispose?.();
  });
}
