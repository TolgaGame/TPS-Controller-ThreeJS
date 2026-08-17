import * as THREE from 'three';

// Daylight rig: one directional "sun", a hemisphere light for sky/ground
// bounce, and a very low ambient to keep shadow cores from going pure
// black. Shadow frustum is sized for this map's ~80x80 footprint.
export class LightingManager {
  constructor(scene) {
    this.scene = scene;

    // Shared with SkyManager so the sky's sun disc lines up with the
    // light that's actually casting shadows.
    this.sunAngle = { azimuth: 145, elevation: 42 }; // degrees

    this._createSun();
    this._createHemisphere();
    this._createAmbient();
  }

  _createSun() {
    // Was 3.2, then 1.4 — still too hot once the sky's PMREM
    // environment map is factored in on top of hemisphere + ambient.
    // 1.1 leaves the sun as the clear key light without it (plus the
    // env map) blowing highlights past what exposure can pull back.
    const sun = new THREE.DirectionalLight(0xfff2e0, 1.1);
    sun.castShadow = true;

    // High-res, soft, large-coverage shadow map.
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 150;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;

    // Tuned to kill acne without introducing peter-panning at this scale.
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 2; // PCF softness

    this._positionSun(sun);

    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  _positionSun(sun) {
    const { azimuth, elevation } = this.sunAngle;
    const r = 80;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sun.position.setFromSphericalCoords(r, phi, theta);
    sun.target.position.set(0, 0, 0);
  }

  // Consumed by SkyManager to line up the sky shader's sun disc, and
  // available if you ever want to drive time-of-day.
  getSunDirection() {
    return this.sun.position.clone().normalize();
  }

  _createHemisphere() {
    // Was 0.6 — with the sky's environment map also contributing
    // ambient fill now, that was double-counting sky light. 0.35 keeps
    // shadowed faces lifted without competing with the env map.
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3a3a, 0.35);
    this.scene.add(this.hemi);
  }

  _createAmbient() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.08);
    this.scene.add(this.ambient);
  }
}