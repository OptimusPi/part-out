import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { bakePickable } from "./geometry.ts";
import {
  guessKind,
  humanizeName,
  isJunkName,
  isUsefulName,
  meshLabel,
} from "./garage.ts";

describe("guessKind", () => {
  it("maps Wheen wheel node names", () => {
    assert.equal(guessKind("WHEEL_FL"), "wheel_fl");
    assert.equal(guessKind("WHEEL_FR"), "wheel_fr");
    assert.equal(guessKind("WHEEL_RL"), "wheel_rl");
    assert.equal(guessKind("WHEEL_RR"), "wheel_rr");
  });

  it("maps demo-car panel names", () => {
    assert.equal(guessKind("hood"), "hood");
    assert.equal(guessKind("driver_door"), "driver_door");
    assert.equal(guessKind("windshield"), "windshield");
  });

  it("skips fused and tripo generator names", () => {
    assert.equal(guessKind("tripo_part_29"), null);
    assert.equal(guessKind("Mesh_8"), null);
    assert.equal(guessKind("meshes[0]"), null);
    assert.equal(guessKind("mesh_node"), null);
  });

  it("leaves seats and steering unnamed so they claim as custom", () => {
    assert.equal(guessKind("driverseat"), null);
    assert.equal(guessKind("steering"), null);
    assert.equal(isUsefulName("driverseat"), true);
    assert.equal(isUsefulName("steering"), true);
    assert.equal(humanizeName("driverseat"), "Driverseat");
  });
});

describe("meshLabel", () => {
  it("prefers a node name over Mesh_8 geometry", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.name = "WHEEL_FL";
    mesh.geometry.name = "Mesh_8";
    assert.equal(meshLabel(mesh), "WHEEL_FL");
    assert.equal(bakePickable(mesh).name, "WHEEL_FL");
  });

  it("walks to a parent when the mesh name is junk", () => {
    const group = new THREE.Group();
    group.name = "hood";
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.name = "";
    mesh.geometry.name = "Mesh_8";
    group.add(mesh);
    assert.equal(meshLabel(mesh), "hood");
  });

  it("keeps a tripo node name when nothing better exists", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.name = "tripo_part_13";
    mesh.geometry.name = "meshes[0]";
    assert.equal(isJunkName("tripo_part_13"), true);
    assert.equal(meshLabel(mesh), "tripo_part_13");
  });
});
