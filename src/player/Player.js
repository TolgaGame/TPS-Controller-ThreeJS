import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { AnimationController } from './AnimationController.js';

// Visual + physical representation of the player. Holds only state
// (position via mesh, velocity, grounded flags) - all movement logic
// lives in MovementController so this stays swappable without touching
// movement code.
//
// NOTE ON COLLISION: `radius` and `height` remain plain numbers used by
// MovementController's raycasts (ground/wall/ledge checks, capsule-radius
// clearance in _integrate). They no longer correspond to a visible
// collider mesh - the capsule geometry has been replaced by a Mixamo FBX
// model that is purely cosmetic. If you resize the visual model, update
// these two numbers to match its actual footprint/height so raycasts
// still line up with what the player sees.

const MIXAMO_SCALE = 0.01; // Mixamo exports are in cm; scene units are meters here
const MODEL_URL = '/assets/characters/mixamo_character.fbx'; // T-Pose/base mesh export

// Point these at separate Mixamo "animation only" exports (same rig).
// Add/remove entries to match whatever states MovementController.getAnimationState()
// can return.
const ANIMATION_URLS = {
  idle: '/assets/characters/anims/idle.fbx',
  walk: '/assets/characters/anims/walk.fbx',
  run: '/assets/characters/anims/run.fbx',
  jump: '/assets/characters/anims/jump.fbx',
//  fall: '/assets/characters/anims/fall.fbx',
 // dash: '/assets/characters/anims/dash.fbx',
//  slide: '/assets/characters/anims/slide.fbx',
 // wallSlide: '/assets/characters/anims/wallslide.fbx',
 // ledgeGrab: '/assets/characters/anims/ledgeIdle.fbx',
 // climb: '/assets/characters/anims/climb.fbx',
};

export class Player {
  constructor() {
    this.radius = 0.4;
    this.height = 1.8;

    // Root that MovementController moves around. Empty until the FBX
    // finishes loading so gameplay code can start immediately.
    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 2, 0);

    this.velocity = new THREE.Vector3();
    this.isGrounded = false;
    this.canDoubleJump = true;
    this.facingYaw = 0;

    this.animation = null; // AnimationController, set once the model + clips load
    this.modelReady = false;

    this._loadModel();
  }

  _loadModel() {
    const loader = new FBXLoader();
    loader.load(
      MODEL_URL,
      (fbx) => {
        fbx.scale.setScalar(MIXAMO_SCALE);

        // Mixamo rigs commonly face +Z after export; if your character
        // ends up facing backwards relative to `facingYaw`, flip this.
       // fbx.rotation.y = Math.PI;

        fbx.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        this.mesh.add(fbx);
        this.skinnedRoot = fbx;

        this.animation = new AnimationController(fbx);
        this.animation
          .loadClips(ANIMATION_URLS)
          .then(() => {
            this.modelReady = true;
            this.animation.play('idle');
          })
          .catch((err) => console.error('Failed to load Mixamo animation clips:', err));
      },
      undefined,
      (err) => console.error('Failed to load Mixamo character model:', err)
    );
  }

  /** Call once per frame from PlayerController with the current animation state name. */
  update(delta, animState) {
    if (this.animation) this.animation.update(delta, animState);
  }

  get position() {
    return this.mesh.position;
  }
}