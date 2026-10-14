"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

/**
 * A generated library model, fitted to the furniture's [width, depth, height]:
 * centered on the footprint, bottom on the floor, front facing +z (same local
 * frame as the parametric models).
 */
export function AssetModel({ url, size }: { url: string; size: [number, number, number] }) {
  const gltf = useGLTF(url);
  const object = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const dim = box.getSize(new THREE.Vector3());
    const [w, d, h] = size;
    const wrap = new THREE.Group();
    // Per-axis fit: the furniture size is authoritative (measured or from the product page).
    const s = new THREE.Vector3(w / (dim.x || 1), h / (dim.y || 1), d / (dim.z || 1));
    // Box is measured with the root's own offset p0; rescale around it, then move bottom-center to the origin.
    const p0 = root.position.clone();
    root.scale.multiply(s);
    root.position.set(
      -((box.min.x + box.max.x) / 2 - p0.x) * s.x,
      -(box.min.y - p0.y) * s.y,
      -((box.min.z + box.max.z) / 2 - p0.z) * s.z,
    );
    wrap.add(root);
    return wrap;
  }, [gltf, size]);
  return <primitive object={object} />;
}
