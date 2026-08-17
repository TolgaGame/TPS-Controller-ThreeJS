import * as THREE from 'three';

// Small on purpose — this is the one place to reach for if you later
// want to add global atmosphere effects (fog, wind particles, distance
// haze) without touching lighting or sky code.
export class EnvironmentManager {
  constructor(scene) {
    this.scene = scene;

    // Exponential-squared fog: subtle blue-gray, thickens gradually
    // with distance. Density tuned so the far edges of this map
    // (~40-50m) get gentle haze but the whole playable footprint stays
    // clearly visible.
    this.scene.fog = new THREE.FogExp2(0x9fb4c9, 0.008);
  }

  setFogDensity(density) {
    this.scene.fog.density = density;
  }
}
