"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sceneBounds, wallAngle, wallLength, pointOnWall } from "@/lib/scene/ops";
import type { Furniture, Opening, Room, Wall } from "@/lib/scene/schema";
import { activeCamera, useEditor } from "@/store/editor";
import { viewportApi } from "./api";
import { FurnitureModel } from "./FurnitureModel";
import { floorTexture } from "./textures";


const rad = (d: number) => (d * Math.PI) / 180;

export function Viewport3D() {
  const wrap = useRef<HTMLDivElement>(null);
  useLookControls(wrap);
  return (
    <div ref={wrap} tabIndex={0} className="h-full w-full cursor-grab outline-none active:cursor-grabbing">
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        camera={{ fov: 65, near: 0.05, far: 200, position: [3, 1.6, 4] }}
      >
        <color attach="background" args={["#d6e6f3"]} />
        <SceneContents />
        <CameraRig />
        <CaptureBridge />
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
  const wallH = scene.walls[0]?.height ?? 2.7;

  return (
    <>
      <hemisphereLight args={["#fff6ea", "#6b5a48", 0.55]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[cx + 7, 9, cy - 9]}
        intensity={3.2}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      >
        <object3D attach="target" position={[cx, 0, cy]} />
      </directionalLight>
      {scene.rooms.map((r) => {
        const [x, y] = centroid(r);
        return <pointLight key={r.id} position={[x, wallH - 0.35, y]} intensity={2.2} distance={7} decay={2} color="#ffe7c7" />;
      })}

      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#fff4e6" position={[0, 5, -6]} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#dfefff" position={[6, 3, 0]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer form="circle" intensity={1.5} color="#ffffff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={6} />
      </Environment>

      {/* Ground outside the apartment */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.01, cy]} receiveShadow>
        <planeGeometry args={[span * 4, span * 4]} />
        <meshStandardMaterial color="#b9c2a8" roughness={1} />
      </mesh>

      {scene.rooms.map((r) => (
        <RoomSurfaces key={r.id} room={r} height={wallH} />
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
  const [w, d, h] = f.size;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    select({ kind: "furniture", id: f.id });
  };
  return (
    <group position={[f.position[0], f.elevation, f.position[1]]} rotation-y={-rad(f.rotation)} onClick={onClick}>
      <FurnitureModel f={f} />
      {selected && (
        <lineSegments position={[0, h / 2, 0]} userData={{ helper: true }}>
          <edgesGeometry args={[new THREE.BoxGeometry(w + 0.04, h + 0.04, d + 0.04)]} />
          <lineBasicMaterial color="#7cf0ff" transparent opacity={0.9} />
        </lineSegments>
      )}
    </group>
  );
}

function RoomSurfaces({ room, height }: { room: Room; height: number }) {
  const [floorGeo, ceilGeo] = useMemo(() => {
    const fs = new THREE.Shape(room.polygon.map(([x, y]) => new THREE.Vector2(x, -y)));
    const cs = new THREE.Shape(room.polygon.map(([x, y]) => new THREE.Vector2(x, y)));
    return [new THREE.ShapeGeometry(fs), new THREE.ShapeGeometry(cs)];
  }, [room.polygon]);
  const tex = useMemo(() => floorTexture(room.floor), [room.floor]);
  return (
    <>
      <mesh geometry={floorGeo} rotation-x={-Math.PI / 2} receiveShadow>
        <meshStandardMaterial map={tex} roughness={room.floor === "tile" ? 0.25 : 0.55} />
      </mesh>
      <mesh geometry={ceilGeo} rotation-x={Math.PI / 2} position-y={height} castShadow receiveShadow>
        <meshStandardMaterial color="#f7f5f1" roughness={0.95} />
      </mesh>
    </>
  );
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
        <mesh key={i} position={[p.x, p.y, 0]} castShadow receiveShadow>
          <boxGeometry args={[p.w, p.h, t]} />
          <meshStandardMaterial color={color} roughness={0.92} />
        </mesh>
      ))}
      {openings.map((o) => {
        const x = o.offset - L / 2;
        const frame = "#e9e6e0";
        const ft = 0.05;
        if (o.kind === "window")
          return (
            <group key={o.id} position={[x, o.sill + o.height / 2, 0]}>
              <mesh>
                <boxGeometry args={[o.width - ft, o.height - ft, 0.01]} />
                <meshPhysicalMaterial color="#cfe8ff" transparent opacity={0.12} roughness={0.02} metalness={0} />
              </mesh>
              {[
                [0, o.height / 2 - ft / 2, o.width, ft],
                [0, -o.height / 2 + ft / 2, o.width, ft],
                [-o.width / 2 + ft / 2, 0, ft, o.height],
                [o.width / 2 - ft / 2, 0, ft, o.height],
                [0, 0, ft * 0.6, o.height],
              ].map(([fx, fy, fw, fh], i) => (
                <mesh key={i} position={[fx, fy, 0]} castShadow>
                  <boxGeometry args={[fw, fh, t * 0.6]} />
                  <meshStandardMaterial color={frame} roughness={0.5} />
                </mesh>
              ))}
              <mesh position={[0, -o.height / 2 - 0.015, t / 2 + 0.02]} castShadow receiveShadow>
                <boxGeometry args={[o.width + 0.1, 0.03, 0.06]} />
                <meshStandardMaterial color={frame} roughness={0.5} />
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
              <mesh key={i} position={[fx, fy, 0]} castShadow>
                <boxGeometry args={[fw, fh, t + 0.02]} />
                <meshStandardMaterial color={frame} roughness={0.5} />
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
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    viewportApi.capture = () => {
      const hidden: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.userData.helper && o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      });
      gl.render(scene, camera);
      const url = gl.domElement.toDataURL("image/jpeg", 0.92);
      hidden.forEach((o) => (o.visible = true));
      return url;
    };
    return () => {
      viewportApi.capture = null;
    };
  }, [gl, scene, camera]);
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

function centroid(r: Room): [number, number] {
  const n = r.polygon.length;
  return [r.polygon.reduce((s, p) => s + p[0], 0) / n, r.polygon.reduce((s, p) => s + p[1], 0) / n];
}

