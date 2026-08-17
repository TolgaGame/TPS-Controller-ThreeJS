import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// Physical sky (Preetham model, same one used in three.js's own
// examples) replaces the flat background color, and doubles as the
// source for the scene's PMREM-baked environment map so PBR materials
// get real reflections/ambient instead of flat shading.
export class SkyManager {
  constructor(renderer, scene, lightingManager) {
    this.renderer = renderer;
    this.scene = scene;
    this.lightingManager = lightingManager;

    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    this.scene.add(this.sky);

    const uniforms = this.sky.material.uniforms;
    // turbidity/rayleigh were producing a very bright, near-white sky
    // dome — most of the "washed out" look was this getting baked
    // straight into scene.environment below. Slightly hazier + less
    // scattering reads as a normal clear-sky day instead of high noon
    // through fog.
    uniforms.turbidity.value = 2;
    uniforms.rayleigh.value = 0.9;
    uniforms.mieCoefficient.value = 0.004;
    uniforms.mieDirectionalG.value = 0.8;

    this.pmrem = new THREE.PMREMGenerator(renderer.instance);
    this.pmrem.compileEquirectangularShader();

    this._syncToSun();

    // The baked sky environment map was contributing a *lot* of
    // uncontrolled ambient light on top of the sun/hemi/ambient rig —
    // easy to miss because it's invisible until PBR materials pick it
    // up. environmentIntensity (three.js r162+) scales just that
    // contribution without touching the visible sky dome or other
    // lights. Drop this file's THREE version if this property doesn't
    // exist yet; the fallback is to bake from a slightly darkened
    // clone of the sky instead.
    if ('environmentIntensity' in this.scene) {
      this.scene.environmentIntensity = 0.5;
    }
  }

  // Call once after construction (and again if you ever animate the
  // sun). Points the sky's sun disc at the same direction the
  // DirectionalLight is shining from, then re-bakes the env map.
  _syncToSun() {
    const sunDir = this.lightingManager.getSunDirection();
    this.sky.material.uniforms.sunPosition.value.copy(sunDir);

    const envRT = this.pmrem.fromScene(this.sky);
    this.scene.environment = envRT.texture;
  }

  dispose() {
    this.pmrem.dispose();
  }
}