import * as THREE from 'three';

// Replaces the old Renderer.js. Keeps the exact same public surface
// (instance / render / onResize) so Game.js only needs an import-path
// change — nothing else in the composition root has to know this got
// upgraded.
export class RendererManager {
  constructor(canvas) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });

    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.instance.setSize(window.innerWidth, window.innerHeight);

    // --- Physically based rendering ---
    // NOTE: modern three.js (r155+) always uses physically-correct
    // light falloff — there's no `physicallyCorrectLights` flag to set
    // anymore (it's just how it works now). What you DO still need to
    // set is color management and tone mapping:
    this.instance.outputColorSpace = THREE.SRGBColorSpace;
    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    // Was 1.05, then 0.65 — still blowing out once the PMREM sky
    // environment map was added on top of sun/hemi/ambient (env
    // lighting isn't visible in a bare scene test, so it's easy to
    // under-correct for). 0.45 keeps ACES' shoulder doing real work
    // instead of just riding near-white the whole time. Tune this
    // last, after the light/env intensities below — exposure is a
    // global multiplier, so fixing individual lights first means you
    // don't have to redo this number every time you touch one of them.
    this.instance.toneMappingExposure = 0.45;

    // --- Shadows ---
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  render(scene, camera) {
    this.instance.render(scene, camera);
  }

  onResize() {
    this.instance.setSize(window.innerWidth, window.innerHeight);
  }
}