import * as THREE from 'three';
import { ControlSettings } from '../input/Controls.js';

// All character movement lives here: acceleration/deceleration, gravity,
// jump/double jump, wall slide/jump, dash, slide, ledge grab/climb and
// vault. Everything is driven by raycasts against Physics' collider list
// (no rigid-body engine), which keeps the prototype lightweight and easy
// to extend with combat-related states later (e.g. an "attacking" lock).

const DOWN = new THREE.Vector3(0, -1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveInput = new THREE.Vector3();
const _wishDir = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _horizontalMove = new THREE.Vector3();

export class MovementController {
  constructor(player, physics) {
    this.player = player;
    this.physics = physics;

    this.groundCheckDistance = 0.15;
    this.wallCheckDistance = 0.55;

    this.gravity = ControlSettings.gravity;
    this.terminalVelocity = ControlSettings.terminalVelocity;
    this.jumpVelocity = Math.sqrt(2 * this.gravity * ControlSettings.jumpHeight);
    this.doubleJumpVelocity = Math.sqrt(2 * this.gravity * ControlSettings.doubleJumpHeight);

    this.isDashing = false;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.dashDirection = new THREE.Vector3();

    this.isSliding = false;
    this.slideTimer = 0;
    this.slideDirection = new THREE.Vector3();

    this.isWallSliding = false;
    this.wallNormal = new THREE.Vector3();

    this.ledge = {
      grabbing: false,
      climbing: false,
      climbTimer: 0,
      climbDuration: 0.35,
      targetPos: new THREE.Vector3(),
    };
  }

  update(delta, input, cameraYaw) {
    if (this.ledge.climbing) {
      this._updateClimb(delta);
      return;
    }

    if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= delta;

    this._checkGround();

    if (this.ledge.grabbing) {
      this._handleLedgeGrab(input);
      return;
    }

    const wishDir = this._getWishDirection(input, cameraYaw);

    if (this.isDashing) {
      this._updateDash(delta);
    } else if (this.isSliding) {
      this._updateSlide(delta);
    } else {
      this._handleActions(input, wishDir);
      this._applyHorizontalMovement(delta, wishDir, input);
    }

    if (!this.isDashing) {
      this._applyGravity(delta);
    }

    this._checkWall(wishDir);
    this._checkLedge(wishDir);
    this._integrate(delta);
  }

  // --- Input / orientation -------------------------------------------------

  _getWishDirection(input, cameraYaw) {
    let moveX = 0;
    let moveZ = 0;
    if (input.action('MoveForward')) moveZ -= 1;
    if (input.action('MoveBackward')) moveZ += 1;
    if (input.action('MoveLeft')) moveX -= 1;
    if (input.action('MoveRight')) moveX += 1;

    _moveInput.set(moveX, 0, moveZ);
    _wishDir.set(0, 0, 0);
    if (_moveInput.lengthSq() === 0) return _wishDir;

    _moveInput.normalize();

    _forward.set(0, 0, -1).applyAxisAngle(Y_AXIS, cameraYaw);
    _right.set(1, 0, 0).applyAxisAngle(Y_AXIS, cameraYaw);

    _wishDir.addScaledVector(_forward, -_moveInput.z);
    _wishDir.addScaledVector(_right, _moveInput.x);
    _wishDir.y = 0;
    if (_wishDir.lengthSq() > 0) _wishDir.normalize();

    return _wishDir;
  }

  _getFacingDirection() {
    const yaw = this.player.facingYaw;
    return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  }

  // --- Actions (jump / dash / slide / vault) -------------------------------

  _handleActions(input, wishDir) {
    if (input.actionPressed('Jump')) {
      if (this.player.isGrounded) {
        this.player.velocity.y = this.jumpVelocity;
        this.player.isGrounded = false;
      } else if (this.isWallSliding) {
        this.player.velocity.y = ControlSettings.wallJumpForce;
        this.player.velocity.x = this.wallNormal.x * ControlSettings.wallJumpForce * 0.6;
        this.player.velocity.z = this.wallNormal.z * ControlSettings.wallJumpForce * 0.6;
        this.isWallSliding = false;
        this.player.canDoubleJump = true;
      } else if (this.player.canDoubleJump) {
        this.player.velocity.y = this.doubleJumpVelocity;
        this.player.canDoubleJump = false;
      }
    }

    if (input.actionPressed('Dash') && this.dashCooldownTimer <= 0) {
      this._startDash(wishDir);
    }

    if (
      input.actionPressed('Slide') &&
      this.player.isGrounded &&
      !this.isSliding &&
      wishDir.lengthSq() > 0
    ) {
      this._startSlide(wishDir);
    }

    if (input.actionPressed('Vault')) {
      this._tryVault(wishDir);
    }
  }

  _applyHorizontalMovement(delta, wishDir, input) {
    const isMoving = wishDir.lengthSq() > 0;
    const sprinting = isMoving && input.action('Sprint');
    const targetSpeed = sprinting ? ControlSettings.sprintSpeed : ControlSettings.walkSpeed;

    const targetVelX = wishDir.x * targetSpeed;
    const targetVelZ = wishDir.z * targetSpeed;

    const rate = this.player.isGrounded
      ? isMoving
        ? ControlSettings.acceleration
        : ControlSettings.deceleration
      : ControlSettings.airAcceleration;

    this.player.velocity.x = THREE.MathUtils.damp(this.player.velocity.x, targetVelX, rate, delta);
    this.player.velocity.z = THREE.MathUtils.damp(this.player.velocity.z, targetVelZ, rate, delta);

    if (isMoving) {
      this.player.facingYaw = Math.atan2(wishDir.x, wishDir.z);
    }
  }

  _applyGravity(delta) {
    if (this.player.isGrounded) return;
    this.player.velocity.y -= this.gravity * delta;
    this.player.velocity.y = Math.max(this.player.velocity.y, -this.terminalVelocity);
  }

  // --- Dash -----------------------------------------------------------------

  _startDash(wishDir) {
    const dir = wishDir.lengthSq() > 0 ? wishDir.clone() : this._getFacingDirection();
    this.dashDirection.copy(dir).setY(0).normalize();
    this.isDashing = true;
    this.dashTimer = ControlSettings.dashDuration;
    this.dashCooldownTimer = ControlSettings.dashCooldown;
    this.player.velocity.y = 0;
  }

  _updateDash(delta) {
    const speed = ControlSettings.dashDistance / ControlSettings.dashDuration;
    this.player.velocity.copy(this.dashDirection).multiplyScalar(speed);

    this.dashTimer -= delta;
    if (this.dashTimer <= 0) {
      this.isDashing = false;
      this.player.velocity.multiplyScalar(0.4);
    }
  }

  // --- Slide ------------------------------------------------------------------

  _startSlide(wishDir) {
    this.isSliding = true;
    this.slideTimer = ControlSettings.slideDuration;
    this.slideDirection.copy(wishDir).setY(0).normalize();
  }

  _updateSlide(delta) {
    this.player.velocity.x = this.slideDirection.x * ControlSettings.slideSpeed;
    this.player.velocity.z = this.slideDirection.z * ControlSettings.slideSpeed;

    this.slideTimer -= delta;
    if (this.slideTimer <= 0 || !this.player.isGrounded) {
      this.isSliding = false;
    }
  }

  // --- Vault ------------------------------------------------------------------

  _tryVault(wishDir) {
    if (!this.player.isGrounded) return;

    const dir = wishDir.lengthSq() > 0 ? wishDir.clone().setY(0).normalize() : this._getFacingDirection();

    _rayOrigin.copy(this.player.position);
    _rayOrigin.y += 0.5;
    const hit = this.physics.raycast(_rayOrigin, dir, this.wallCheckDistance);
    if (!hit) return;
    if (hit.point.y - this.player.position.y > ControlSettings.vaultHeight) return;

    // Simplified prototype vault: a forward hop over the obstacle.
    // Swap for an animation-driven traversal once combat/animation lands.
    this.player.velocity.y = this.jumpVelocity * 0.7;
    this.player.velocity.x = dir.x * ControlSettings.walkSpeed * 1.2;
    this.player.velocity.z = dir.z * ControlSettings.walkSpeed * 1.2;
    this.player.isGrounded = false;
  }

  // --- Ground / wall / ledge detection -----------------------------------

  _checkGround() {
    _rayOrigin.copy(this.player.position);
    _rayOrigin.y += 0.1;

    const hit = this.physics.raycast(_rayOrigin, DOWN, this.groundCheckDistance + 0.1);
    this.player.isGrounded = !!hit && this.player.velocity.y <= 0.01;

    if (this.player.isGrounded) {
      this.player.position.y = hit.point.y;
      this.player.velocity.y = 0;
      this.player.canDoubleJump = true;
      this.isWallSliding = false;
    }
  }

  _checkWall(wishDir) {
    if (this.player.isGrounded) {
      this.isWallSliding = false;
      return;
    }

    const dir = wishDir.lengthSq() > 0 ? wishDir.clone().setY(0).normalize() : this._getFacingDirection();

    _rayOrigin.copy(this.player.position);
    _rayOrigin.y += this.player.height * 0.6;
    const hit = this.physics.raycast(_rayOrigin, dir, this.wallCheckDistance);

    if (hit && this.player.velocity.y < 0) {
      this.isWallSliding = true;
      this.wallNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
      this.player.velocity.y = Math.max(this.player.velocity.y, -ControlSettings.wallSlideSpeed);
    } else {
      this.isWallSliding = false;
    }
  }

  _checkLedge(wishDir) {
    if (this.player.isGrounded || this.ledge.grabbing || this.player.velocity.y > 0) return;

    const dir = wishDir.lengthSq() > 0 ? wishDir.clone().setY(0).normalize() : this._getFacingDirection();

    _rayOrigin.copy(this.player.position);
    _rayOrigin.y += this.player.height - 0.2;
    const chestHit = this.physics.raycast(_rayOrigin, dir, ControlSettings.ledgeGrabDistance);

    _rayOrigin.y += 0.5;
    const headHit = this.physics.raycast(_rayOrigin, dir, ControlSettings.ledgeGrabDistance);

    if (chestHit && !headHit) {
      this.ledge.grabbing = true;
      this.player.velocity.set(0, 0, 0);
      this.ledge.targetPos
        .copy(this.player.position)
        .addScaledVector(dir, 0.6);
      this.ledge.targetPos.y = chestHit.point.y + 0.1;
    }
  }

  _handleLedgeGrab(input) {
    if (input.actionPressed('Jump') || input.actionPressed('Climb')) {
      this.ledge.grabbing = false;
      this.ledge.climbing = true;
      this.ledge.climbTimer = 0;
    } else if (input.actionPressed('MoveBackward')) {
      this.ledge.grabbing = false;
    }
  }

  _updateClimb(delta) {
    this.ledge.climbTimer += delta;
    const t = Math.min(this.ledge.climbTimer / this.ledge.climbDuration, 1);
    this.player.position.lerp(this.ledge.targetPos, t);

    if (t >= 1) {
      this.ledge.climbing = false;
      this.player.isGrounded = true;
      this.player.velocity.set(0, 0, 0);
    }
  }

  // --- Integration ------------------------------------------------------------

  _integrate(delta) {
    const position = this.player.position;
    const velocity = this.player.velocity;

    _horizontalMove.set(velocity.x, 0, velocity.z).multiplyScalar(delta);
    const moveDist = _horizontalMove.length();

    if (moveDist > 1e-4) {
      const dir = _horizontalMove.clone().normalize();
      _rayOrigin.copy(position);
      _rayOrigin.y += this.player.height * 0.5;

      const hit = this.physics.raycast(_rayOrigin, dir, moveDist + this.player.radius);
      if (hit && hit.distance < moveDist + this.player.radius) {
        const allowed = Math.max(0, hit.distance - this.player.radius);
        _horizontalMove.setLength(Math.min(moveDist, allowed));
      }
    }

    position.add(_horizontalMove);
    position.y += velocity.y * delta;

    if (position.y < -20) {
      this._respawn();
    }
  }

  _respawn() {
    this.player.position.set(0, 2, 0);
    this.player.velocity.set(0, 0, 0);
    this.player.canDoubleJump = true;
  }

  // --- Animation ------------------------------------------------------------

  /**
   * Maps current movement flags to a single animation state name that
   * Player/AnimationController can crossfade to. Add cases here whenever
   * a new movement state is introduced (e.g. an "attacking" lock later).
   */
  getAnimationState() {
    if (this.ledge.climbing) return 'climb';
    if (this.ledge.grabbing) return 'ledgeGrab';
    if (this.isDashing) return 'dash';
    if (this.isSliding) return 'slide';
    if (this.isWallSliding) return 'wallSlide';

    if (!this.player.isGrounded) {
      return this.player.velocity.y > 0.1 ? 'jump' : 'fall';
    }

    const horizontalSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    if (horizontalSpeed < 0.1) return 'idle';
    return horizontalSpeed > ControlSettings.walkSpeed + 0.1 ? 'run' : 'walk';
  }
}