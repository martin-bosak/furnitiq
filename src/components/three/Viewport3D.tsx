"use client";

import { Environment } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { sceneBounds, wallAngle, wallLength, pointOnWall } from "@/lib/scene/ops";
import { resolveRooms, type ResolvedRoom } from "@/lib/scene/rooms";
import type { Furniture, Opening, Room, Vec2, Wall } from "@/lib/scene/schema";
import { activeCamera, useEditor } from "@/store/editor";
import { viewportApi } from "./api";
import { useLibrary } from "@/store/library";
import { AssetModel } from "./AssetModel";
import { FurnitureModel } from "./FurnitureModel";
import { floorMaterial, material } from "./materials";
import { PathTracer } from "./PathTracer";
import { PostFX } from "./PostFX";

const HDRI = "/assets/hdri/autumn_park_1k.hdr";


const rad = (d: number) => (d * Math.PI) / 180;

export function Viewport3D() {
  const wrap = useRef<HTMLDivElement>(null);
  useLookControls(wrap);
  return (
    <div ref={wrap} tabIndex={0} className="h-full w-full cursor-grab outline-none active:cursor-grabbing">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: false, toneMapping: THREE.AgXToneMapping }}
        camera={{ fov: 65, near: 0.05, far: 200, position: [3, 1.6, 4] }}
      >
        <SceneContents />
        <CameraRig />
        <Exposure />
        <CaptureBridge />
        <Rendering />
      </Canvas>
    </div>
  );
}

function SceneContents() {
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  const b = sceneBounds(scene);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) + 4;
  const wallH = scene.walls.length ? Math.max(...scene.walls.map((w) => w.height)) : 2.7;
  // Floors and ceilings follow the walls: every closed wall loop is a room.
  const layout = resolveRooms(scene);

  return (
    <>
      <directionalLight
        position={[cx + 7, 9, cy - 9]}
        intensity={4.5}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-radius={6}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      >
        <object3D attach="target" position={[cx, 0, cy]} />
      </directionalLight>
      {layout.rooms.map((r) => (
        <pointLight key={r.id} position={[r.labelAt[0], wallH - 0.35, r.labelAt[1]]} intensity={1.2} distance={7} decay={2} color="#ffe7c7" />
      ))}

      {/* Real outdoor light + the view through the windows (CC0 HDRI). The apartment is upstairs, so no ground plane. */}
      <Environment files={HDRI} background />

      {layout.rooms.map((r) => (
        <RoomSurfaces key={r.id + r.polygon.length} room={r} height={wallH} />
      ))}
      {layout.zones.map((z) => (
        <FloorPatch key={z.id} polygon={z.polygon} floor={z.floor} />
      ))}

      {scene.walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={scene.openings.filter((o) => o.wallId === w.id)} selected={selection?.id === w.id} />
      ))}

      {scene.furniture.map((f) => (
        <FurnitureItem key={f.id} f={f} selected={selection?.id === f.id} />
      ))}
    </>
  );
}

function FurnitureItem({ f, selected }: { f: Furniture; selected: boolean }) {
  const select = useEditor((s) => s.select);
  // Generated model from My library, when linked and ready.
  const modelUrl = useLibrary((s) => {
    const a = f.assetId ? s.assets.find((x) => x.id === f.assetId) : undefined;
    return a?.status === "ready" ? a.model : undefined;
  });
  const [w, d, h] = f.size;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    select({ kind: "furniture", id: f.id });
  };
  return (
    <group position={[f.position[0], f.elevation, f.position[1]]} rotation-y={-rad(f.rotation)} onClick={onClick}>
      {modelUrl ? (
        <ModelBoundary fallback={<FurnitureModel f={f} />}>
          <Suspense fallback={<FurnitureModel f={f} />}>
            <AssetModel url={modelUrl} size={f.size} />
          </Suspense>
        </ModelBoundary>
      ) : (
        <FurnitureModel f={f} />
      )}
      {selected && (
        <lineSegments position={[0, h / 2, 0]} userData={{ helper: true }}>
          <edgesGeometry args={[new THREE.BoxGeometry(w + 0.04, h + 0.04, d + 0.04)]} />
          <lineBasicMaterial color="#7cf0ff" transparent opacity={0.9} />
        </lineSegments>
      )}
    </group>
  );
}

