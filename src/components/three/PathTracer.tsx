"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { DenoiseMaterial, WebGLPathTracer } from "three-gpu-pathtracer";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { useEditor } from "@/store/editor";

/** Samples per pixel after which we stop to spare the GPU. */
export const MAX_SAMPLES = 600;

/**
 * Progressive GPU path tracing of the same three.js scene (real light
 * transport: bounce light, soft shadows, light through windows).
 * Takes over rendering while mounted (useFrame priority 1).
 */
export function PathTracer() {
  const { gl, scene, camera } = useThree();
  const sceneData = useEditor((s) => s.scene);
  const lastCam = useRef(new THREE.Matrix4());
  const lastReport = useRef(0);
  const ready = useRef(false);

  const pt = useMemo(() => {
    const p = new WebGLPathTracer(gl);
    p.bounces = 6;
    p.transmissiveBounces = 6;
    p.filterGlossyFactor = 0.5;
    p.minSamples = 1;
    p.renderDelay = 0;
    p.fadeDuration = 250;
    p.tiles.set(2, 2);
    // Edge-aware denoise on output: clean image after far fewer samples.
    const denoise = new FullScreenQuad(new DenoiseMaterial({ blending: THREE.NoBlending }));
    const mat = denoise.material as DenoiseMaterial & { map: THREE.Texture | null; sigma: number; threshold: number };
    p.renderToCanvasCallback = (target: THREE.WebGLRenderTarget, renderer: THREE.WebGLRenderer) => {
      mat.map = target.texture;
      // Strong while noisy, gentle once converged to keep texture detail.
      // The threshold is in linear HDR radiance (pre tone mapping) and must exceed the noise
      // amplitude, otherwise noise is preserved as "edges".
      const n = p.samples;
      mat.sigma = n < 64 ? 5 : n < 256 ? 4 : 2.5;
      mat.threshold = n < 32 ? 1.6 : n < 128 ? 0.9 : n < 400 ? 0.45 : 0.2;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      denoise.render(renderer);
      renderer.autoClear = autoClear;
    };
    return Object.assign(p, { _denoise: denoise });
  }, [gl]);

  useEffect(
    () => () => {
      pt._denoise.dispose();
      pt.dispose();
    },
    [pt],
  );

  // (Re)build the BVH whenever the scene content changes (debounced while dragging).
  useEffect(() => {
    ready.current = false;
    const t = setTimeout(() => {
      scene.updateMatrixWorld(true);
      pt.setScene(scene, camera);
      lastCam.current.copy(camera.matrixWorld);
      ready.current = true;
    }, 250);
    return () => clearTimeout(t);
  }, [pt, scene, camera, sceneData]);

  useFrame(() => {
    if (!ready.current) {
      gl.render(scene, camera);
      return;
    }
    // Camera moved (look/walk/switch): restart accumulation from the new view.
    if (!lastCam.current.equals(camera.matrixWorld)) {
      lastCam.current.copy(camera.matrixWorld);
      pt.updateCamera();
    }
    // Up to 4 samples per frame within a ~12 ms CPU budget (GPU work is async, so keep the cap low).
    const start = performance.now();
    for (let i = 0; i < 4 && pt.samples < MAX_SAMPLES; i++) {
      pt.renderSample();
      if (performance.now() - start > 12) break;
    }
    const now = performance.now();
    if (now - lastReport.current > 250) {
      lastReport.current = now;
      useEditor.getState().setPhotoSamples(Math.floor(pt.samples));
    }
  }, 1);

  return null;
}
