export type PartKind =
  | "hood"
  | "trunk"
  | "front_bumper"
  | "rear_bumper"
  | "driver_door"
  | "passenger_door"
  | "driver_rear_door"
  | "passenger_rear_door"
  | "windshield"
  | "rear_window"
  | "side_window_driver"
  | "side_window_passenger"
  | "wheel_fl"
  | "wheel_fr"
  | "wheel_rl"
  | "wheel_rr"
  | "mirror_driver"
  | "mirror_passenger"
  | "grille"
  | "custom";

export type VolumeMode = "quad" | "wheel" | "box2";
export type PickMode = "verts" | "mesh";
export type LrAxis = "x" | "z";
export type ToolMode = "orbit" | "place";

export interface CornerDot {
  id: string;
  world: [number, number, number];
  vertexIndex: number;
  meshUuid: string;
}

export interface CarPart {
  id: string;
  kind: PartKind;
  label: string;
  color: string;
  dots: CornerDot[];
  meshUuid: string | null;
  mirrored: boolean;
  mode: VolumeMode;
  pickMode: PickMode;
  depth: number;
  grow: number;
  faceCount: number;
  vertexCount: number;
  centroid: [number, number, number];
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array | null;
}

export interface PartMeta {
  label: string;
  color: string;
  mode: VolumeMode;
  dotsNeeded: number;
  mirror: boolean;
  hint: string;
}

export const PART_META: Record<PartKind, PartMeta> = {
  hood: {
    label: "Hood",
    color: "#c45c48",
    mode: "quad",
    dotsNeeded: 4,
    mirror: false,
    hint: "Four corners of the hood panel.",
  },
  trunk: {
    label: "Trunk / hatch",
    color: "#c48a3a",
    mode: "quad",
    dotsNeeded: 4,
    mirror: false,
    hint: "Four corners of the trunk or hatch.",
  },
  front_bumper: {
    label: "Front bumper",
    color: "#a8aeb8",
    mode: "quad",
    dotsNeeded: 4,
    mirror: false,
    hint: "Four corners of the front fascia.",
  },
  rear_bumper: {
    label: "Rear bumper",
    color: "#8e959f",
    mode: "quad",
    dotsNeeded: 4,
    mirror: false,
    hint: "Four corners of the rear fascia.",
  },
  driver_door: {
    label: "Driver door",
    color: "#4aa89c",
    mode: "quad",
    dotsNeeded: 4,
    mirror: true,
    hint: "Door-frame corners. Mirrors across the car.",
  },
  passenger_door: {
    label: "Passenger door",
    color: "#6bbfb4",
    mode: "quad",
    dotsNeeded: 4,
    mirror: true,
    hint: "Door-frame corners. Mirrors across the car.",
  },
  driver_rear_door: {
    label: "Driver rear door",
    color: "#3d8f86",
    mode: "quad",
    dotsNeeded: 4,
    mirror: true,
    hint: "Rear door, driver side. Mirrors.",
  },
  passenger_rear_door: {
    label: "Passenger rear door",
    color: "#7ecdc4",
    mode: "quad",
    dotsNeeded: 4,
    mirror: true,
    hint: "Rear door, passenger side. Mirrors.",
  },
  windshield: {
    label: "Windshield",
    color: "#7eb6d4",
    mode: "quad",
    dotsNeeded: 4,
    mirror: false,
    hint: "Four glass corners of the windshield.",
  },
  rear_window: {
    label: "Rear window",
    color: "#5a98b8",
    mode: "quad",
    dotsNeeded: 4,
    mirror: false,
    hint: "Four corners of the backlight.",
  },
  side_window_driver: {
    label: "Driver window",
    color: "#9bc9e0",
    mode: "quad",
    dotsNeeded: 4,
    mirror: true,
    hint: "Side glass. Mirrors across the car.",
  },
  side_window_passenger: {
    label: "Passenger window",
    color: "#b7d7e8",
    mode: "quad",
    dotsNeeded: 4,
    mirror: true,
    hint: "Side glass. Mirrors across the car.",
  },
  wheel_fl: {
    label: "Wheel FL",
    color: "#2a2c31",
    mode: "wheel",
    dotsNeeded: 2,
    mirror: true,
    hint: "Hub vertex, then a rim vertex.",
  },
  wheel_fr: {
    label: "Wheel FR",
    color: "#32353c",
    mode: "wheel",
    dotsNeeded: 2,
    mirror: true,
    hint: "Hub, then rim. Mirrors.",
  },
  wheel_rl: {
    label: "Wheel RL",
    color: "#222428",
    mode: "wheel",
    dotsNeeded: 2,
    mirror: true,
    hint: "Rear driver hub, then rim.",
  },
  wheel_rr: {
    label: "Wheel RR",
    color: "#3a3e46",
    mode: "wheel",
    dotsNeeded: 2,
    mirror: true,
    hint: "Rear passenger hub, then rim.",
  },
  mirror_driver: {
    label: "Driver mirror",
    color: "#9a8fb0",
    mode: "box2",
    dotsNeeded: 2,
    mirror: true,
    hint: "Two opposite corners of the wing mirror.",
  },
  mirror_passenger: {
    label: "Passenger mirror",
    color: "#b5acc6",
    mode: "box2",
    dotsNeeded: 2,
    mirror: true,
    hint: "Two opposite corners of the wing mirror.",
  },
  grille: {
    label: "Grille",
    color: "#6b7078",
    mode: "quad",
    dotsNeeded: 4,
    mirror: false,
    hint: "Four corners of the grille opening.",
  },
  custom: {
    label: "Custom slice",
    color: "#b07080",
    mode: "quad",
    dotsNeeded: 4,
    mirror: false,
    hint: "Any corners. Crude on purpose.",
  },
};

export const PART_ORDER: PartKind[] = [
  "hood",
  "trunk",
  "driver_door",
  "passenger_door",
  "driver_rear_door",
  "passenger_rear_door",
  "windshield",
  "rear_window",
  "side_window_driver",
  "side_window_passenger",
  "wheel_fl",
  "wheel_fr",
  "wheel_rl",
  "wheel_rr",
  "front_bumper",
  "rear_bumper",
  "mirror_driver",
  "mirror_passenger",
  "grille",
  "custom",
];

export interface MeshStats {
  meshes: number;
  faces: number;
  vertices: number;
}

export interface MeshRow {
  uuid: string;
  name: string;
  kind: PartKind | null;
  faces: number;
  vertices: number;
}