/** Falls back to the parametric model if a library file fails to load. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function shapeGeometry(polygon: Vec2[], flipY: boolean) {
  return new THREE.ShapeGeometry(new THREE.Shape(polygon.map(([x, y]) => new THREE.Vector2(x, flipY ? -y : y))));
}

function RoomSurfaces({ room, height }: { room: ResolvedRoom; height: number }) {
  const [floorGeo, ceilGeo] = useMemo(() => [shapeGeometry(room.polygon, true), shapeGeometry(room.polygon, false)], [room.polygon]);
  const mat = useMemo(() => floorMaterial(room.floor), [room.floor]);
  return (
    <>
      <mesh geometry={floorGeo} rotation-x={-Math.PI / 2} material={mat} receiveShadow />
      {room.ceiling && (
        <mesh geometry={ceilGeo} rotation-x={Math.PI / 2} position-y={height} material={material("plaster", "#f7f5f1", 3)} castShadow receiveShadow />
      )}
    </>
  );
}

/** Floor zone (e.g. kitchen tiles) drawn just above the room floor. */
function FloorPatch({ polygon, floor }: { polygon: Vec2[]; floor: Room["floor"] }) {
  const geo = useMemo(() => shapeGeometry(polygon, true), [polygon]);
  const mat = useMemo(() => floorMaterial(floor), [floor]);
  return <mesh geometry={geo} rotation-x={-Math.PI / 2} position-y={0.003} material={mat} receiveShadow />;
}

