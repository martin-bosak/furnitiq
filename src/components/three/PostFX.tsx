"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { N8AOPass } from "n8ao";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * Real-time look: N8AO ambient occlusion (darkens corners, contact areas and
 * under furniture), then tone mapping + sRGB output. Built on three's own
 * EffectComposer; takes over rendering while mounted (useFrame priority 1).
 */
export function PostFX() {
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(gl, target);
    const ao = new N8AOPass(scene, camera, 1, 1);
    ao.configuration.aoRadius = 0.7;
    ao.configuration.distanceFalloff = 0.7;
    ao.configuration.intensity = 3;
    ao.configuration.gammaCorrection = false; // OutputPass does tone mapping + sRGB
    ao.setQualityMode("High");
    c.addPass(ao);
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame((_, dt) => composer.render(dt), 1);
  return null;
}
