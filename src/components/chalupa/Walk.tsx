"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { roomAt } from "./data";
import { useChalupa } from "./store";
import { EYE, W, placeWalker, stepWalk } from "./walkPhysics";

/** Walk mode: first-person camera at eye level, keyboard and mouse look; physics in walkPhysics.ts. */
export function WalkController() {
  const mode = useChalupa((s) => s.mode);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const marker = useMemo(() => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.22, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#7cf0ff", transparent: true, opacity: 0.85, depthWrite: false }),
    );
    m.renderOrder = 10;
    m.visible = false;
    return m;
  }, []);
  // Fly from the orbit camera down to eye level when walk mode starts.
  const trans = useMemo(() => ({ t: 1, p0: new THREE.Vector3(), q0: new THREE.Quaternion(), f0: 45 }), []);
  const hud = useMemo(() => ({ t: 0 }), []);

  useEffect(() => {
    if (mode !== "walk") {
      W.keys.clear();
      W.target = null;
      if (camera.near !== 0.1) {
        camera.near = 0.1;
        camera.fov = 45;
        camera.updateProjectionMatrix();
      }
      return;
    }
    placeWalker(useChalupa.getState().room);
    trans.t = 0;
    trans.p0.copy(camera.position);
    trans.q0.copy(camera.quaternion);
    trans.f0 = camera.fov;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
  }, [mode, camera, trans]);

  // Keyboard, mouse look, zoom.
  useEffect(() => {
    if (mode !== "walk") return;
    const el = gl.domElement;
    const KEYS: Record<string, string> = {
      KeyW: "f",
      ArrowUp: "f",
      KeyS: "b",
      ArrowDown: "b",
      KeyA: "l",
      KeyD: "r",
      ArrowLeft: "tl",
      ArrowRight: "tr",
      KeyQ: "tl",
      KeyE: "tr",
      ShiftLeft: "run",
      ShiftRight: "run",
    };
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.code === "Escape") {
        useChalupa.getState().setMode("orbit");
        return;
      }
      const k = KEYS[e.code];
      if (!k || e.ctrlKey || e.metaKey) return;
      if (e.code.startsWith("Arrow")) e.preventDefault();
      W.keys.add(k);
      if (k !== "run") W.target = null;
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) W.keys.delete(k);
    };
    const blur = () => W.keys.clear();
    let ptr: { id: number; x: number; y: number; moved: boolean } | null = null;
    const pdown = (e: PointerEvent) => {
      if (!ptr) ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    };
    const pmove = (e: PointerEvent) => {
      if (!ptr || e.pointerId !== ptr.id || trans.t < 1) return;
      const dx = e.clientX - ptr.x;
      const dy = e.clientY - ptr.y;
      if (!ptr.moved && Math.hypot(dx, dy) < 5) return;
      ptr.moved = true;
      W.dragging = true;
      // Drag the view: moving the mouse right turns the scene with it.
      W.yaw += dx * 0.0042;
      W.pitch = THREE.MathUtils.clamp(W.pitch + dy * 0.0042, -1.3, 1.3);
      ptr.x = e.clientX;
      ptr.y = e.clientY;
    };
    const pup = (e: PointerEvent) => {
      if (ptr && e.pointerId === ptr.id) {
        ptr = null;
        W.dragging = false;
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.fov = THREE.MathUtils.clamp(camera.fov + Math.sign(e.deltaY) * 3, 40, 85);
      camera.updateProjectionMatrix();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    el.addEventListener("pointerdown", pdown);
    window.addEventListener("pointermove", pmove);
    window.addEventListener("pointerup", pup);
    window.addEventListener("pointercancel", pup);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      el.removeEventListener("pointerdown", pdown);
      window.removeEventListener("pointermove", pmove);
      window.removeEventListener("pointerup", pup);
      window.removeEventListener("pointercancel", pup);
      el.removeEventListener("wheel", wheel);
      W.keys.clear();
    };
  }, [mode, gl, camera, trans]);

  useFrame((_, rawDt) => {
    if (useChalupa.getState().mode !== "walk") {
      marker.visible = false;
      return;
    }
    const dt = Math.min(rawDt, 0.05);
    stepWalk(dt, trans.t >= 1);

    // Camera: the eye follows steps smoothly.
    const pos = W.pos;
    W.eyeY += (pos.y - W.eyeY) * Math.min(1, dt * 12);
    if (Math.abs(pos.y - W.eyeY) > 1.2) W.eyeY = pos.y;
    const p1 = new THREE.Vector3(pos.x, W.eyeY + EYE, pos.z);
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(W.pitch, W.yaw, 0, "YXZ"));
    if (trans.t < 1) {
      trans.t = Math.min(1, trans.t + dt / 1.3);
      const e = trans.t < 0.5 ? 2 * trans.t * trans.t : 1 - (-2 * trans.t + 2) ** 2 / 2;
      camera.position.lerpVectors(trans.p0, p1, e);
      camera.quaternion.copy(trans.q0).slerp(q1, e);
      camera.fov = trans.f0 + (70 - trans.f0) * e;
      camera.updateProjectionMatrix();
    } else {
      camera.position.copy(p1);
      camera.quaternion.copy(q1);
    }

    marker.visible = !!W.target;
    if (W.target) marker.position.set(W.target.x, W.target.y + 0.02, W.target.z);

    // Room readout for the HUD and the room list.
    hud.t += dt;
    if (hud.t > 0.2) {
      hud.t = 0;
      const id = (pos.y > -0.2 ? roomAt(pos.x, pos.z, W.floor) : undefined)?.id ?? null;
      if (useChalupa.getState().walkRoom !== id) useChalupa.getState().setWalkRoom(id);
    }
  });

  return <primitive object={marker} />;
}
