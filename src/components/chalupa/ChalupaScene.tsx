"use client";

import { Environment, Html, OrbitControls, TransformControls, useGLTF, useProgress } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DRACO_URL, MODEL_URL, ROOMS, floorById, roomById, roomCenter, toThree, type Room } from "./data";
import { ITEMS, applyLayout, gizmo, itemInfo, itemTransform, setItemTransform } from "./items";
import { useEdit } from "./editStore";
import { useChalupa } from "./store";

const HDRI = "/assets/hdri/autumn_park_1k.hdr";
// House footprint in three.js coordinates (x, z), used to frame whole-house and floor views.
const HOUSE_CENTER = new THREE.Vector3(7.4, 2.5, 4.8);

export function ChalupaScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.AgXToneMapping, localClippingEnabled: true }}
      camera={{ fov: 45, near: 0.1, far: 400, position: [-14, 16, 26] }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.05;
      }}
      onPointerMissed={() => {
        if (Date.now() - gizmo.lastUp > 300) useEdit.getState().select(null);
      }}
    >
      <Suspense fallback={null}>
        <Environment files={HDRI} background={false} environmentIntensity={0.9} />
        <Lights />
        <House />
        <Ground />
        <RoomOverlay />
        <EditGizmo />
      </Suspense>
      <CameraRig />
      <SectionPlane />
    </Canvas>
  );
}

/** Loading pill, rendered in the page DOM (outside the canvas). */
export function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="glass rounded-full px-4 py-2 text-sm text-white/80">Načítám model chalupy… {Math.round(progress)} %</div>
    </div>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#e9f0ff", "#4a4236", 0.6]} />
      <directionalLight
        position={[-12, 22, 18]}
        intensity={3.2}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={80}
      >
        <object3D attach="target" position={[7.4, 0, 4.8]} />
      </directionalLight>
    </>
  );
}

function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[7.4, -0.38, 4.8]} receiveShadow>
      <circleGeometry args={[34, 64]} />
      <meshStandardMaterial color="#5d6b4a" roughness={1} />
    </mesh>
  );
}

// ---------------------------------------------------------------- cutaway shader
// Shared uniforms: walls between the camera and the point it orbits are cut away (x-ray),
// and back faces revealed by the section plane are drawn as a dark "poché" fill.
const CUT = {
  uCam: { value: new THREE.Vector3() },
  uTgt: { value: new THREE.Vector3() },
  uXray: { value: 0 },
  uPoche: { value: 0 },
  uCutY: { value: 1e6 },
};

function patchMaterial(m: THREE.Material, opts: { xray: boolean; poche: boolean }) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CUT);
    shader.vertexShader =
      "varying vec3 vWPos;\nvarying vec3 vWNrm;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vWNrm = normalize(mat3(modelMatrix) * objectNormal);",
      );
    const head = "uniform vec3 uCam;\nuniform vec3 uTgt;\nuniform float uXray;\nuniform float uPoche;\nuniform float uCutY;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n";
    const cut = opts.xray
      ? `
  if (uXray > 0.5 && abs(vWNrm.y) < 0.6) {
    vec3 d = uTgt - uCam; float L = length(d); vec3 n = d / L;
    float t = dot(vWPos - uCam, n);
    if (t > 0.0 && t < L - 0.8) {
      float r = length(vWPos - uCam - n * t);
      if (r < 0.35 + 1.3 * (t / L)) discard;
    }
  }`
      : "";
    shader.fragmentShader = head + shader.fragmentShader.replace("void main() {", "void main() {" + cut);
    if (opts.poche)
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\n  if (!gl_FrontFacing && uPoche > 0.5 && vWPos.y > uCutY - 0.45) gl_FragColor = vec4(0.16, 0.15, 0.15, 1.0);",
      );
  };
  m.customProgramCacheKey = () => `chalupa-${opts.xray ? 1 : 0}${opts.poche ? 1 : 0}`;
  m.needsUpdate = true;
}

type Cat = "house" | "roof" | "site" | "glass" | "furn" | "fixed";

// Hand-tuned colours for the big surfaces (the Blender materials are procedural and export as flat averages).
const COLORS: Record<string, string> = {
  wall_log: "#7a5233",
  facade_log: "#6e4a2e",
  chinking: "#b9ad97",
  floor_wood: "#b58a5c",
  beam: "#7d5636",
  ceil_boards_old: "#9a7048",
  ceil_planed: "#c49a6a",
  stair: "#bf8f5a",
  trim_wood: "#c39565",
  roof_dacora: "#34363b",
  roof_metal: "#3d3f44",
  roof_lining: "#b08a60",
  zinc: "#8d9196",
  fascia: "#5b4330",
  wall_plaster: "#ece8e0",
  facade_plaster: "#e4dfd5",
  floor_tile: "#d9d3c8",
};

