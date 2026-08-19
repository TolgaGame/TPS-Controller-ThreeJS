/**
 * DebugManager.js
 * ------------------------------------------------------------------------
 * A lightweight, self-contained runtime debug system for Three.js,
 * similar in spirit to Unity's Scene View debug overlay.
 *
 * Dependencies (peer, not bundled):
 *  - three
 *  - three/examples/jsm/controls/TransformControls.js
 *  - three/examples/jsm/libs/stats.module.js
 *  - lil-gui
 *
 * Usage:
 *   import DebugManager from './DebugManager.js';
 *   const debugManager = new DebugManager({ scene, camera, renderer, orbitControls });
 *   // in your animation loop:
 *   debugManager.update(delta);
 *   // on teardown:
 *   debugManager.destroy();
 * ------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import GUI from 'lil-gui';

export default class DebugManager {
    constructor({
        scene,
        camera,
        renderer,
        orbitControls = null,
        physicsWorld = null
    }) {
        if (!scene || !camera || !renderer) {
            throw new Error('DebugManager requires { scene, camera, renderer }.');
        }

        // ------------------------------------------------------------
        // Core references
        // ------------------------------------------------------------
        this._scene = scene;
        this._camera = camera;
        this._renderer = renderer;
        this._orbitControls = orbitControls;
        this._physicsWorld = physicsWorld; // reserved for future integration

        // ------------------------------------------------------------
        // State
        // ------------------------------------------------------------
        this._enabled = false;
        this._selectedObject = null;
        this._rayVisuals = []; // { line, expireAt }

        this._settings = {
            grid: true,
            axes: true,
            boundingBoxes: false,
            boundingSpheres: false,
            lights: true,
            cameraHelper: false,
            colliders: true,
            wireframeAll: false,
            showStats: true
        };

        // Internal registries (Maps to avoid duplicate work / lookups)
        this._boxHelpers = new Map();      // Object3D -> BoxHelper
        this._sphereHelpers = new Map();   // Object3D -> Mesh (wireframe sphere)
        this._lightHelpers = new Map();    // Light -> Helper
        this._colliderHelpers = new Map(); // Object3D -> Mesh (wireframe)

        this._debugRoot = new THREE.Group();
        this._debugRoot.name = '__DebugManagerRoot__';
        this._debugRoot.visible = false;
        this._scene.add(this._debugRoot);

        this._helperGroups = {
            grid: new THREE.Group(),
            axes: new THREE.Group(),
            boundingBoxes: new THREE.Group(),
            boundingSpheres: new THREE.Group(),
            lights: new THREE.Group(),
            camera: new THREE.Group(),
            colliders: new THREE.Group(),
            rays: new THREE.Group(),
            selection: new THREE.Group()
        };
        Object.values(this._helperGroups).forEach((g) => this._debugRoot.add(g));

        // Bind handlers once so they can be removed on destroy()
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onWindowResize = this._onWindowResize.bind(this);

        this._raycaster = new THREE.Raycaster();
        this._pointerNDC = new THREE.Vector2();

        // ------------------------------------------------------------
        // Build subsystems
        // ------------------------------------------------------------
        this._initGridAndAxes();
        this._initStats();
        this._initInspectorPanel();
        this._initStatsOverlay();
        this._initTransformControls();
        this._initGUI();
        this._bindEvents();

        // Apply initial disabled state
        this._applyEnabledState();
    }

    // =====================================================================
    // SECTION: Public API
    // =====================================================================

    /** Toggle or set debug mode explicitly. */
    setEnabled(value) {
        this._enabled = !!value;
        this._applyEnabledState();
    }

    isEnabled() {
        return this._enabled;
    }

    /**
     * Draw a temporary debug ray that auto-removes after `duration` seconds.
     * @param {THREE.Vector3} origin
     * @param {THREE.Vector3} direction (will be normalized)
     * @param {number} length
     * @param {number|string} color
     * @param {number} duration seconds before the ray is removed (default 1.5)
     */
    debugRay(origin, direction, length = 5, color = 0xff0000, duration = 1.5) {
        const dir = direction.clone().normalize();
        const end = origin.clone().add(dir.multiplyScalar(length));
        const geometry = new THREE.BufferGeometry().setFromPoints([origin, end]);
        const material = new THREE.LineBasicMaterial({ color });
        const line = new THREE.Line(geometry, material);
        this._helperGroups.rays.add(line);
        this._rayVisuals.push({ line, expireAt: performance.now() + duration * 1000 });
        return line;
    }

    /**
     * Main update loop. Call once per frame.
     * @param {number} delta seconds since last frame
     */
    update(delta) {
        if (this._stats && this._settings.showStats) {
            this._stats.update();
        }

        if (!this._enabled) return;

        this._updateRays();
        this._updateBoundingBoxes();
        this._updateBoundingSpheres();
        this._updateColliderHelpers();
        this._updateLightHelpers();
        this._updateCameraHelper();
        this._updateInspector();
        this._updateStatsOverlay();

        if (this._transformControls && this._transformControls.object) {
            // TransformControls updates itself internally via its own render loop hooks,
            // but we keep this here in case a consumer needs explicit ticking.
        }
    }

    /** Fully tears down the debug manager: DOM, GUI, helpers, listeners. */
    destroy() {
        this._unbindEvents();

        // GUI
        if (this._gui) {
            this._gui.destroy();
            this._gui = null;
        }

        // Stats
        if (this._stats && this._stats.dom && this._stats.dom.parentNode) {
            this._stats.dom.parentNode.removeChild(this._stats.dom);
        }
        this._stats = null;

        // DOM panels
        if (this._inspectorPanel && this._inspectorPanel.parentNode) {
            this._inspectorPanel.parentNode.removeChild(this._inspectorPanel);
        }
        if (this._statsOverlay && this._statsOverlay.parentNode) {
            this._statsOverlay.parentNode.removeChild(this._statsOverlay);
        }
        this._inspectorPanel = null;
        this._statsOverlay = null;

        // TransformControls
        if (this._transformControls) {
            this._transformControls.detach();
            this._debugRoot.remove(this._transformControls);
            this._transformControls.dispose();
            this._transformControls = null;
        }

        // Dispose all tracked helpers
        this._disposeGroup(this._helperGroups.boundingBoxes);
        this._disposeGroup(this._helperGroups.boundingSpheres);
        this._disposeGroup(this._helperGroups.lights);
        this._disposeGroup(this._helperGroups.colliders);
        this._disposeGroup(this._helperGroups.rays);
        this._disposeGroup(this._helperGroups.selection);
        this._disposeGroup(this._helperGroups.camera);
        this._disposeGroup(this._helperGroups.grid);
        this._disposeGroup(this._helperGroups.axes);

        this._boxHelpers.clear();
        this._sphereHelpers.clear();
        this._lightHelpers.clear();
        this._colliderHelpers.clear();

        this._scene.remove(this._debugRoot);
        this._selectedObject = null;
    }

    // =====================================================================
    // SECTION: Grid / Axes
    // =====================================================================

    _initGridAndAxes() {
        const grid = new THREE.GridHelper(50, 50, 0x555555, 0x333333);
        this._helperGroups.grid.add(grid);

        const axes = new THREE.AxesHelper(5);
        this._helperGroups.axes.add(axes);

        this._helperGroups.grid.visible = this._settings.grid;
        this._helperGroups.axes.visible = this._settings.axes;
    }

    // =====================================================================
    // SECTION: Bounding Boxes (auto-detected, real-time)
    // =====================================================================

    _syncBoundingBoxHelpers() {
        const meshes = this._collectVisibleMeshes();
        const seen = new Set();

        meshes.forEach((mesh) => {
            seen.add(mesh);
            if (!this._boxHelpers.has(mesh)) {
                const helper = new THREE.BoxHelper(mesh, 0x00ffff);
                this._helperGroups.boundingBoxes.add(helper);
                this._boxHelpers.set(mesh, helper);
            }
        });

        // Remove stale helpers for meshes no longer present/visible
        for (const [mesh, helper] of this._boxHelpers) {
            if (!seen.has(mesh)) {
                this._helperGroups.boundingBoxes.remove(helper);
                helper.geometry.dispose();
                helper.material.dispose();
                this._boxHelpers.delete(mesh);
            }
        }
    }

    _updateBoundingBoxes() {
        if (!this._settings.boundingBoxes) return;
        this._syncBoundingBoxHelpers();
        this._boxHelpers.forEach((helper) => helper.update());
    }

    // =====================================================================
    // SECTION: Bounding Spheres (auto-detected, wireframe)
    // =====================================================================

    _syncSphereHelpers() {
        const meshes = this._collectVisibleMeshes();
        const seen = new Set();

        meshes.forEach((mesh) => {
            seen.add(mesh);
            if (!this._sphereHelpers.has(mesh)) {
                const geometry = new THREE.SphereGeometry(1, 12, 8);
                const material = new THREE.MeshBasicMaterial({
                    color: 0xff00ff,
                    wireframe: true,
                    depthTest: false
                });
                const sphere = new THREE.Mesh(geometry, material);
                this._helperGroups.boundingSpheres.add(sphere);
                this._sphereHelpers.set(mesh, sphere);
            }
        });

        for (const [mesh, sphere] of this._sphereHelpers) {
            if (!seen.has(mesh)) {
                this._helperGroups.boundingSpheres.remove(sphere);
                sphere.geometry.dispose();
                sphere.material.dispose();
                this._sphereHelpers.delete(mesh);
            }
        }
    }

    _updateBoundingSpheres() {
        if (!this._settings.boundingSpheres) return;
        this._syncSphereHelpers();

        this._sphereHelpers.forEach((sphere, mesh) => {
            if (!mesh.geometry) return;
            if (!mesh.geometry.boundingSphere) {
                mesh.geometry.computeBoundingSphere();
            }
            const bs = mesh.geometry.boundingSphere;
            if (!bs) return;

            const worldPos = new THREE.Vector3();
            mesh.getWorldPosition(worldPos);
            const center = bs.center.clone().applyMatrix4(mesh.matrixWorld);
            const worldScale = new THREE.Vector3();
            mesh.getWorldScale(worldScale);
            const maxScale = Math.max(worldScale.x, worldScale.y, worldScale.z);

            sphere.position.copy(center);
            sphere.scale.setScalar(bs.radius * maxScale);
        });
    }

    // =====================================================================
    // SECTION: Camera Helper
    // =====================================================================

    _updateCameraHelper() {
        if (!this._settings.cameraHelper) {
            if (this._activeCameraHelper) {
                this._helperGroups.camera.remove(this._activeCameraHelper);
                this._activeCameraHelper.dispose();
                this._activeCameraHelper = null;
            }
            return;
        }

        if (!this._activeCameraHelper) {
            this._activeCameraHelper = new THREE.CameraHelper(this._camera);
            this._helperGroups.camera.add(this._activeCameraHelper);
        }
        this._activeCameraHelper.update();
    }

    // =====================================================================
    // SECTION: Light Helpers (auto-detected)
    // =====================================================================

    _syncLightHelpers() {
        const lights = [];
        this._scene.traverse((obj) => {
            if (
                obj.isDirectionalLight ||
                obj.isPointLight ||
                obj.isSpotLight ||
                obj.isHemisphereLight
            ) {
                lights.push(obj);
            }
        });

        const seen = new Set();
        lights.forEach((light) => {
            seen.add(light);
            if (!this._lightHelpers.has(light)) {
                const helper = this._createLightHelper(light);
                if (helper) {
                    this._helperGroups.lights.add(helper);
                    this._lightHelpers.set(light, helper);
                }
            }
        });

        for (const [light, helper] of this._lightHelpers) {
            if (!seen.has(light)) {
                this._helperGroups.lights.remove(helper);
                if (helper.dispose) helper.dispose();
                this._lightHelpers.delete(light);
            }
        }
    }

    _createLightHelper(light) {
        if (light.isDirectionalLight) {
            return new THREE.DirectionalLightHelper(light, 1);
        }
        if (light.isPointLight) {
            return new THREE.PointLightHelper(light, 0.5);
        }
        if (light.isSpotLight) {
            return new THREE.SpotLightHelper(light);
        }
        if (light.isHemisphereLight) {
            return new THREE.HemisphereLightHelper(light, 1);
        }
        return null;
    }

    _updateLightHelpers() {
        if (!this._settings.lights) return;
        this._syncLightHelpers();
        this._lightHelpers.forEach((helper) => {
            if (helper.update) helper.update();
        });
    }

    // =====================================================================
    // SECTION: Collider Debug
    // =====================================================================

    _syncColliderHelpers() {
        const colliderMeshes = [];
        this._scene.traverse((obj) => {
            if (obj.isMesh && obj.userData && (obj.userData.collider || obj.userData.isCollider)) {
                colliderMeshes.push(obj);
            }
        });

        const seen = new Set();
        colliderMeshes.forEach((mesh) => {
            seen.add(mesh);
            if (!this._colliderHelpers.has(mesh)) {
                const material = new THREE.MeshBasicMaterial({
                    color: 0x00ff00,
                    wireframe: true,
                    depthTest: false
                });
                const wire = new THREE.Mesh(mesh.geometry, material);
                this._helperGroups.colliders.add(wire);
                this._colliderHelpers.set(mesh, wire);
            }
        });

        for (const [mesh, wire] of this._colliderHelpers) {
            if (!seen.has(mesh)) {
                this._helperGroups.colliders.remove(wire);
                wire.material.dispose();
                this._colliderHelpers.delete(mesh);
            }
        }
    }

    _updateColliderHelpers() {
        if (!this._settings.colliders) return;
        this._syncColliderHelpers();
        this._colliderHelpers.forEach((wire, mesh) => {
            mesh.updateWorldMatrix(true, false);
            wire.matrix.copy(mesh.matrixWorld);
            wire.matrix.decompose(wire.position, wire.quaternion, wire.scale);
            if (wire.geometry !== mesh.geometry) {
                wire.geometry = mesh.geometry;
            }
        });
    }

    // =====================================================================
    // SECTION: Ray Debug
    // =====================================================================

    _updateRays() {
        if (this._rayVisuals.length === 0) return;
        const now = performance.now();
        this._rayVisuals = this._rayVisuals.filter((entry) => {
            if (now >= entry.expireAt) {
                this._helperGroups.rays.remove(entry.line);
                entry.line.geometry.dispose();
                entry.line.material.dispose();
                return false;
            }
            return true;
        });
    }

    // =====================================================================
    // SECTION: Object Selection + Outline
    // =====================================================================

    _onPointerDown(event) {
        if (!this._enabled) return;
        // Ignore clicks landing on debug UI (GUI / panels)
        if (event.target.closest && event.target.closest('.dm-ui')) return;

        const rect = this._renderer.domElement.getBoundingClientRect();
        this._pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this._pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this._raycaster.setFromCamera(this._pointerNDC, this._camera);
        const meshes = this._collectVisibleMeshes().filter((m) => m !== this._debugRoot && !this._isDebugObject(m));
        const intersects = this._raycaster.intersectObjects(meshes, false);

        if (intersects.length > 0) {
            this._selectObject(intersects[0].object);
        } else {
            this._deselectObject();
        }
    }

    _isDebugObject(obj) {
        let node = obj;
        while (node) {
            if (node === this._debugRoot) return true;
            node = node.parent;
        }
        return false;
    }

    _selectObject(object) {
        this._selectedObject = object;

        this._helperGroups.selection.clear();
        const outline = new THREE.BoxHelper(object, 0xffff00);
        this._helperGroups.selection.add(outline);
        this._selectionOutline = outline;

        if (this._transformControls) {
            this._transformControls.attach(object);
        }
    }

    _deselectObject() {
        this._selectedObject = null;
        this._helperGroups.selection.clear();
        this._selectionOutline = null;
        if (this._transformControls) {
            this._transformControls.detach();
        }
    }

    _updateSelectionOutline() {
        if (this._selectionOutline && this._selectedObject) {
            this._selectionOutline.update();
        }
    }

    // =====================================================================
    // SECTION: Transform Gizmo
    // =====================================================================

    _initTransformControls() {
        this._transformControls = new TransformControls(this._camera, this._renderer.domElement);
        this._transformControls.setMode('translate');
        this._transformControls.addEventListener('dragging-changed', (event) => {
            if (this._orbitControls) {
                this._orbitControls.enabled = !event.value;
            }
        });
        this._debugRoot.add(this._transformControls);
    }

    // =====================================================================
    // SECTION: Keyboard Shortcuts
    // =====================================================================

    _onKeyDown(event) {
        if (event.key === 'F1') {
            event.preventDefault();
            this.setEnabled(!this._enabled);
            return;
        }

        if (!this._enabled) return;

        // Avoid hijacking typing inside inputs (e.g. lil-gui text fields)
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        switch (event.key.toLowerCase()) {
            case 'w':
                this._transformControls.setMode('translate');
                break;
            case 'e':
                this._transformControls.setMode('rotate');
                break;
            case 'r':
                this._transformControls.setMode('scale');
                break;
            case 'delete':
            case 'backspace':
                if (this._selectedObject) {
                    this._selectedObject.visible = false;
                }
                break;
            case 'escape':
                this._deselectObject();
                break;
            default:
                break;
        }
    }

    // =====================================================================
    // SECTION: Inspector Panel (DOM)
    // =====================================================================

    _initInspectorPanel() {
        const panel = document.createElement('div');
        panel.className = 'dm-ui';
        panel.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 280px;
            height: 100%;
            overflow-y: auto;
            background: rgba(20, 20, 20, 0.85);
            color: #e6e6e6;
            font: 12px/1.5 'Courier New', monospace;
            padding: 12px;
            box-sizing: border-box;
            z-index: 9999;
            display: none;
            pointer-events: auto;
        `;

        const title = document.createElement('div');
        title.textContent = 'INSPECTOR';
        title.style.cssText = 'font-weight:bold;letter-spacing:1px;margin-bottom:8px;color:#7fdbff;';
        panel.appendChild(title);

        const content = document.createElement('div');
        content.id = 'dm-inspector-content';
        panel.appendChild(content);

        document.body.appendChild(panel);
        this._inspectorPanel = panel;
        this._inspectorContent = content;
    }

    _updateInspector() {
        this._updateSelectionOutline();

        if (!this._selectedObject) {
            this._inspectorContent.innerHTML = '<em>No object selected</em>';
            return;
        }

        const obj = this._selectedObject;
        const mesh = obj.isMesh ? obj : null;
        const geometry = mesh ? mesh.geometry : null;
        const material = mesh ? mesh.material : null;

        let vertexCount = 0;
        let triangleCount = 0;
        if (geometry) {
            const posAttr = geometry.attributes.position;
            vertexCount = posAttr ? posAttr.count : 0;
            if (geometry.index) {
                triangleCount = geometry.index.count / 3;
            } else {
                triangleCount = vertexCount / 3;
            }
        }

        const materialName = Array.isArray(material)
            ? material.map((m) => m.name || m.type).join(', ')
            : (material ? (material.name || material.type) : 'N/A');

        const rows = [
            ['Name', obj.name || '(unnamed)'],
            ['UUID', obj.uuid],
            ['Position', this._formatVec3(obj.position)],
            ['Rotation', this._formatVec3(obj.rotation, true)],
            ['Scale', this._formatVec3(obj.scale)],
            ['Visible', String(obj.visible)],
            ['Parent', obj.parent ? (obj.parent.name || obj.parent.type) : 'None'],
            ['Children', String(obj.children.length)],
            ['Material', materialName],
            ['Geometry', geometry ? geometry.type : 'N/A'],
            ['Vertices', String(vertexCount)],
            ['Triangles', String(Math.floor(triangleCount))]
        ];

        this._inspectorContent.innerHTML = rows
            .map(
                ([label, value]) => `
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="color:#888;">${label}</span>
                    <span style="color:#fff;text-align:right;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${value}</span>
                </div>`
            )
            .join('');
    }

    _formatVec3(v, isRotation = false) {
        const factor = isRotation ? THREE.MathUtils.RAD2DEG : 1;
        const x = (v.x * factor).toFixed(2);
        const y = (v.y * factor).toFixed(2);
        const z = (v.z * factor).toFixed(2);
        return `${x}, ${y}, ${z}`;
    }

    // =====================================================================
    // SECTION: Scene Statistics Overlay
    // =====================================================================

    _initStats() {
        this._stats = new Stats();
        this._stats.dom.style.cssText += 'position:fixed;top:0;left:0;z-index:10000;display:none;';
        document.body.appendChild(this._stats.dom);
    }

    _initStatsOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'dm-ui';
        overlay.style.cssText = `
            position: fixed;
            top: 50px;
            left: 0;
            width: 220px;
            background: rgba(20, 20, 20, 0.85);
            color: #e6e6e6;
            font: 11px/1.6 'Courier New', monospace;
            padding: 10px;
            box-sizing: border-box;
            z-index: 9999;
            display: none;
            pointer-events: none;
        `;
        document.body.appendChild(overlay);
        this._statsOverlay = overlay;
        this._lastFrameTime = performance.now();
    }

    _updateStatsOverlay() {
        if (!this._settings.showStats) {
            this._statsOverlay.style.display = 'none';
            return;
        }
        this._statsOverlay.style.display = 'block';

        const now = performance.now();
        const frameTime = now - this._lastFrameTime;
        this._lastFrameTime = now;
        const fps = frameTime > 0 ? (1000 / frameTime).toFixed(1) : '0.0';

        const info = this._renderer.info;
        const rows = [
            ['FPS', fps],
            ['Frame Time', `${frameTime.toFixed(2)} ms`],
            ['Draw Calls', String(info.render.calls)],
            ['Triangles', String(info.render.triangles)],
            ['Points', String(info.render.points)],
            ['Lines', String(info.render.lines)],
            ['Textures', String(info.memory.textures)],
            ['Geometries', String(info.memory.geometries)],
            ['Programs', String(info.programs ? info.programs.length : 0)]
        ];

        this._statsOverlay.innerHTML = rows
            .map(
                ([label, value]) => `
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:#888;">${label}</span>
                    <span style="color:#7fdbff;">${value}</span>
                </div>`
            )
            .join('');
    }

    // =====================================================================
    // SECTION: GUI (lil-gui)
    // =====================================================================

    _initGUI() {
        this._gui = new GUI({ title: 'Debug Manager' });
        this._gui.domElement.classList.add('dm-ui');
        this._gui.domElement.style.cssText += 'position:fixed;top:0;left:230px;z-index:10001;display:none;';

        const helpersFolder = this._gui.addFolder('Helpers');
        helpersFolder.add(this._settings, 'grid').name('Grid').onChange((v) => {
            this._helperGroups.grid.visible = v;
        });
        helpersFolder.add(this._settings, 'axes').name('Axes').onChange((v) => {
            this._helperGroups.axes.visible = v;
        });
        helpersFolder.add(this._settings, 'boundingBoxes').name('Bounding Boxes').onChange((v) => {
            this._helperGroups.boundingBoxes.visible = v;
            if (!v) this._clearBoundingBoxHelpers();
        });
        helpersFolder.add(this._settings, 'boundingSpheres').name('Bounding Spheres').onChange((v) => {
            this._helperGroups.boundingSpheres.visible = v;
            if (!v) this._clearSphereHelpers();
        });
        helpersFolder.add(this._settings, 'lights').name('Lights').onChange((v) => {
            this._helperGroups.lights.visible = v;
            if (!v) this._clearLightHelpers();
        });
        helpersFolder.add(this._settings, 'cameraHelper').name('Camera').onChange((v) => {
            this._helperGroups.camera.visible = v;
        });
        helpersFolder.add(this._settings, 'colliders').name('Colliders').onChange((v) => {
            this._helperGroups.colliders.visible = v;
            if (!v) this._clearColliderHelpers();
        });
        helpersFolder.open();

        const renderingFolder = this._gui.addFolder('Rendering');
        renderingFolder.add(this._settings, 'wireframeAll').name('Wireframe All').onChange((v) => {
            this._setWireframeAll(v);
        });
        renderingFolder.add(this._settings, 'showStats').name('Show Stats').onChange((v) => {
            if (this._stats) this._stats.dom.style.display = v ? 'block' : 'none';
        });
        renderingFolder.open();
    }

    // =====================================================================
    // SECTION: Cleanup helpers for toggles
    // =====================================================================

    _clearBoundingBoxHelpers() {
        this._boxHelpers.forEach((helper) => {
            this._helperGroups.boundingBoxes.remove(helper);
            helper.geometry.dispose();
            helper.material.dispose();
        });
        this._boxHelpers.clear();
    }

    _clearSphereHelpers() {
        this._sphereHelpers.forEach((sphere) => {
            this._helperGroups.boundingSpheres.remove(sphere);
            sphere.geometry.dispose();
            sphere.material.dispose();
        });
        this._sphereHelpers.clear();
    }

    _clearLightHelpers() {
        this._lightHelpers.forEach((helper) => {
            this._helperGroups.lights.remove(helper);
            if (helper.dispose) helper.dispose();
        });
        this._lightHelpers.clear();
    }

    _clearColliderHelpers() {
        this._colliderHelpers.forEach((wire) => {
            this._helperGroups.colliders.remove(wire);
            wire.material.dispose();
        });
        this._colliderHelpers.clear();
    }

    _setWireframeAll(value) {
        this._scene.traverse((obj) => {
            if (obj.isMesh && obj.material && !this._isDebugObject(obj)) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach((m) => {
                        m.wireframe = value;
                    });
                } else {
                    obj.material.wireframe = value;
                }
            }
        });
    }

    // =====================================================================
    // SECTION: Utility
    // =====================================================================

    /** Collect every visible Mesh in the scene, excluding debug-owned objects. */
    _collectVisibleMeshes() {
        const meshes = [];
        this._scene.traverse((obj) => {
            if (obj.isMesh && obj.visible && !this._isDebugObject(obj)) {
                meshes.push(obj);
            }
        });
        return meshes;
    }

    _disposeGroup(group) {
        const children = [...group.children];
        children.forEach((child) => {
            group.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
            if (child.dispose) child.dispose();
        });
    }

    _applyEnabledState() {
        this._debugRoot.visible = this._enabled;

        if (this._inspectorPanel) {
            this._inspectorPanel.style.display = this._enabled ? 'block' : 'none';
        }
        if (this._statsOverlay) {
            this._statsOverlay.style.display = this._enabled && this._settings.showStats ? 'block' : 'none';
        }
        if (this._stats) {
            this._stats.dom.style.display = this._enabled && this._settings.showStats ? 'block' : 'none';
        }
        if (this._gui) {
            this._gui.domElement.style.display = this._enabled ? 'block' : 'none';
        }

        // Re-apply individual group visibility according to settings when enabled
        if (this._enabled) {
            this._helperGroups.grid.visible = this._settings.grid;
            this._helperGroups.axes.visible = this._settings.axes;
            this._helperGroups.boundingBoxes.visible = this._settings.boundingBoxes;
            this._helperGroups.boundingSpheres.visible = this._settings.boundingSpheres;
            this._helperGroups.lights.visible = this._settings.lights;
            this._helperGroups.camera.visible = this._settings.cameraHelper;
            this._helperGroups.colliders.visible = this._settings.colliders;
        } else {
            // Detach gizmo and clear transient selection when disabling
            this._deselectObject();
        }
    }

    _onWindowResize() {
        // Reserved hook: consumers typically manage renderer/camera resize themselves.
        // Present for API completeness and future extension (e.g. repositioning panels).
    }

    // =====================================================================
    // SECTION: Event Binding
    // =====================================================================

    _bindEvents() {
        window.addEventListener('keydown', this._onKeyDown);
        this._renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('resize', this._onWindowResize);
    }

    _unbindEvents() {
        window.removeEventListener('keydown', this._onKeyDown);
        this._renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('resize', this._onWindowResize);
    }
}
