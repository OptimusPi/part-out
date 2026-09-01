import { useEffect, useMemo, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { leftoverNow, getSceneRoot, getWorldVerts, getModelCenter, getPickables, useStore } from "@/lib/workshop/store";
import {
  growVolume,
  makeGeom,
  meshClaimState,
  mirrorVolume,
  nearestVertex,
  orderPolygon,
  volumeFromDots,
  volumeQuaternion,
} from "@/lib/workshop/geometry";
import { meshLabel } from "@/lib/workshop/garage";
import { PART_META } from "@/lib/workshop/types";

const pickMat = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
});

function useBootGarage() {
  const bootGarage = useStore((s) => s.bootGarage);
  const rev = useStore((s) => s.modelRevision);
  const booted = useRef(false);
  useEffect(() => {
    if (!booted.current && rev === 0) {
      booted.current = true;
      bootGarage();
    }
  }, [rev, bootGarage]);
}

function FrameCamera() {
  const { camera, controls } = useThree();
  const rev = useStore((s) => s.modelRevision);
  const size = useStore((s) => s.modelSize);
  useEffect(() => {
    if (rev === 0) return;
    const dist = Math.max(5.2, size * 1.5);
    camera.position.set(dist * 0.74, dist * 0.4, dist * 0.9);
    camera.near = 0.05;
    camera.far = 90;
    camera.updateProjectionMatrix();
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (orbit?.target) {
      orbit.target.set(0, Math.min(1.15, size * 0.22), 0);
      orbit.update?.();
    } else {
      camera.lookAt(0, size * 0.2, 0);
    }
  }, [rev, size, camera, controls]);
  return null;
}

function StudioEnv() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 1.15;
    room.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return (
    <>
      <hemisphereLight args={["#f4f1ea", "#22242a", 1.05]} />
      <directionalLight position={[6, 10, 4]} intensity={1.85} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, 4, -6]} intensity={0.7} color="#c5ccd6" />
      <directionalLight position={[0, 3, 7]} intensity={0.55} color="#fff4e6" />
    </>
  );
}

function SourceModel() {
  const rev = useStore((s) => s.modelRevision);
  const parts = useStore((s) => s.parts);
  const root = getSceneRoot();
  const tool = useStore((s) => s.tool);
  const pickMode = useStore((s) => s.pickMode);
  const pickVertex = useStore((s) => s.pickVertex);
  const pickMesh = useStore((s) => s.pickMesh);
  const setHoverSnap = useStore((s) => s.setHoverSnap);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!root) return;
    const claimed = useStore.getState().claimedFaces;
    const picks = getPickables();
    const byUuid = new Map(picks.map((p) => [p.uuid, p]));
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!m.userData.origMat) m.userData.origMat = m.material;
      const p = byUuid.get(m.uuid);
      const state = p ? meshClaimState(p, claimed) : "none";
      if (state === "none") {
        m.material = m.userData.origMat as THREE.Material;
      } else {
        m.material = pickMat;
      }
    });
  }, [root, rev, parts]);

  const isClick = (e: ThreeEvent<PointerEvent>) => {
    const d = down.current;
    down.current = null;
    if (!d) return false;
    const dx = e.nativeEvent.clientX - d.x;
    const dy = e.nativeEvent.clientY - d.y;
    return dx * dx + dy * dy < 36;
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    down.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (tool !== "place") return;
    if (!isClick(e)) return;
    e.stopPropagation();
    if (pickMode === "mesh") {
      const mesh = e.object as THREE.Mesh;
      pickMesh(mesh.uuid, meshLabel(mesh));
      return;
    }
    pickVertex(e.point.clone());
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (tool !== "place" || pickMode !== "verts") return;
    const max = Math.max(0.35, useStore.getState().modelSize * 0.08);
    setHoverSnap(nearestVertex(getPickables(), e.point, max));
  };

  if (!root || rev === 0) return null;
  return (
    <primitive
      object={root}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerMove={onPointerMove}
      onPointerOut={() => setHoverSnap(null)}
    />
  );
}