function House() {
  const gltf = useGLTF(MODEL_URL, DRACO_URL);
  const layers = useChalupa((s) => s.layers);
  const view = useChalupa((s) => s.view);

  // Prepare materials once: double sided (so cut walls read as solid), cutaway shader, shadows.
  const groups = useMemo(() => {
    const g: Record<Cat, THREE.Object3D[]> = { house: [], roof: [], site: [], glass: [], furn: [], fixed: [] };
    const seen = new Set<THREE.Material>();
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const cat = ((o.userData.cat as Cat) ?? (o.parent?.userData.cat as Cat) ?? "house") as Cat;
      const top = o.userData.cat ? o : (o.parent ?? o);
      if (!g[cat].includes(top)) g[cat].push(top);
      if (cat === "furn" && top.userData.item && !ITEMS.has(top.userData.item)) {
        top.userData.orig = { pos: top.position.toArray(), rotY: top.rotation.y };
        ITEMS.set(top.userData.item, top);
      }
      mesh.castShadow = cat !== "glass";
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        const sm = m as THREE.MeshStandardMaterial;
        if (cat === "glass" || sm.transparent || sm.opacity < 1) {
          sm.transparent = true;
          sm.opacity = Math.min(sm.opacity, 0.25);
          sm.depthWrite = false;
          sm.side = THREE.DoubleSide;
          continue;
        }
        sm.side = THREE.DoubleSide;
        sm.envMapIntensity = 0.8;
        const c = COLORS[sm.name];
        if (c) {
          sm.color.set(c);
          sm.metalness = 0;
          sm.roughness = Math.max(sm.roughness, 0.55);
        }
        patchMaterial(sm, { xray: cat === "house" || cat === "roof", poche: cat !== "furn" && cat !== "fixed" });
      }
    });
    return g;
  }, [gltf]);

  const layout = useEdit((s) => s.layout);
  const edit = useEdit((s) => s.edit);
  const select = useEdit((s) => s.select);

  // Moved, rotated, deleted and duplicated furniture (saved arrangement).
  useEffect(() => {
    applyLayout(gltf.scene, layout, layers.furniture);
  }, [gltf, layout, layers.furniture]);

  useEffect(() => {
    for (const o of groups.fixed) o.visible = layers.furniture;
    for (const o of groups.site) o.visible = layers.site;
    // The roof only makes sense from outside: floor views cut it away anyway.
    for (const o of groups.roof) o.visible = layers.roof && view === 0;
  }, [groups, layers, view]);

  // Edit mode: click picks the nearest visible furniture item below the section plane.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!edit || e.delta > 4 || Date.now() - gizmo.lastUp < 300) return;
    e.stopPropagation();
    const cutY = CUT.uCutY.value + 1e-3;
    const hit = e.intersections.find((h) => h.point.y <= cutY && shown(h.object) && !isGlass(h.object));
    const item = hit ? itemOf(hit.object) : null;
    select(item ? itemInfo(item) : null);
  };
  const [hover, setHover] = useState(false);
  useEffect(() => {
    document.body.style.cursor = edit && hover ? "pointer" : "";
  }, [edit, hover]);
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!edit) return;
    const cutY = CUT.uCutY.value + 1e-3;
    const hit = e.intersections.find((h) => h.point.y <= cutY && shown(h.object) && !isGlass(h.object));
    setHover(!!(hit && itemOf(hit.object)));
  };

  return <primitive object={gltf.scene} onClick={onClick} onPointerMove={onMove} onPointerOut={() => setHover(false)} />;
}
useGLTF.preload(MODEL_URL, DRACO_URL);

function shown(o: THREE.Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
function isGlass(o: THREE.Object3D) {
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  return !!m && !Array.isArray(m) && m.transparent;
}
function itemOf(o: THREE.Object3D | null): THREE.Object3D | null {
  for (let p = o; p; p = p.parent) if (p.userData.item && p.userData.cat === "furn") return p;
  return null;
}

// ---------------------------------------------------------------- edit gizmo
function EditGizmo() {
  const edit = useEdit((s) => s.edit);
  const selected = useEdit((s) => s.selected);
  const tool = useEdit((s) => s.tool);
  const layout = useEdit((s) => s.layout);
  const obj = edit && selected ? ITEMS.get(selected.id) : undefined;
  const helper = useMemo(() => new THREE.Box3Helper(new THREE.Box3(), new THREE.Color("#7cf0ff")), []);
  useFrame(() => {
    if (obj) helper.box.setFromObject(obj);
    helper.visible = !!obj && obj.visible;
  });
  void layout; // re-render when the layout adds or removes copies
  if (!obj || !obj.visible) return null;
  const start = () => {
    obj.userData.dragFrom = itemTransform(obj);
  };
  const done = () => {
    gizmo.lastUp = Date.now();
    const t = itemTransform(obj);
    const f = obj.userData.dragFrom as ReturnType<typeof itemTransform> | undefined;
    if (f && f.rotY === t.rotY && f.pos.every((v, i) => Math.abs(v - t.pos[i]) < 1e-4)) return;
    useEdit.getState().commit((l) => setItemTransform(l, selected!.id, t));
  };
  return (
    <>
      <primitive object={helper} />
      <TransformControls
        object={obj}
        mode={tool === "move" ? "translate" : "rotate"}
        showX={tool === "move"}
        showY={tool === "rotate"}
        showZ={tool === "move"}
        space="world"
        size={0.9}
        translationSnap={0.05}
        rotationSnap={THREE.MathUtils.degToRad(15)}
        onMouseDown={start}
        onMouseUp={done}
      />
    </>
  );
}

/** Horizontal section at the chosen height of the current floor (global clipping). */
function SectionPlane() {
  const gl = useThree((s) => s.gl);
  const view = useChalupa((s) => s.view);
  const cut = useChalupa((s) => s.cut);
  useEffect(() => {
    if (view === 0) {
      gl.clippingPlanes = [];
      CUT.uPoche.value = 0;
      CUT.uCutY.value = 1e6;
    } else {
      const y = floorById(view).z + cut;
      gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), y)];
      CUT.uPoche.value = 1;
      CUT.uCutY.value = y;
    }
  }, [gl, view, cut]);
  return null;
}

