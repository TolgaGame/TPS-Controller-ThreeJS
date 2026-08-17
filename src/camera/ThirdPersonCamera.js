import * as THREE from 'three';
import { ControlSettings } from '../input/Controls.js';

// Mouse-orbit third-person camera. Keeps its own yaw/pitch driven by
// InputManager's raw mouse delta, and does a simple raycast pull-in
// against world colliders so it never clips through geometry.
export class ThirdPersonCamera {
  constructor(camera, inputManager) {
    this.camera = camera;
    this.input = inputManager;

    this.target = new THREE.Vector3();
    this.offset = new THREE.Vector3(0, 1.6, 0);

    this.distance = 5.5;
    this.minDistance = 1.2;
    this.maxDistance = 8;

    this.yaw = 0;
    this.pitch = -0.25;
    this.minPitch = -1.2;
    this.maxPitch = 0.9;

    this.raycaster = new THREE.Raycaster();
    this.colliders = [];
  }

  setColliders(colliders) {
    this.colliders = colliders;
  }

  getYaw() {
    return this.yaw;
  }

  update(followPosition) {
    const { x, y } = this.input.consumeMouseDelta();
    this.yaw -= x * ControlSettings.cameraSensitivity;
    this.pitch -= y * ControlSettings.cameraSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, this.minPitch, this.maxPitch);

    this.target.copy(followPosition).add(this.offset);

    const distance = this._resolveCollisionDistance();
    const spherical = new THREE.Spherical(distance, Math.PI / 2 - this.pitch, this.yaw);
    const offsetPos = new THREE.Vector3().setFromSpherical(spherical);

    this.camera.position.copy(this.target).add(offsetPos);
    this.camera.lookAt(this.target);
  }

  _resolveCollisionDistance() {
    if (this.colliders.length === 0) return this.distance;

    const spherical = new THREE.Spherical(this.distance, Math.PI / 2 - this.pitch, this.yaw);
    const direction = new THREE.Vector3().setFromSpherical(spherical).normalize();

    this.raycaster.set(this.target, direction);
    this.raycaster.far = this.distance;
    const hits = this.raycaster.intersectObjects(this.colliders, false);

    if (hits.length > 0) {
      return THREE.MathUtils.clamp(hits[0].distance - 0.3, this.minDistance, this.distance);
    }
    return this.distance;
  }
}
