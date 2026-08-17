import { TestMap } from './TestMap.js';

// Owns the loaded map content and exposes its collider meshes to
// Physics/ThirdPersonCamera. Swap _buildLevel with a loader later
// (e.g. glTF levels) without changing how consumers query colliders.
export class World {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.testMap = new TestMap();
    this.sceneManager.add(this.testMap.group);
  }

  getColliders() {
    return this.testMap.colliders;
  }
}
