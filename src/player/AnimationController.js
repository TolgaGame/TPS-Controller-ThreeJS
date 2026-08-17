import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Drives an AnimationMixer for a Mixamo-rigged character. Each animation
// state (idle/walk/run/jump/...) maps 1:1 to a separate Mixamo FBX export
// that contains only a clip (no mesh needed, but Mixamo always bundles a
// skeleton — we just read clip.tracks and discard the rest).
//
// Usage:
//   const anim = new AnimationController(loadedFbxRoot);
//   await anim.loadClips({ idle: 'url', walk: 'url', ... });
//   anim.update(delta, movementController.getAnimationState());

const CROSSFADE_DURATION = 0.25;
const ONE_SHOT_STATES = new Set(['jump', 'dash']);

const _loader = new FBXLoader();

function loadClip(url) {
  return new Promise((resolve, reject) => {
    _loader.load(
      url,
      (fbx) => {
        if (!fbx.animations || fbx.animations.length === 0) {
          reject(new Error(`No animation clip found in ${url}`));
          return;
        }
        resolve(fbx.animations[0]);
      },
      undefined,
      reject
    );
  });
}

export class AnimationController {
  constructor(model) {
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    this.currentState = null;
    this.currentAction = null;

    // Fires when a one-shot clip (jump, dash, ...) finishes, in case the
    // caller wants to force a state re-evaluation instead of freezing on
    // the clamped last frame.
    this.onOneShotFinished = null;
    this.mixer.addEventListener('finished', (e) => {
      if (this.onOneShotFinished) this.onOneShotFinished(e.action._clipName);
    });
  }

  /**
   * @param {Record<string, string>} clipUrls e.g. { idle: '/anims/idle.fbx', walk: '/anims/walk.fbx' }
   */
  async loadClips(clipUrls) {
    const entries = Object.entries(clipUrls);
    await Promise.all(
      entries.map(async ([name, url]) => {
        const clip = await loadClip(url);
        clip.name = name;
        const action = this.mixer.clipAction(clip);
        action._clipName = name;

        if (ONE_SHOT_STATES.has(name)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
        }

        this.actions[name] = action;
      })
    );
  }

  /** Crossfades into `name` if it isn't already the active state. */
  play(name) {
    if (this.currentState === name) return;
    const next = this.actions[name];
    if (!next) {
      console.warn(`AnimationController: no clip registered for state "${name}"`);
      return;
    }

    const prev = this.currentAction;

    next.enabled = true;
    next.setEffectiveWeight(1);
    next.reset().fadeIn(CROSSFADE_DURATION).play();

    if (prev && prev !== next) {
      prev.fadeOut(CROSSFADE_DURATION);
    }

    this.currentAction = next;
    this.currentState = name;
  }

  update(delta, state) {
    if (state) this.play(state);
    this.mixer.update(delta);
  }
}