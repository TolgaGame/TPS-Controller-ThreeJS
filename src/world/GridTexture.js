import * as THREE from 'three';

// Procedural "crash-test calibration" texture: thin grid lines with a
// small dot at every intersection, drawn on a canvas at runtime — no
// image assets needed. Multiplied against each material's base color,
// so it reads as a tinted reference grid rather than a flat block.
// Cached by config so identical calls reuse the same CanvasTexture.
const _cache = new Map();

export function createGridTexture({
  size = 256,
  cells = 8,
  lineColor = 'rgba(0,0,0,0.35)',
  dotColor = 'rgba(0,0,0,0.6)',
  bgColor = 'rgba(255,255,255,1)',
} = {}) {
  const key = `${size}|${cells}|${lineColor}|${dotColor}|${bgColor}`;
  if (_cache.has(key)) return _cache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base fill — stays white so it only *darkens* the material color
  // via multiply, never washes it out.
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);

  const step = size / cells;

  // Grid lines
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = Math.max(1, size / 256);
  ctx.beginPath();
  for (let i = 0; i <= cells; i++) {
    const p = i * step;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  // Intersection dots (the "crash-test tracking marker" look)
  const dotRadius = Math.max(1.4, size / 140);
  ctx.fillStyle = dotColor;
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j <= cells; j++) {
      ctx.beginPath();
      ctx.arc(i * step, j * step, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;

  _cache.set(key, texture);
  return texture;
}
