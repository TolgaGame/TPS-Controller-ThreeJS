import * as THREE from 'three';

// Wraps THREE.Clock and clamps delta time so tab-out / lag spikes
// don't cause huge physics steps.
export class Time {
  constructor() {
    this.clock = new THREE.Clock();
    this.delta = 0;
    this.elapsed = 0;
    this.maxDelta = 1 / 30;
  }

  update() {
    this.delta = Math.min(this.clock.getDelta(), this.maxDelta);
    this.elapsed += this.delta;
    return this.delta;
  }
}
