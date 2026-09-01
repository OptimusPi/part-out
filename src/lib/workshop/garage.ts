import * as THREE from "three";
import type { PartKind } from "./types";

export interface GarageCar {
  id: string;
  label: string;
  src: string;
  hint: string;
  fused: boolean;
}

export const DEFAULT_CAR_ID = "golf-cart";

export const GARAGE: GarageCar[] = [
  {
    id: "golf-cart",
    label: "Golf cart",
    src: "/cars/golf-cart.glb",
    hint: "Named wheels, seats, steering. Claim named grabs them.",
    fused: false,
  },
  {
    id: "muscle-black",
    label: "Muscle",
    src: "/cars/muscle-black.glb",
    hint: "Nine unnamed panels. Click a mesh, then cut.",
    fused: false,
  },
  {
    id: "muscle-chassis",
    label: "Chassis",
    src: "/cars/muscle-chassis.glb",
    hint: "Nine body pieces. Mesh claim, then explode.",
    fused: false,
  },
  {
    id: "parted-car-kit",
    label: "Kit",
    src: "/cars/parted-car-kit.glb",
    hint: "Twelve loose pieces. Click each, cut as a part.",
    fused: false,
  },
  {
    id: "rocketcar",
    label: "Rocket",
    src: "/cars/rocketcar.glb",
    hint: "One fused mesh. Switch to verts and snap corners.",
    fused: true,
  },
  {
    id: "wheen-whips",
    label: "Whips",
    src: "/cars/wheen-whips.glb",
    hint: "One fused mesh. Vertex snap, not mesh claim.",
    fused: true,
  },
];

export function garageById(id: string) {
  return GARAGE.find((c) => c.id === id) ?? null;
}

const JUNK_NAME =
  /^(mesh(\.\d+)?|mesh_node|meshes\[\d+\]|mesh_\d+|node_\d+|parentnode|root|scene|object_\d+)$/i;
const TRIPO = /^tripo_(part|mesh)_?\d+$/i;

export function isJunkName(name: string) {
  const n = name.trim();
  if (!n) return true;
  return JUNK_NAME.test(n) || TRIPO.test(n);
}

export function isUsefulName(name: string) {
  return Boolean(name.trim()) && !isJunkName(name);
}

export function humanizeName(name: string) {
  return name
    .replace(/[_.-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Prefer a real node name (WHEEL_FL) over Mesh_8 / meshes[0]. */
export function meshLabel(obj: THREE.Object3D): string {
  const names: string[] = [];
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.name) names.push(cur.name);
    cur = cur.parent;
  }
  const geoName = (obj as THREE.Mesh).geometry?.name;
  if (geoName) names.push(geoName);
  const useful = names.find((n) => !isJunkName(n));
  if (useful) return useful;
  return names[0] || "mesh";
}

export function guessKind(name: string): PartKind | null {
  const raw = name.trim();
  if (!raw || isJunkName(raw)) return null;
  const n = raw.toLowerCase().replace(/[\s._-]+/g, "");

  if (/^(wheelfl|flwheel|frontleftwheel|wheelfrontleft)$/.test(n)) return "wheel_fl";
  if (/^(wheelfr|frwheel|frontrightwheel|wheelfrontright)$/.test(n)) return "wheel_fr";
  if (/^(wheelrl|rlwheel|rearleftwheel|wheelrearleft)$/.test(n)) return "wheel_rl";
  if (/^(wheelrr|rrwheel|rearrightwheel|wheelrearright)$/.test(n)) return "wheel_rr";

  if (/^(hood|bonnet)$/.test(n)) return "hood";
  if (/^(trunk|boot|hatch|tailgate)$/.test(n)) return "trunk";
  if (/^(frontbumper|bumperfront|bumperf)$/.test(n)) return "front_bumper";
  if (/^(rearbumper|bumperrear|bumperr)$/.test(n)) return "rear_bumper";
  if (/^(grille|grill)$/.test(n)) return "grille";
  if (/^(windshield|windscreen|frontglass)$/.test(n)) return "windshield";
  if (/^(rearwindow|backlight|rearglass)$/.test(n)) return "rear_window";
  if (/^(driverwindow|windowdriver|windowl|leftwindow|sidewindowdriver)$/.test(n)) {
    return "side_window_driver";
  }
  if (/^(passengerwindow|windowpassenger|windowr|rightwindow|sidewindowpassenger)$/.test(n)) {
    return "side_window_passenger";
  }
  if (/^(driverreardoor|reardoordriver|reardoorl)$/.test(n)) return "driver_rear_door";
  if (/^(passengerreardoor|reardoorpassenger|reardoorr)$/.test(n)) return "passenger_rear_door";
  if (/^(driverdoor|doordriver|doorl|leftdoor)$/.test(n)) return "driver_door";
  if (/^(passengerdoor|doorpassenger|doorr|rightdoor)$/.test(n)) return "passenger_door";
  if (/^(drivermirror|mirrordriver|mirrorl|leftmirror)$/.test(n)) return "mirror_driver";
  if (/^(passengermirror|mirrorpassenger|mirrorr|rightmirror)$/.test(n)) return "mirror_passenger";
  return null;
}
