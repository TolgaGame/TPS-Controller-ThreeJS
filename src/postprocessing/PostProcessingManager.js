import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// RenderPass -> SSAO -> Bloom -> SMAA -> OutputPass.
//
// Using SMAA instead of FXAA: SMAA is more expensive per-pixel but
// doesn't need extra passes to look good at 1x scale, and holds up
// better against the fine graybox edges (stair nosings, thin wall
// gaps) than FXAA does. Swap to FXAAPass if you need the extra
// headroom on lower-end hardware — see the note in onResize().
export class PostProcessingManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.composer = new EffectComposer(renderer.instance);
    this.composer.addPass(new RenderPass(scene, camera));

    const size = new THREE.Vector2();
    renderer.instance.getSize(size);

    // Realistic contact/crevice darkening — this is what sells the
    // "AAA graybox" look more than almost anything else, since flat
    // MeshStandardMaterial boxes have zero occlusion cues on their own.
    this.ssaoPass = new SSAOPass(scene, camera, size.x, size.y);
    this.ssaoPass.kernelRadius = 0.6;
    this.ssaoPass.minDistance = 0.001;
    this.ssaoPass.maxDistance = 0.15;
    this.composer.addPass(this.ssaoPass);

    // Bloom kept deliberately weak: strength 0.25 with a high-ish
    // threshold means only genuinely bright pixels (sky/sun highlight)
    // bloom at all — it should read as "clean," not glowy.
    this.bloomPass = new UnrealBloomPass(size.clone(), 0.25, 0.6, 0.9);
    this.composer.addPass(this.bloomPass);

    this.smaaPass = new SMAAPass(
      size.x * renderer.instance.getPixelRatio(),
      size.y * renderer.instance.getPixelRatio()
    );
    this.composer.addPass(this.smaaPass);

    // OutputPass performs the final tone-mapping + color-space
    // conversion. Required as the last pass whenever you render
    // through a composer instead of calling renderer.render() directly.
    this.composer.addPass(new OutputPass());
  }

  render() {
    this.composer.render();
  }

  onResize(width, height) {
    this.composer.setSize(width, height);
    const pixelRatio = this.renderer.instance.getPixelRatio();
    this.smaaPass.setSize(width * pixelRatio, height * pixelRatio);
  }
}