function WireOverlay() {
  const rev = useStore((s) => s.modelRevision);
  const show = useStore((s) => s.showWire);
  const geom = useMemo(() => {
    const segs: number[] = [];
    for (const p of getPickables()) {
      for (let f = 0; f < p.faceCount; f++) {
        let i0: number, i1: number, i2: number;
        if (p.index) {
          i0 = p.index[f * 3];
          i1 = p.index[f * 3 + 1];
          i2 = p.index[f * 3 + 2];
        } else {
          i0 = f * 3;
          i1 = f * 3 + 1;
          i2 = f * 3 + 2;
        }
        const ax = p.worldPositions[i0 * 3],
          ay = p.worldPositions[i0 * 3 + 1],
          az = p.worldPositions[i0 * 3 + 2];
        const bx = p.worldPositions[i1 * 3],
          by = p.worldPositions[i1 * 3 + 1],
          bz = p.worldPositions[i1 * 3 + 2];
        const cx = p.worldPositions[i2 * 3],
          cy = p.worldPositions[i2 * 3 + 1],
          cz = p.worldPositions[i2 * 3 + 2];
        segs.push(ax, ay, az, bx, by, bz, bx, by, bz, cx, cy, cz, cx, cy, cz, ax, ay, az);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    return g;
  }, [rev]);

  useEffect(() => () => geom.dispose(), [geom]);
  if (!show || geom.attributes.position.count === 0) return null;
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color="#6d7380" transparent opacity={0.28} />
    </lineSegments>
  );
}

function VertexCloud() {
  const rev = useStore((s) => s.modelRevision);
  const show = useStore((s) => s.showVerts);
  const tool = useStore((s) => s.tool);
  const pickMode = useStore((s) => s.pickMode);
  const verts = useMemo(() => getWorldVerts(), [rev]);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    return g;
  }, [verts]);
  useEffect(() => () => geom.dispose(), [geom]);
  if (!show || tool !== "place" || pickMode !== "verts" || verts.length === 0) return null;
  return (
    <points geometry={geom}>
      <pointsMaterial color="#eceae4" size={0.04} sizeAttenuation />
    </points>
  );
}

function DotsAndVolume() {
  const dots = useStore((s) => s.dots);
  const hover = useStore((s) => s.hoverSnap);
  const depth = useStore((s) => s.depth);
  const growAmt = useStore((s) => s.grow);
  const kind = useStore((s) => s.activeKind);
  const showVol = useStore((s) => s.showVolume);
  const autoMirror = useStore((s) => s.autoMirror);
  const lrAxis = useStore((s) => s.lrAxis);
  const pickMode = useStore((s) => s.pickMode);
  const selectedMeshUuid = useStore((s) => s.selectedMeshUuid);
  const rev = useStore((s) => s.modelRevision);
  const meta = PART_META[kind];
  const center = getModelCenter();

  const vols = useMemo(() => {
    if (pickMode !== "verts" || dots.length < 2) return [];
    let v = volumeFromDots(dots, meta.mode, depth, center);
    if (!v) return [];
    v = growVolume(v, growAmt);
    const list = [v];
    if (autoMirror && meta.mirror) list.push(mirrorVolume(v, lrAxis));
    return list;
  }, [dots, depth, growAmt, kind, autoMirror, lrAxis, meta, center, pickMode]);

  const loop = useMemo(() => {
    if (dots.length < 2) return null;
    const pts = orderPolygon(dots.map((d) => new THREE.Vector3(...d.world)));
    const g = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: meta.color }));
    return l;
  }, [dots, meta.color]);

  const selectedHighlight = useMemo(() => {
    if (!selectedMeshUuid) return null;
    const p = getPickables().find((m) => m.uuid === selectedMeshUuid);
    if (!p) return null;
    const segs: number[] = [];
    for (let f = 0; f < p.faceCount; f++) {
      let i0: number, i1: number, i2: number;
      if (p.index) {
        i0 = p.index[f * 3];
        i1 = p.index[f * 3 + 1];
        i2 = p.index[f * 3 + 2];
      } else {
        i0 = f * 3;
        i1 = f * 3 + 1;
        i2 = f * 3 + 2;
      }
      const ax = p.worldPositions[i0 * 3],
        ay = p.worldPositions[i0 * 3 + 1],
        az = p.worldPositions[i0 * 3 + 2];
      const bx = p.worldPositions[i1 * 3],
        by = p.worldPositions[i1 * 3 + 1],
        bz = p.worldPositions[i1 * 3 + 2];
      const cx = p.worldPositions[i2 * 3],
        cy = p.worldPositions[i2 * 3 + 1],
        cz = p.worldPositions[i2 * 3 + 2];
      segs.push(ax, ay, az, bx, by, bz, bx, by, bz, cx, cy, cz, cx, cy, cz, ax, ay, az);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    return g;
  }, [selectedMeshUuid, rev]);

  return (
    <group>
      {dots.map((d) => (
        <mesh key={d.id} position={d.world}>
          <sphereGeometry args={[0.05, 14, 14]} />
          <meshStandardMaterial color={meta.color} emissive={meta.color} emissiveIntensity={0.55} roughness={0.35} />
        </mesh>
      ))}
      {hover && pickMode === "verts" && !dots.some((d) => d.id === hover.id) && (
        <mesh position={hover.world}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshBasicMaterial color="#eceae4" transparent opacity={0.55} />
        </mesh>
      )}
      {loop && <primitive object={loop} />}
      {showVol &&
        vols.map((v, i) =>
          v.mode === "wheel" ? (
            <group key={i} position={v.center.toArray()} quaternion={volumeQuaternion(v)}>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[v.radius ?? v.halfY, v.radius ?? v.halfY, v.halfX * 2, 24]} />
                <meshBasicMaterial color={meta.color} transparent opacity={0.14} depthWrite={false} wireframe />
              </mesh>
            </group>
          ) : (
            <mesh key={i} position={v.center.toArray()} quaternion={volumeQuaternion(v)}>
              <boxGeometry args={[v.halfX * 2, v.halfY * 2, v.halfZ * 2]} />
              <meshBasicMaterial color={meta.color} transparent opacity={0.14} depthWrite={false} wireframe />
            </mesh>
          ),
        )}
      {selectedHighlight && (
        <lineSegments geometry={selectedHighlight}>
          <lineBasicMaterial color={meta.color} />
        </lineSegments>
      )}
    </group>
  );
}