// ---------------------------------------------------------------- room highlight + labels
function RoomOverlay() {
  const view = useChalupa((s) => s.view);
  const room = useChalupa((s) => s.room);
  const labels = useChalupa((s) => s.layers.labels);
  const setRoom = useChalupa((s) => s.setRoom);
  const active = room && view !== 0 ? roomById(room) : undefined;
  return (
    <>
      {active && <RoomHighlight r={active} />}
      {/* Labels stay mounted (drei Html owns a React root); visibility is CSS only. */}
      {ROOMS.map((r) => {
        const [x, y, z] = roomCenter(r);
        const show = labels && view === r.floor;
        return (
          <Html key={r.id} position={[x, y + 0.25, z]} center zIndexRange={[20, 0]} style={{ display: show ? "block" : "none" }}>
            <button
              onClick={() => setRoom(r.id === room ? null : r.id, r.floor)}
              className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-md transition ${
                r.id === room ? "border-[#7cf0ff]/70 bg-[#7cf0ff]/25 text-white" : "border-white/15 bg-black/45 text-white/85 hover:bg-black/65"
              }`}
            >
              <span className="text-white/50">{r.id}</span> {r.name}
            </button>
          </Html>
        );
      })}
    </>
  );
}

function RoomHighlight({ r }: { r: Room }) {
  const [x0, y0, x1, y1] = r.box;
  const z = floorById(r.floor).z;
  const w = x1 - x0;
  const d = y1 - y0;
  const [cx, cy, cz] = toThree((x0 + x1) / 2, (y0 + y1) / 2, z + 0.06);
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.02, d)), [w, d]);
  return (
    <group position={[cx, cy, cz]}>
      <mesh rotation-x={-Math.PI / 2} renderOrder={5}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color="#7cf0ff" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <lineSegments geometry={geo} renderOrder={6}>
        <lineBasicMaterial color="#7cf0ff" />
      </lineSegments>
    </group>
  );
}

// ---------------------------------------------------------------- camera
function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const nonce = useChalupa((s) => s.flyNonce);
  const xray = useChalupa((s) => s.layers.xray);
  const view = useChalupa((s) => s.view);
  const goal = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const { view, room } = useChalupa.getState();
    const c = controls.current;
    if (!c) return;
    const r = room ? roomById(room) : undefined;
    let tgt: THREE.Vector3;
    let dist: number;
    let elev: number;
    if (r) {
      const [x0, y0, x1, y1] = r.box;
      const [cx, cy, cz] = roomCenter(r);
      tgt = new THREE.Vector3(cx, cy + 0.9, cz);
      dist = Math.max(x1 - x0, y1 - y0) * 1.15 + 3.2;
      elev = 0.95;
    } else if (view) {
      tgt = new THREE.Vector3(HOUSE_CENTER.x, floorById(view).z + 0.8, HOUSE_CENTER.z);
      dist = 21;
      elev = 1.0;
    } else {
      tgt = HOUSE_CENTER.clone();
      dist = 30;
      elev = 0.5;
    }
    // Keep the current azimuth, so the camera flies rather than jumps around the house.
    const off = camera.position.clone().sub(c.target);
    const az = Math.atan2(off.x, off.z);
    const pos = new THREE.Vector3(
      tgt.x + Math.sin(az) * Math.cos(elev) * dist,
      tgt.y + Math.sin(elev) * dist,
      tgt.z + Math.cos(az) * Math.cos(elev) * dist,
    );
    goal.current = { pos, tgt };
  }, [nonce, camera]);

  useEffect(() => {
    // From outside the walls are the point, so x-ray only applies to floor and room views.
    CUT.uXray.value = xray && view !== 0 ? 1 : 0;
  }, [xray, view]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const g = goal.current;
    if (g) {
      const k = 1 - Math.exp(-dt * 4);
      camera.position.lerp(g.pos, k);
      c.target.lerp(g.tgt, k);
      if (camera.position.distanceTo(g.pos) < 0.02 && c.target.distanceTo(g.tgt) < 0.02) goal.current = null;
      c.update();
    }
    CUT.uCam.value.copy(camera.position);
    CUT.uTgt.value.copy(c.target);
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={HOUSE_CENTER.toArray() as [number, number, number]}
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI * 0.495}
      minDistance={2}
      maxDistance={70}
      onStart={() => (goal.current = null)}
    />
  );
}