/** A wall is a set of boxes around its openings, plus window glass and frames. */
function WallMesh({ wall, openings, selected }: { wall: Wall; openings: Opening[]; selected: boolean }) {
  const select = useEditor((s) => s.select);
  const L = wallLength(wall);
  const t = wall.thickness;
  const H = wall.height;
  const mid = pointOnWall(wall, L / 2);
  const color = selected ? "#bdf6ff" : wall.color;

  const pieces = useMemo(() => {
    const out: { x: number; y: number; w: number; h: number }[] = [];
    const ops = [...openings].sort((a, b) => a.offset - b.offset);
    let cursor = -L / 2 - t / 2;
    for (const o of ops) {
      const x0 = o.offset - L / 2 - o.width / 2;
      const x1 = o.offset - L / 2 + o.width / 2;
      if (x0 > cursor) out.push({ x: (cursor + x0) / 2, y: H / 2, w: x0 - cursor, h: H });
      if (o.sill > 0) out.push({ x: (x0 + x1) / 2, y: o.sill / 2, w: o.width, h: o.sill });
      const top = o.sill + o.height;
      if (top < H) out.push({ x: (x0 + x1) / 2, y: (top + H) / 2, w: o.width, h: H - top });
      cursor = Math.max(cursor, x1);
    }
    const end = L / 2 + t / 2;
    if (end > cursor) out.push({ x: (cursor + end) / 2, y: H / 2, w: end - cursor, h: H });
    return out;
  }, [openings, L, t, H]);

  return (
    <group
      position={[mid[0], 0, mid[1]]}
      rotation-y={-wallAngle(wall)}
      onClick={(e) => {
        if (e.delta > 4) return;
        e.stopPropagation();
        select({ kind: "wall", id: wall.id });
      }}
    >
      {pieces.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 0]} material={material("plaster", color, Math.max(p.w, p.h))} castShadow receiveShadow>
          <boxGeometry args={[p.w, p.h, t]} />
        </mesh>
      ))}
      {openings.map((o) => {
        const x = o.offset - L / 2;
        const frame = "#a4552c";
        const ft = 0.05;
        if (o.kind === "window")
          return (
            <group key={o.id} position={[x, o.sill + o.height / 2, 0]}>
              <mesh material={material("glass", "#ffffff")}>
                <boxGeometry args={[o.width - ft, o.height - ft, 0.01]} />
              </mesh>
              {[
                [0, o.height / 2 - ft / 2, o.width, ft],
                [0, -o.height / 2 + ft / 2, o.width, ft],
                [-o.width / 2 + ft / 2, 0, ft, o.height],
                [o.width / 2 - ft / 2, 0, ft, o.height],
                [0, 0, ft * 0.6, o.height],
              ].map(([fx, fy, fw, fh], i) => (
                <mesh key={i} position={[fx, fy, 0]} material={material("wood", frame)} castShadow>
                  <boxGeometry args={[fw, fh, t * 0.6]} />
                </mesh>
              ))}
              <mesh position={[0, -o.height / 2 - 0.015, t / 2 + 0.02]} material={material("stone", "#e2ddd4")} castShadow receiveShadow>
                <boxGeometry args={[o.width + 0.1, 0.03, 0.06]} />
              </mesh>
            </group>
          );
        return (
          <group key={o.id} position={[x, 0, 0]}>
            {[
              [-o.width / 2 - 0.02, o.height / 2, 0.04, o.height],
              [o.width / 2 + 0.02, o.height / 2, 0.04, o.height],
              [0, o.height + 0.02, o.width + 0.08, 0.04],
            ].map(([fx, fy, fw, fh], i) => (
              <mesh key={i} position={[fx, fy, 0]} material={material("wood", frame)} castShadow>
                <boxGeometry args={[fw, fh, t + 0.02]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** Smoothly follows the active scene camera. */
function CameraRig() {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const first = useRef(true);
  useFrame((_, dt) => {
    const c = activeCamera(useEditor.getState().scene);
    if (!c) return;
    const p = new THREE.Vector3(c.position[0], c.height, c.position[1]);
    const t = new THREE.Vector3(c.target[0], c.targetHeight, c.target[1]);
    const k = first.current ? 1 : 1 - Math.exp(-dt * 14);
    first.current = false;
    camera.position.lerp(p, k);
    look.current.lerp(t, k);
    camera.lookAt(look.current);
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - c.fov) > 0.01) {
      cam.fov += (c.fov - cam.fov) * k;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

function CaptureBridge() {
  const { gl } = useThree();
  useEffect(() => {
    viewportApi.capture = async () => {
      // Hide the selection outline, wait two frames, then read the canvas as displayed
      // (includes post effects, or the path-traced image in photo mode).
      useEditor.getState().select(null);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return gl.domElement.toDataURL("image/jpeg", 0.92);
    };
    return () => {
      viewportApi.capture = null;
    };
  }, [gl]);
  return null;
}

/** Raster: ambient occlusion + tone mapping. Photo mode: progressive path tracing. */
function Rendering() {
  const photoMode = useEditor((s) => s.photoMode);
  const { scene } = useThree();
  useEffect(() => {
    // Raster environment light ignores walls, so keep it low indoors; the path tracer occludes it physically.
    scene.environmentIntensity = photoMode ? 1 : 0.45;
  }, [photoMode, scene]);
  if (photoMode) return <PathTracer />;
  return <PostFX />;
}

function Exposure() {
  const exposure = useEditor((s) => s.exposure);
  const photoMode = useEditor((s) => s.photoMode);
  const { gl } = useThree();
  useEffect(() => {
    // Indoor daylight is dim relative to the sky; the path-traced image needs more exposure.
    gl.toneMappingExposure = exposure * (photoMode ? 1.25 : 1);
  }, [gl, exposure, photoMode]);
  return null;
}

/** Drag to look around, wheel to dolly, WASD/QE to walk. Writes back to the scene camera. */
function useLookControls(wrap: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const st = () => useEditor.getState();
    let drag: { x: number; y: number; moved: boolean } | null = null;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    const keys = new Set<string>();
    let raf = 0;
    let last = performance.now();

    const update = (fn: (c: NonNullable<ReturnType<typeof activeCamera>>) => Partial<NonNullable<ReturnType<typeof activeCamera>>>) => {
      const c = activeCamera(st().scene);
      if (!c) return;
      st().transient((s) => ({ ...s, cameras: s.cameras.map((x) => (x.id === c.id ? { ...x, ...fn(x) } : x)) }));
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) {
        st().checkpoint();
        el.setPointerCapture(e.pointerId);
      }
      drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      update((c) => {
        const vx = c.target[0] - c.position[0];
        const vy = c.target[1] - c.position[1];
        const r = Math.max(0.5, Math.hypot(vx, vy));
        const a = Math.atan2(vy, vx) - dx * 0.0045;
        const pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(c.targetHeight - c.height, r) + dy * 0.0035));
        return {
          target: [c.position[0] + Math.cos(a) * r, c.position[1] + Math.sin(a) * r],
          targetHeight: c.height + Math.tan(pitch) * r,
        };
      });
    };
    const up = (e: PointerEvent) => {
      drag = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const walk = (fwd: number, side: number) =>
      update((c) => {
        const vx = c.target[0] - c.position[0];
        const vy = c.target[1] - c.position[1];
        const r = Math.hypot(vx, vy) || 1;
        const ux = vx / r;
        const uy = vy / r;
        const mx = ux * fwd - uy * side;
        const my = uy * fwd + ux * side;
        return { position: [c.position[0] + mx, c.position[1] + my], target: [c.target[0] + mx, c.target[1] + my] };
      });
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!wheelTimer) st().checkpoint();
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => (wheelTimer = null), 400);
      walk(-e.deltaY * 0.0025, 0);
    };
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!"wasdqe".includes(k) || e.ctrlKey || e.metaKey) return;
      if (!keys.size) st().checkpoint();
      keys.add(k);
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (keys.size) {
        const v = 1.8 * dt;
        const f = (keys.has("w") ? v : 0) - (keys.has("s") ? v : 0);
        const s = (keys.has("d") ? v : 0) - (keys.has("a") ? v : 0);
        if (f || s) walk(f, s);
        const h = (keys.has("e") ? v : 0) - (keys.has("q") ? v : 0);
        if (h) update((c) => ({ height: Math.max(0.3, c.height + h), targetHeight: c.targetHeight + h }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("keydown", kd);
    el.addEventListener("keyup", ku);
    el.addEventListener("blur", () => keys.clear());
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("keydown", kd);
      el.removeEventListener("keyup", ku);
    };
  }, [wrap]);
}

