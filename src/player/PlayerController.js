import { Player } from './Player.js';
import { MovementController } from './MovementController.js';

// Glue between the Player entity, its MovementController, and the
// outside world (input + camera yaw). Keeping this thin makes it easy
// to later add combat/animation controllers alongside MovementController.
export class PlayerController {
  constructor(physics) {
    this.player = new Player();
    this.movement = new MovementController(this.player, physics);
  }

  get mesh() {
    return this.player.mesh;
  }

  get position() {
    return this.player.position;
  }

  update(delta, input, cameraYaw) {
    this.movement.update(delta, input, cameraYaw);
    this.player.mesh.rotation.y = this.player.facingYaw;
    this.player.update(delta, this.movement.getAnimationState());
  }
}