function PartsView() {
  const parts = useStore((s) => s.parts);
  const explode = useStore((s) => s.explode);
  const claimed = useStore((s) => s.claimedFaces);
  const rev = useStore((s) => s.modelRevision);
  const leftover = useMemo(() => leftoverNow(), [parts, claimed, rev]);

  return (
    <group>
      {parts.map((p) => {
        const geom = makeGeom({
          positions: p.positions,
          normals: p.normals,
          uvs: p.uvs,
          faceCount: p.faceCount,
          vertexCount: p.vertexCount,
          centroid: new THREE.Vector3(...p.centroid),
          claimed: new Set(),
        });
        const dir = new THREE.Vector3(...p.centroid);
        if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
        dir.normalize().multiplyScalar(explode * 1.15);
        const glass = p.kind.includes("window") || p.kind === "windshield";
        return (
          <mesh key={p.id} geometry={geom} position={dir.toArray()}>
            <meshStandardMaterial
              color={p.color}
              roughness={glass ? 0.08 : 0.42}
              metalness={glass ? 0.12 : 0.2}
              transparent={glass}
              opacity={glass ? 0.55 : 1}
            />
          </mesh>
        );
      })}
      {leftover.faceCount > 0 && parts.length > 0 && (
        <mesh geometry={makeGeom(leftover)}>
          <meshStandardMaterial color="#8a8f98" roughness={0.52} metalness={0.12} />
        </mesh>
      )}
    </group>
  );
}

export function WorkshopScene() {
  useBootGarage();
  const tool = useStore((s) => s.tool);
  return (
    <>
      <color attach="background" args={["#0c0d0f"]} />
      <fog attach="fog" args={["#0c0d0f", 18, 42]} />
      <StudioEnv />
      <FrameCamera />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.495}
        minDistance={1.4}
        maxDistance={18}
        enablePan={tool === "orbit"}
      />
      <group>
        <SourceModel />
        <WireOverlay />
        <PartsView />
        <VertexCloud />
        <DotsAndVolume />
      </group>
      <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={12} blur={2.2} far={4} />
      <Grid
        position={[0, -0.001, 0]}
        args={[16, 16]}
        cellSize={0.25}
        cellThickness={0.55}
        cellColor="#1c1e24"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#2a2d34"
        fadeDistance={18}
        fadeStrength={1.1}
        infiniteGrid
      />
    </>
  );
}
