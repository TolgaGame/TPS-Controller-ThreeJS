import * as THREE from 'three';
import { createGridTexture } from './GridTexture.js';

// Gray blockout test map: platforms, walls, stairs, ramps, floating
// platforms, gaps and a small obstacle course, built to exercise every
// movement mechanic (walk/sprint, jump/double jump, wall slide/jump,
// ledge grab/climb, vault, dash, slide).
//
// ONLY the material definitions below changed from the original —
// every position, size, and method call is identical, so map layout
// and colliders are unaffected.
//
// Instead of flat colors, every material now carries a procedural
// grid-and-dot texture (see GridTexture.js) — the "crash-test
// calibration" look: thin lines + a dot at each intersection, tinted
// by the material's base color. Roughness/metalness values are kept
// from the original "no textures available" pass (0.75–0.92 rough,
// zero metalness) since the grid is a reference aid, not a surface
// material.
const MAT_GROUND = new THREE.MeshStandardMaterial({
  color: 0x8a8d91,
  roughness: 0.92,
  metalness: 0.0,
});
MAT_GROUND.userData.gridTexture = createGridTexture();

const MAT_PLATFORM = new THREE.MeshStandardMaterial({
  color: 0x9aa0a8,
  roughness: 0.82,
  metalness: 0.0,
});
MAT_PLATFORM.userData.gridTexture = createGridTexture();

const MAT_WALL = new THREE.MeshStandardMaterial({
  color: 0x74797f,
  roughness: 0.88,
  metalness: 0.0,
});
MAT_WALL.userData.gridTexture = createGridTexture();

const MAT_ACCENT = new THREE.MeshStandardMaterial({
  color: 0x5b7fb5,
  roughness: 0.55,
  metalness: 0.05,
});
// Brighter dots/lines on the accent (blue) material so the markers
// stay visible against the more saturated tint.
MAT_ACCENT.userData.gridTexture = createGridTexture({
  lineColor: 'rgba(0,0,0,0.25)',
  dotColor: 'rgba(255,255,255,0.85)',
});

// World-space size of one grid cell, in meters. Keeps line spacing
// visually consistent across small steps and big walls alike.
const GRID_CELL_METERS = 1;

export class TestMap {
  constructor() {
    this.group = new THREE.Group();
    this.colliders = [];

    this._buildGround();
    this._buildStairs();
    this._buildRamp();
    this._buildFloatingPlatforms();
    this._buildWallJumpCorridor();
    this._buildVaultObstacle();
    this._buildLedgeWall();
    this._buildObstacleCourse();
  }

  // Clones the base material + its grid texture per box, then scales
  // the texture's repeat to the box's own dimensions so the grid cells
  // read at roughly GRID_CELL_METERS everywhere, from small steps to
  // the 80x80 ground slab. BoxGeometry uses the same 0-1 UV range on
  // every face regardless of that face's real size, so this is an
  // approximation (using the two largest dimensions) rather than a
  // perfect per-face texel density — plenty accurate for a blockout aid.
  _materialForBox(baseMaterial, size) {
    const material = baseMaterial.clone();
    const map = baseMaterial.userData.gridTexture.clone();
    map.needsUpdate = true;

    const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
    const repeatX = Math.max(1, Math.round(dims[0] / GRID_CELL_METERS));
    const repeatY = Math.max(1, Math.round(dims[1] / GRID_CELL_METERS));
    map.repeat.set(repeatX, repeatY);

    material.map = map;
    return material;
  }

  _addBox(size, position, material = MAT_PLATFORM, rotation = null) {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geometry, this._materialForBox(material, size));
    mesh.position.copy(position);
    if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.group.add(mesh);
    this.colliders.push(mesh);
    return mesh;
  }

  _buildGround() {
    this._addBox(new THREE.Vector3(80, 1, 80), new THREE.Vector3(0, -0.5, 0), MAT_GROUND);
  }

  _buildStairs() {
    const stepCount = 10;
    const stepHeight = 0.3;
    const stepDepth = 0.8;

    for (let i = 0; i < stepCount; i++) {
      const height = stepHeight * (i + 1);
      this._addBox(
        new THREE.Vector3(4, height, stepDepth),
        new THREE.Vector3(-14, height / 2, -6 - i * stepDepth),
        MAT_PLATFORM
      );
    }
  }

  _buildRamp() {
    const ramp = this._addBox(
      new THREE.Vector3(4, 0.4, 10),
      new THREE.Vector3(-14, 1.5, -20),
      MAT_PLATFORM
    );
    ramp.rotation.x = -Math.PI / 10;
  }

  _buildFloatingPlatforms() {
    const positions = [
      [6, 1.5, -8],
      [10, 3, -14],
      [14, 4.5, -20],
      [18, 4.5, -26],
      [22, 3, -32],
    ];

    positions.forEach(([x, y, z]) => {
      this._addBox(new THREE.Vector3(3.5, 0.5, 3.5), new THREE.Vector3(x, y, z), MAT_ACCENT);
    });
  }

  _buildWallJumpCorridor() {
    // Two parallel walls ~4m apart for wall-slide / wall-jump testing.
    this._addBox(new THREE.Vector3(0.5, 8, 12), new THREE.Vector3(2, 4, 10), MAT_WALL);
    this._addBox(new THREE.Vector3(0.5, 8, 12), new THREE.Vector3(6, 4, 10), MAT_WALL);
  }

  _buildVaultObstacle() {
    // Low wall, short enough to hop over via the vault action.
    this._addBox(new THREE.Vector3(4, 1, 0.6), new THREE.Vector3(0, 0.5, 6), MAT_ACCENT);
  }

  _buildLedgeWall() {
    // Tall wall with a ledge lip at climbable height, plus a small
    // platform on top so a completed climb has somewhere to stand.
    this._addBox(new THREE.Vector3(6, 2.2, 0.6), new THREE.Vector3(-6, 1.1, 6), MAT_WALL);
    this._addBox(new THREE.Vector3(6, 0.3, 2), new THREE.Vector3(-6, 2.35, 6.7), MAT_ACCENT);
  }

  _buildObstacleCourse() {
    // Gap-jump sequence of small platforms with increasing distance/height.
    const positions = [
      [-2, 0.25, -30],
      [-2, 0.25, -33.5],
      [-2, 0.75, -37.5],
      [-2, 1.25, -42],
    ];

    positions.forEach(([x, y, z]) => {
      this._addBox(new THREE.Vector3(2.2, 0.5, 2.2), new THREE.Vector3(x, y, z), MAT_PLATFORM);
    });
  }
}