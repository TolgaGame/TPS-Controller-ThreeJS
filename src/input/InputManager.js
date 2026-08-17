import { Controls } from './Controls.js';

// Tracks raw keyboard/mouse state and exposes it as named "actions"
// resolved through the Controls binding map, so gameplay code never
// has to know about physical key codes.
export class InputManager {
  constructor(domElement) {
    this.domElement = domElement;

    this.keys = new Set();
    this.mouseButtons = new Set();
    this.mouseDelta = { x: 0, y: 0 };

    this._justPressed = new Set();
    this._justReleased = new Set();

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (event) => {
      if (!this.keys.has(event.code)) this._justPressed.add(event.code);
      this.keys.add(event.code);
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
      this._justReleased.add(event.code);
    });

    this.domElement.addEventListener('click', () => {
      this.domElement.requestPointerLock();
    });

    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === this.domElement) {
        this.mouseDelta.x += event.movementX;
        this.mouseDelta.y += event.movementY;
      }
    });

    this.domElement.addEventListener('mousedown', (event) => {
      this.mouseButtons.add(event.button);
    });

    window.addEventListener('mouseup', (event) => {
      this.mouseButtons.delete(event.button);
    });

    window.addEventListener('blur', () => this._resetAll());
  }

  _resetAll() {
    this.keys.clear();
    this.mouseButtons.clear();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this._justPressed.has(code);
  }

  wasReleased(code) {
    return this._justReleased.has(code);
  }

  /** Resolve a Controls action name (e.g. "Jump") to its held state. */
  action(name) {
    const code = Controls[name];
    if (!code) return false;
    if (code.startsWith('Mouse')) {
      return this.mouseButtons.has(Number(code.replace('Mouse', '')));
    }
    return this.keys.has(code);
  }

  /** Resolve a Controls action name to its "just pressed this frame" state. */
  actionPressed(name) {
    const code = Controls[name];
    if (!code || code.startsWith('Mouse')) return false;
    return this._justPressed.has(code);
  }

  consumeMouseDelta() {
    const delta = { x: this.mouseDelta.x, y: this.mouseDelta.y };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return delta;
  }

  /** Call once per frame after all gameplay systems have read input. */
  lateUpdate() {
    this._justPressed.clear();
    this._justReleased.clear();
  }
}
