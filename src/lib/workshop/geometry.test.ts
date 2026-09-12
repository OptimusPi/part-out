import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import {
  bakePickable,
  extractFaces,
  extractMeshes,
  fitAndCenter,
  guessDoorFromSideView,
  nearestVertex,
  orderPolygon,
  placeDot,
  pointInVolume,
  volumeFromDots,
} from "./geometry.ts";
import type { CornerDot } from "./types.ts";

function dot(world: [number, number, number], meshUuid = "m"): CornerDot {
  return { id: world.join(","), world, vertexIndex: 0, meshUuid };
}

describe("orderPolygon", () => {
  it("orders four square corners around the centroid", () => {
    const pts = [
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(-1, -1, 0),
      new THREE.Vector3(1, -1, 0),
      new THREE.Vector3(-1, 1, 0),
    ];
    const ordered = orderPolygon(pts);
    const angles = ordered.map((p) => Math.atan2(p.y, p.x));
    for (let i = 1; i < angles.length; i++) {
      assert.ok(angles[i] >= angles[i - 1] - 1e-9);
    }
  });
});

describe("volumeFromDots + extractFaces", () => {
  it("cuts only the +Z face of a unit box with a shallow quad", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    const pick = bakePickable(mesh);
    const dots: CornerDot[] = [
      dot([0.5, 0.5, 0.5]),
      dot([-0.5, 0.5, 0.5]),
      dot([-0.5, -0.5, 0.5]),
      dot([0.5, -0.5, 0.5]),
    ];
    const vol = volumeFromDots(dots, "quad", 0.12, new THREE.Vector3(0, 0, 0));
    assert.ok(vol);
    const ex = extractFaces([pick], [vol], new Set());
    assert.equal(ex.faceCount, 2);
    for (let i = 2; i < ex.positions.length; i += 3) {
      assert.ok(ex.positions[i] > 0.4, "extracted verts should sit on +Z");
    }
  });

  it("does not claim the far side with a shallow cut", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    const pick = bakePickable(mesh);
    const dots: CornerDot[] = [
      dot([0.5, 0.5, 0.5]),
      dot([-0.5, 0.5, 0.5]),
      dot([-0.5, -0.5, 0.5]),
      dot([0.5, -0.5, 0.5]),
    ];
    const vol = volumeFromDots(dots, "quad", 0.12, new THREE.Vector3(0, 0, 0));
    assert.ok(vol);
    const far = new THREE.Vector3(0, 0, -0.5);
    assert.equal(pointInVolume(far, vol), false);
    const ex = extractFaces([pick], [vol], new Set());
    assert.equal(ex.faceCount, 2);
  });

  it("claims a whole mesh when asked", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    const pick = bakePickable(mesh);
    const ex = extractMeshes([pick], new Set([pick.uuid]), new Set());
    assert.equal(ex.faceCount, 12);
  });

  it("snaps to a real vertex, not the hit point", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    const pick = bakePickable(mesh);
    const hit = nearestVertex([pick], new THREE.Vector3(0.49, 0.48, 0.51), 0.2);
    assert.ok(hit);
    assert.equal(hit.world[0], 0.5);
    assert.equal(hit.world[1], 0.5);
    assert.equal(hit.world[2], 0.5);
  });
});

describe("fitAndCenter", () => {
  it("sits the model on y = 0 after scaling", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(0, 4, 0);
    const root = new THREE.Group();
    root.add(mesh);
    fitAndCenter(root, 4);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    assert.ok(Math.abs(box.min.y) < 1e-5, `min.y should be 0, got ${box.min.y}`);
  });
});

describe("placeDot", () => {
  it("caps at needed and replaces the nearest corner", () => {
    const a = dot([0, 0, 0], "a");
    a.id = "a";
    const b = dot([1, 0, 0], "b");
    b.id = "b";
    const c = dot([1, 1, 0], "c");
    c.id = "c";
    const d = dot([0, 1, 0], "d");
    d.id = "d";
    const four = placeDot(placeDot(placeDot(placeDot([], a, 4), b, 4), c, 4), d, 4);
    assert.equal(four.length, 4);
    const extra = dot([0.1, 0, 0], "e");
    extra.id = "e";
    const next = placeDot(four, extra, 4);
    assert.equal(next.length, 4);
    assert.equal(next[0].id, "e");
    assert.deepEqual(
      next.slice(1).map((x) => x.id),
      ["b", "c", "d"],
    );
  });
});

describe("guessDoorFromSideView", () => {
  it("drops four snaps on one long side of a car-shaped box", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 3));
    mesh.updateMatrixWorld(true);
    const pick = bakePickable(mesh);
    const dots = guessDoorFromSideView([pick], "x", 2);
    assert.ok(dots.length >= 3, `expected ≥3 dots, got ${dots.length}`);
    const xs = dots.map((d) => d.world[0]);
    const sameSide = xs.every((x) => Math.abs(x - xs[0]) < 0.15);
    assert.ok(sameSide, "door poster should stay on one L/R side");
    const zs = dots.map((d) => d.world[2]);
    assert.ok(Math.max(...zs) - Math.min(...zs) > 0.2, "door should have length");
  });
});
