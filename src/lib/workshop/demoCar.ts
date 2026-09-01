import * as THREE from "three";

function std(color: number, extra?: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.48,
    metalness: 0.22,
    ...extra,
  });
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  name: string,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function wheel(x: number, z: number, name: string) {
  const g = new THREE.CylinderGeometry(0.38, 0.38, 0.26, 12);
  g.rotateZ(Math.PI / 2);
  const mesh = new THREE.Mesh(g, std(0x1a1c20, { roughness: 0.72, metalness: 0.12 }));
  mesh.position.set(x, 0.38, z);
  mesh.name = name;
  mesh.castShadow = true;
  return mesh;
}

/** Named low-poly car (~500 faces) so mesh-claim and vertex-snap both work. */
export function createDemoCar() {
  const root = new THREE.Group();
  root.name = "demo-lowpoly-car";

  const paint = std(0xb43b32);
  const paintDark = std(0x9a322b);
  const trim = std(0x2c3036, { metalness: 0.45 });
  const glass = std(0x8ec4dc, {
    roughness: 0.08,
    metalness: 0.12,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  });

  root.add(box(1.7, 0.52, 3.35, 0, 0.62, 0.04, paint, "body"));
  root.add(box(1.52, 0.1, 1.12, 0, 0.93, 0.86, paintDark, "hood"));
  root.add(box(1.52, 0.1, 0.68, 0, 0.93, -1.24, paintDark, "trunk"));
  root.add(box(1.64, 0.26, 0.26, 0, 0.5, 1.7, trim, "front_bumper"));
  root.add(box(1.64, 0.26, 0.26, 0, 0.5, -1.66, trim, "rear_bumper"));
  root.add(box(1.08, 0.16, 0.07, 0, 0.56, 1.84, std(0x1c1e22), "grille"));

  root.add(box(0.07, 0.7, 1.02, -0.86, 0.94, 0.06, paint, "driver_door"));
  root.add(box(0.07, 0.7, 1.02, 0.86, 0.94, 0.06, paint, "passenger_door"));
  root.add(box(1.42, 0.52, 1.32, 0, 1.3, -0.16, paintDark, "cabin"));

  const ws = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.4, 0.05), glass.clone());
  ws.position.set(0, 1.36, 0.54);
  ws.rotation.x = -0.42;
  ws.name = "windshield";
  root.add(ws);

  const rw = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.34, 0.05), glass.clone());
  rw.position.set(0, 1.34, -0.8);
  rw.rotation.x = 0.36;
  rw.name = "rear_window";
  root.add(rw);

  const swL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.82), glass.clone());
  swL.position.set(-0.74, 1.34, -0.12);
  swL.name = "side_window_driver";
  root.add(swL);

  const swR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.82), glass.clone());
  swR.position.set(0.74, 1.34, -0.12);
  swR.name = "side_window_passenger";
  root.add(swR);

  root.add(wheel(-0.88, 1.05, "wheel_fl"));
  root.add(wheel(0.88, 1.05, "wheel_fr"));
  root.add(wheel(-0.88, -1.15, "wheel_rl"));
  root.add(wheel(0.88, -1.15, "wheel_rr"));

  root.add(box(0.2, 0.11, 0.15, -1.02, 1.06, 0.42, trim, "mirror_driver"));
  root.add(box(0.2, 0.11, 0.15, 1.02, 1.06, 0.42, trim, "mirror_passenger"));

  root.updateMatrixWorld(true);
  return root;
}
