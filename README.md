# Three.js TPS Action Prototype

A modular third-person action prototype built with **Three.js**, **Vite**, and modern **ES Modules**.

The project focuses on creating a responsive character controller and movement system using simple gray-box environments. Graphics are intentionally minimal so development can concentrate on gameplay mechanics and architecture.

## Features

### Character

* Third-person camera
* WASD movement
* Sprint
* Jump
* Double Jump
* Wall Slide
* Wall Jump
* Dash
* Slide
* Vault
* Ledge Grab & Climb
* Smooth acceleration
* Gravity & ground detection

### Test Environment

* Platforms
* Walls
* Ramps
* Stairs
* Floating platforms
* Gaps
* Obstacle course

## Tech Stack

* Three.js
* Vite
* ES Modules
* Modern JavaScript

No React, TypeScript, or external game engine.

## Project Goals

* Clean and modular architecture
* Gameplay-first development
* Easy to extend with:

  * Combat
  * Animations
  * Enemies
  * Inventory
  * Multiplayer
  * Save system
  * AI

## Project Structure

```
src/
 ├── core/
 ├── player/
 ├── camera/
 ├── input/
 ├── physics/
 ├── world/
 ├── ui/
 ├── debug/
 └── main.js
```

## Development

```bash
npm install
npm run dev
```

Build production version:

```bash
npm run build
```

## Development Strategy

The project will be developed incrementally.

Each gameplay system will be implemented, tested, and refined before moving to the next one, ensuring a scalable and maintainable codebase.
