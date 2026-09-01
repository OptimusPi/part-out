import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { leftoverAll, useStore } from "./store";
import { makeGeom } from "./geometry";

export async function exportPartedGltf() {
  const { parts, sourceName } = useStore.getState();
  const root = new THREE.Group();
  root.name = sourceName.replace(/\.(glb|gltf)$/i, "") + "-parted";

  for (const part of parts) {
    if (!part.positions.length) continue;
    const mesh = new THREE.Mesh(
      makeGeom({
        positions: part.positions,
        normals: part.normals,
        uvs: part.uvs,
        faceCount: part.faceCount,
        vertexCount: part.vertexCount,
        centroid: new THREE.Vector3(...part.centroid),
        claimed: new Set(),
      }),
      new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.45, metalness: 0.2 }),
    );
    mesh.name = part.kind;
    root.add(mesh);
  }

  const left = leftoverAll();
  if (left.faceCount > 0) {
    const body = new THREE.Mesh(
      makeGeom(left),
      new THREE.MeshStandardMaterial({ color: "#8a8f98", roughness: 0.5, metalness: 0.15 }),
    );
    body.name = "body";
    root.add(body);
  }

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true });
  const payload = result instanceof ArrayBuffer ? result : new TextEncoder().encode(JSON.stringify(result));
  const blob = new Blob([payload], { type: "model/gltf-binary" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${root.name}.glb`;
  a.click();
  URL.revokeObjectURL(a.href);
}
