// Central key/mouse bindings and tunable movement constants.
// Referenced by InputManager (action lookups) and MovementController (tuning).

export const Controls = {
  // Movement
  MoveForward: 'KeyW',
  MoveBackward: 'KeyS',
  MoveLeft: 'KeyA',
  MoveRight: 'KeyD',

  // Character
  Jump: 'Space',
  Sprint: 'ShiftLeft',
  Dash: 'KeyQ',
  Slide: 'ControlLeft',

  // Traversal
  Vault: 'KeyE',
  Climb: 'KeyE',

  // Future Combat
  LightAttack: 'Mouse0',
  HeavyAttack: 'Mouse1',
  Block: 'Mouse1',
  LockTarget: 'KeyR',
  Interact: 'KeyF',

  // UI
  Pause: 'Escape',
  Debug: 'F3',
};

export const ControlSettings = {
  walkSpeed: 4.5,
  sprintSpeed: 8.0,

  acceleration: 12,
  deceleration: 14,
  airAcceleration: 4,

  jumpHeight: 2.5,
  doubleJumpHeight: 2.3,

  gravity: 30,
  terminalVelocity: 40,

  dashDistance: 6,
  dashDuration: 0.18,
  dashCooldown: 0.5,

  slideSpeed: 9,
  slideDuration: 0.6,

  wallSlideSpeed: 2.5,
  wallJumpForce: 9,

  ledgeGrabDistance: 0.75,
  vaultHeight: 1.2,

  cameraSensitivity: 0.0025,
};
