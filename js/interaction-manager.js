// ============================================================================
// interaction-manager.js
// Owns every placed object (door/window/beam/slab/plank/brick instances),
// selection state, and the touch/pointer gestures used to move, rotate and
// scale the current selection. Shared identically between AR mode and the
// desktop/mobile 3D Preview mode — both just point it at their own camera
// and renderer DOM element.
// ============================================================================

import * as THREE from 'three';
import { MODELS, APP_CONFIG } from './config.js';
import { computePlacementTransform } from './placement.js';

let nextId = 1;

// Undo/redo keeps this many snapshots per stack before dropping the oldest.
const MAX_HISTORY = 50;

export class InteractionManager {
  /**
   * @param {THREE.Scene} scene
   * @param {ModelManager} modelManager
   */
  constructor(scene, modelManager) {
    this.scene = scene;
    this.modelManager = modelManager;

    /** @type {Map<number, {id:number, modelId:string, group:THREE.Group, original:{position:THREE.Vector3, quaternion:THREE.Quaternion, scale:THREE.Vector3}}>} */
    this.objects = new Map();
    this.selectedId = null;

    this._raycaster = new THREE.Raycaster();

    // Gesture state
    this._pointers = new Map(); // pointerId -> {x,y}
    this._dragging = false;
    this._dragPlane = new THREE.Plane();
    this._dragOffset = new THREE.Vector3();
    this._pinchStart = null; // {distance, angle, scale, rotationY}
    this._pointerDownInfo = null; // {x, y, time}
    this._tapMoveThreshold = 10; // px
    this._tapTimeThreshold = 400; // ms

    // When true, a one-finger drag ANYWHERE on screen moves the current
    // selection (armed by the "Move" button) rather than requiring the
    // drag to start precisely on the model's mesh.
    this.moveModeActive = false;

    // Undo/redo. Snapshot-based (captures the full placed-object list)
    // rather than per-action inverses, so every mutation type — place,
    // delete, clear, reset, rotate, scale, move, duplicate, quantity,
    // load — is undoable through the same mechanism without bespoke
    // inverse logic per action.
    this._undoStack = [];
    this._redoStack = [];

    this.listeners = {
      selectionChange: [],
      objectsChange: [],
      loadError: [],
      historyChange: [],
    };
  }

  on(event, cb) {
    this.listeners[event]?.push(cb);
  }

  _emit(event, payload) {
    this.listeners[event]?.forEach((cb) => cb(payload));
  }

  // --------------------------------------------------------------------
  // Placement
  // --------------------------------------------------------------------

/**
   * @param {string} modelId
   * @param {THREE.Vector3} position - raw hit position (surface hit point).
   * @param {THREE.Quaternion} quaternion - raw hit orientation.
   * @param {{snapToSurface?: boolean, cameraForward?: THREE.Vector3|null}} [options]
   *   snapToSurface: when true, run the raw hit through placement.js's
   *   computePlacementTransform so the object's base rests exactly on the
   *   detected surface and upright models (door/window) never inherit a
   *   tilted hit-test normal. When false, the raw hit pose is used as-is.
   */
async placeModel(modelId, position, quaternion = new THREE.Quaternion(), options = {}) {
  const { snapToSurface = false, cameraForward = null } = options;

  let wrapper;

  try {
    wrapper = await this.modelManager.createInstance(modelId);
  } catch (err) {
    console.error('Failed to create model:', err);

    this._emit(
      'loadError',
      err.message || String(err)
    );

    return null;
  }

  // Snapshot the pre-placement state so this placement can be undone.
  this._pushUndoSnapshot();

  let finalPosition = position;
  let finalQuaternion = quaternion;

  if (snapToSurface) {
    const transform = computePlacementTransform(
      modelId,
      position,
      quaternion,
      wrapper.userData.baseOffset || 0,
      cameraForward
    );

    finalPosition = transform.position;
    finalQuaternion = transform.quaternion;
  }

  wrapper.position.copy(finalPosition);
  wrapper.quaternion.copy(finalQuaternion);

    const id = nextId++;

    const record = {
      id,
      modelId,
      group: wrapper,
      original: {
        position: finalPosition.clone(),
        quaternion: finalQuaternion.clone(),
        scale: wrapper.scale.clone(),
      },
    };

    wrapper.userData.placedId = id;

    this.objects.set(id, record);

    this._emit('objectsChange', this.list());

    this.selectObject(id);

    return record;
  }

