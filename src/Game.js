import * as THREE from 'three';
import { RendererManager } from './core/RendererManager.js';
import { SceneManager } from './core/SceneManager.js';
import { Time } from './core/Time.js';
import { InputManager } from './input/InputManager.js';
import { Physics } from './physics/Physics.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { PlayerController } from './player/PlayerController.js';
import { World } from './world/World.js';
import { LightingManager } from './world/LightingManager.js';
import { SkyManager } from './world/SkyManager.js';
import { EnvironmentManager } from './world/EnvironmentManager.js';
import { PostProcessingManager } from './postprocessing/PostProcessingManager.js';

// Composition root: wires core systems, input, physics, world, player,
// camera, and rendering together and runs the main update/render loop.
//
// Değişenler (orijinale göre):
//  - Renderer -> RendererManager (aynı arayüz: instance / render / onResize,
//    dosyayı core/Renderer.js yerine core/RendererManager.js olarak kaydet)
//  - LightingManager, SkyManager, EnvironmentManager eklendi (sadece görsel,
//    fizik/world/player'a dokunmuyor)
//  - PostProcessingManager eklendi; tick döngüsü artık renderer.render()
//    yerine composer üzerinden render ediyor
// World, Physics, PlayerController, ThirdPersonCamera, InputManager
// dosyalarına hiç dokunulmadı.
export class Game {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new RendererManager(canvas);
    this.sceneManager = new SceneManager();
    this.time = new Time();
    this.input = new InputManager(canvas);
    this.physics = new Physics();

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    this.world = new World(this.sceneManager);
    this.physics.setColliders(this.world.getColliders());

    this.playerController = new PlayerController(this.physics);
    this.sceneManager.add(this.playerController.mesh);

    this.thirdPersonCamera = new ThirdPersonCamera(this.camera, this.input);
    this.thirdPersonCamera.setColliders(this.world.getColliders());

    // --- Görsel sistemler (sadece render, gameplay'e bağımlılık yok) ---
    this.lighting = new LightingManager(this.sceneManager.scene);
    this.sky = new SkyManager(this.renderer, this.sceneManager.scene, this.lighting);
    this.environment = new EnvironmentManager(this.sceneManager.scene);
    this.postProcessing = new PostProcessingManager(
      this.renderer,
      this.sceneManager.scene,
      this.camera
    );

    window.addEventListener('resize', () => this._onResize());

    this._tick = this._tick.bind(this);
  }

  start() {
    this.renderer.instance.setAnimationLoop(this._tick);
  }

  _tick() {
    const delta = this.time.update();

    this.playerController.update(delta, this.input, this.thirdPersonCamera.getYaw());
    this.thirdPersonCamera.update(this.playerController.position);

    this.input.lateUpdate();

    this.postProcessing.render();
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.onResize();
    this.postProcessing.onResize(window.innerWidth, window.innerHeight);
  }
}