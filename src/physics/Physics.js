import * as THREE from 'three';

// Thin raycast-based collision query layer shared by movement and camera.
// No rigid-body engine is used: the prototype relies on raycasts against
// the world's static collider meshes, per the project's technical scope.
export class Physics {
  constructor() {
    this.colliders = [];
    this.raycaster = new THREE.Raycaster();
  }

  setColliders(colliders) {
    this.colliders = colliders;
  }

  /** Returns the closest hit along the ray, or null. */
  raycast(origin, direction, maxDistance) {
    this.raycaster.set(origin, direction);
    this.raycaster.far = maxDistance;
    const hits = this.raycaster.intersectObjects(this.colliders, false);
    return hits.length > 0 ? hits[0] : null;
  }

  raycastAll(origin, direction, maxDistance) {
    this.raycaster.set(origin, direction);
    this.raycaster.far = maxDistance;
    return this.raycaster.intersectObjects(this.colliders, false);
  }
}