  list() {
    return Array.from(this.objects.values());
  }

  // --------------------------------------------------------------------
  // Selection
  // --------------------------------------------------------------------

  selectObject(id) {
    if (this.selectedId === id) return;

    this._setHighlight(this.selectedId, false);

    this.selectedId = id;

    this._setHighlight(this.selectedId, true);

    if (id == null) {
      this.moveModeActive = false;
    }

    this._emit(
      'selectionChange',
      this.getSelected()
    );
  }

  clearSelection() {
    this.selectObject(null);
  }

  setMoveMode(active) {
    this.moveModeActive =
      !!active && this.selectedId != null;

    return this.moveModeActive;
  }

  getSelected() {
    return this.selectedId != null
      ? this.objects.get(this.selectedId) || null
      : null;
  }

  _setHighlight(id, on) {
    const rec =
      id != null
        ? this.objects.get(id)
        : null;

    if (!rec) return;

    rec.group.traverse((node) => {
      if (!node.isMesh) return;

      const mats = Array.isArray(node.material)
        ? node.material
        : [node.material];

      mats.forEach((m) => {
        if (!m) return;

        if (on) {
          if (m.emissive) {
            m.userData._prevEmissive =
              m.userData._prevEmissive ??
              m.emissive.getHex();

            m.emissive.set(0x2d6cdf);
            m.emissiveIntensity = 0.28;
          }
        } else if (
          m.emissive &&
          m.userData._prevEmissive !== undefined
        ) {
          m.emissive.setHex(
            m.userData._prevEmissive
          );

          m.emissiveIntensity = 1;
        }
      });
    });
  }

  // --------------------------------------------------------------------
  // Raycasting
  // --------------------------------------------------------------------

  /** Returns the placedId hit by a ray from camera through NDC. */
  raycastForObject(
    ndcX,
    ndcY,
    camera
  ) {
    this._raycaster.setFromCamera(
      {
        x: ndcX,
        y: ndcY,
      },
      camera
    );

    const groups = this
      .list()
      .map((r) => r.group);

    const hits =
      this._raycaster.intersectObjects(
        groups,
        true
      );

    if (!hits.length) return null;

    let node = hits[0].object;

    while (
      node &&
      node.userData.placedId === undefined
    ) {
      node = node.parent;
    }

    return node
      ? node.userData.placedId
      : null;
  }

  /** Ray-cast NDC against an arbitrary ground plane. */
  raycastGround(
    ndcX,
    ndcY,
    camera,
    groundY = 0
  ) {
    this._raycaster.setFromCamera(
      {
        x: ndcX,
        y: ndcY,
      },
      camera
    );

    const plane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      -groundY
    );

    const point = new THREE.Vector3();

    const hit =
      this._raycaster.ray.intersectPlane(
        plane,
        point
      );

    return hit ? point : null;
  }

  // --------------------------------------------------------------------
  // Transform helpers
  // --------------------------------------------------------------------

  rotateSelected(radians) {
    const rec = this.getSelected();

    if (!rec) return;

    rec.group.rotateY(radians);

    this._emit(
      'selectionChange',
      rec
    );
  }

  scaleSelectedBy(factor) {
    const rec = this.getSelected();

    if (!rec) return;

    const current =
      rec.group.scale.x;

    const target =
      THREE.MathUtils.clamp(
        current * factor,
        APP_CONFIG.minScale,
        APP_CONFIG.maxScale
      );

    rec.group.scale.setScalar(target);

    this._emit(
      'selectionChange',
      rec
    );
  }

  moveSelectedTo(vector3) {
    const rec = this.getSelected();

    if (!rec) return;

    rec.group.position.copy(vector3);

    this._emit(
      'selectionChange',
      rec
    );
  }

  // --------------------------------------------------------------------
  // Duplicate
  // --------------------------------------------------------------------

  async duplicateSelected() {
    const rec = this.getSelected();

    if (!rec) return null;

    const offset =
      APP_CONFIG.duplicateOffset;

    const pos =
      rec.group.position
        .clone()
        .add(
          new THREE.Vector3(
            offset.x,
            offset.y,
            offset.z
          )
        );

    const quat =
      rec.group.quaternion.clone();

    const dup =
      await this.placeModel(
        rec.modelId,
        pos,
        quat
      );

    if (dup) {
      dup.group.scale.copy(
        rec.group.scale
      );
    }

    return dup;
  }

  // --------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------

  resetSelected() {
    const rec = this.getSelected();

    if (!rec) return;

    rec.group.position.copy(
      rec.original.position
    );

    rec.group.quaternion.copy(
      rec.original.quaternion
    );

    rec.group.scale.copy(
      rec.original.scale
    );

    this._emit(
      'selectionChange',
      rec
    );
  }

  // --------------------------------------------------------------------
  // Delete
  // --------------------------------------------------------------------

  deleteSelected() {
    const rec = this.getSelected();

    if (!rec) return;

    this.scene.remove(rec.group);

    ModelManager.dispose(rec.group);

    this.objects.delete(rec.id);

    this.selectedId = null;

    this._emit(
      'selectionChange',
      null
    );

    this._emit(
      'objectsChange',
      this.list()
    );
  }

  // --------------------------------------------------------------------
  // Clear
  // --------------------------------------------------------------------

  clearAll() {
    this.list().forEach((rec) => {
      this.scene.remove(rec.group);

      ModelManager.dispose(
        rec.group
      );
    });

    this.objects.clear();

    this.selectedId = null;

    this._emit(
      'selectionChange',
      null
    );

    this._emit(
      'objectsChange',
      this.list()
    );
  }

  // --------------------------------------------------------------------
  // Shared pointer gestures
  // --------------------------------------------------------------------

  attachGestures(
    domElement,
    { getCamera, onEmptyTap }
  ) {
    const toNDC = (
      clientX,
      clientY
    ) => {
      const rect =
        domElement.getBoundingClientRect();

      return {
        x:
          ((clientX - rect.left) /
            rect.width) *
            2 -
          1,

        y:
          -(
            ((clientY - rect.top) /
              rect.height) *
              2 -
            1
          ),
      };
    };

    const onPointerDown = (e) => {
      this._pointers.set(
        e.pointerId,
        {
          x: e.clientX,
          y: e.clientY,
        }
      );

      domElement.setPointerCapture?.(
        e.pointerId
      );

      if (this._pointers.size === 1) {
        this._pointerDownInfo = {
          x: e.clientX,
          y: e.clientY,
          time: performance.now(),
        };

        const ndc =
          toNDC(
            e.clientX,
            e.clientY
          );

        const camera = getCamera();

        if (!camera) return;

        const hitId =
          this.raycastForObject(
            ndc.x,
            ndc.y,
            camera
          );

        if (hitId != null) {
          this.selectObject(hitId);

          this._beginDrag(
            ndc,
            camera,
            false
          );
        } else if (
          this.moveModeActive &&
          this.getSelected()
        ) {
          this._beginDrag(
            ndc,
            camera,
            true
          );
        } else {
          this._dragging = false;
        }
      } else if (
        this._pointers.size === 2
      ) {
        this._dragging = false;

        const pts =
          Array.from(
            this._pointers.values()
          );

        this._pinchStart =
          this._computePinchState(
            pts
          );

        const rec =
          this.getSelected();

        if (rec) {
          this._pinchStart.startScale =
            rec.group.scale.x;

          this._pinchStart.startRotationY =
            rec.group.rotation.y;
        }
      }
    };

    const onPointerMove = (e) => {
      if (
        !this._pointers.has(
          e.pointerId
        )
      ) {
        return;
      }

      this._pointers.set(
        e.pointerId,
        {
          x: e.clientX,
          y: e.clientY,
        }
      );

      if (
        this._pointers.size === 1 &&
        this._dragging
      ) {
        const ndc =
          toNDC(
            e.clientX,
            e.clientY
          );

        const camera = getCamera();

        if (!camera) return;

        this._continueDrag(
          ndc,
          camera
        );
      } else if (
        this._pointers.size === 2 &&
        this._pinchStart
      ) {
        const rec =
          this.getSelected();

        if (!rec) return;

        const pts =
          Array.from(
            this._pointers.values()
          );

        const now =
          this._computePinchState(
            pts
          );

        const scaleFactor =
          now.distance /
          this._pinchStart.distance;

        const target =
          THREE.MathUtils.clamp(
            this._pinchStart.startScale *
              scaleFactor,
            APP_CONFIG.minScale,
            APP_CONFIG.maxScale
          );

        rec.group.scale.setScalar(
          target
        );

        const angleDelta =
          now.angle -
          this._pinchStart.angle;

        rec.group.rotation.y =
          this._pinchStart.startRotationY +
          angleDelta;

        this._emit(
          'selectionChange',
          rec
        );
      }
    };

    const onPointerUp = (e) => {
      const wasSinglePointerTap =
        this._pointers.size === 1 &&
        this._pointerDownInfo &&
        !this._dragging &&
        performance.now() -
          this._pointerDownInfo.time <
          this._tapTimeThreshold &&
        Math.hypot(
          e.clientX -
            this._pointerDownInfo.x,
          e.clientY -
            this._pointerDownInfo.y
        ) <
          this._tapMoveThreshold;

      this._pointers.delete(
        e.pointerId
      );

      domElement.releasePointerCapture?.(
        e.pointerId
      );

      if (
        this._pointers.size < 2
      ) {
        this._pinchStart = null;
      }

      if (
        this._pointers.size === 0
      ) {
        this._dragging = false;

        if (wasSinglePointerTap) {
          const ndc =
            toNDC(
              e.clientX,
              e.clientY
            );

          const camera = getCamera();

          if (camera) {
            const hitId =
              this.raycastForObject(
                ndc.x,
                ndc.y,
                camera
              );

            if (hitId != null) {
              this.selectObject(
                hitId
              );
            } else {
              onEmptyTap?.(
                ndc.x,
                ndc.y
              );
            }
          }
        }
      }
    };

    domElement.addEventListener(
      'pointerdown',
      onPointerDown
    );

    domElement.addEventListener(
      'pointermove',
      onPointerMove
    );

    domElement.addEventListener(
      'pointerup',
      onPointerUp
    );

    domElement.addEventListener(
      'pointercancel',
      onPointerUp
    );

    // Return detach function
    return () => {
      domElement.removeEventListener(
        'pointerdown',
        onPointerDown
      );

      domElement.removeEventListener(
        'pointermove',
        onPointerMove
      );

      domElement.removeEventListener(
        'pointerup',
        onPointerUp
      );

      domElement.removeEventListener(
        'pointercancel',
        onPointerUp
      );
    };
  }

  // --------------------------------------------------------------------
  // Pinch state
  // --------------------------------------------------------------------

  _computePinchState(pts) {
    const [a, b] = pts;

    const dx =
      b.x - a.x;

    const dy =
      b.y - a.y;

    return {
      distance:
        Math.hypot(dx, dy),

      angle:
        Math.atan2(dy, dx),
    };
  }

  // --------------------------------------------------------------------
  // Dragging
  // --------------------------------------------------------------------

  _beginDrag(
    ndc,
    camera,
    followTouchDirectly
  ) {
    const rec =
      this.getSelected();

    if (!rec) return;

    this._dragPlane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 1, 0),
      rec.group.position
    );

    this._raycaster.setFromCamera(
      ndc,
      camera
    );

    const hit =
      new THREE.Vector3();

    if (
      this._raycaster.ray.intersectPlane(
        this._dragPlane,
        hit
      )
    ) {
      this._dragOffset.copy(
        followTouchDirectly
          ? new THREE.Vector3(0, 0, 0)
          : rec.group.position
              .clone()
              .sub(hit)
      );

      this._dragging = true;
    }
  }

  _continueDrag(
    ndc,
    camera
  ) {
    const rec =
      this.getSelected();

    if (!rec) return;

    this._raycaster.setFromCamera(
      ndc,
      camera
    );

    const hit =
      new THREE.Vector3();

    if (
      this._raycaster.ray.intersectPlane(
        this._dragPlane,
        hit
      )
    ) {
      rec.group.position.copy(
        hit.add(
          this._dragOffset
        )
      );

      this._emit(
        'selectionChange',
        rec
      );
    }
  }
}