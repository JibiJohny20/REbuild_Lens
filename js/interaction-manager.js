// ============================================================================
// interaction-manager.js
// Owns every placed object (door/window/beam/slab/plank/brick instances),
// selection state, and the touch/pointer gestures used to move, rotate and
// scale the current selection. Shared identically between AR mode and the
// desktop/mobile 3D Preview mode — both just point it at their own camera
// and renderer DOM element.
// ============================================================================

import * as THREE from 'three';
import { MODELS, APP_CONFIG, COLLISION_CONFIG } from './config.js';
import { ModelManager } from './model-manager.js';
import { computePlacementTransform } from './placement.js';
import { checkCollisions as computeCollisions } from './collision.js';

let nextId = 1;

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

    this.listeners = {
      selectionChange: [],
      objectsChange: [],
      loadError: [],
      sceneReset: [],
      collisionChange: [],
    };

    // Collision state, recomputed on transform-committing actions only
    // (never per animation frame — see collision.js's header comment).
    this._collisionIds = new Set();
    this._warningIds = new Set();
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

// `hitQuaternion` is the raw pose from AR hit-test (or the synthetic
// ground-plane pose from preview mode) — its local +Y encodes the
// detected surface's normal. `cameraForwardHint` is only used for
// upright objects placed on a floor (see placement.js for why).
async placeModel(modelId, hitPosition, hitQuaternion = new THREE.Quaternion(), cameraForwardHint = null) {
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

  const baseOffset = wrapper.userData.baseOffset || 0;

  const { position, quaternion, surfaceType } = computePlacementTransform(
    modelId,
    hitPosition,
    hitQuaternion,
    baseOffset,
    cameraForwardHint
  );

  return this._finalizeInstance(modelId, wrapper, position, quaternion, surfaceType);
}

  // --------------------------------------------------------------------
  // Shared bookkeeping once a final world position/quaternion is known.
  // Used by placeModel() (after running the hit pose through
  // computePlacementTransform) AND by duplicateSelected() (which already
  // has an exact, final placed transform and must NOT run it back through
  // the surface-normal placement math — that math assumes its input is a
  // raw hit-test pose, and an already-placed object's own quaternion
  // doesn't carry that meaning).
  // --------------------------------------------------------------------
  _finalizeInstance(modelId, wrapper, position, quaternion, surfaceType) {
    wrapper.position.copy(position);
    wrapper.quaternion.copy(quaternion);

    const id = nextId++;

    const record = {
      id,
      modelId,
      group: wrapper,
      surfaceType,
      original: {
        position: position.clone(),
        quaternion: quaternion.clone(),
        scale: wrapper.scale.clone(),
      },
    };

    wrapper.userData.placedId = id;

    this.objects.set(id, record);

    this._emit('objectsChange', this.list());

    this.selectObject(id);

    this.checkCollisions();

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

    const previous = this.selectedId;

    this.selectedId = id;

    this._applyVisualState(previous);
    this._applyVisualState(id);

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

  // --------------------------------------------------------------------
  // Visual state: selection highlight (blue) and collision tint
  // (red = actual overlap, orange = insufficient clearance) can apply to
  // the same object at once. Collision always outranks selection visually
  // so a colliding object stays obviously flagged even while selected.
  // --------------------------------------------------------------------

  _applyVisualState(id) {
    const rec =
      id != null
        ? this.objects.get(id)
        : null;

    if (!rec) return;

    let color = null;

    if (this._collisionIds.has(id)) {
      color = 0xd93b2b; // collision
    } else if (this._warningIds.has(id)) {
      color = 0xe6a326; // insufficient clearance
    } else if (this.selectedId === id) {
      color = 0x2d6cdf; // selected
    }

    rec.group.traverse((node) => {
      if (!node.isMesh) return;

      const mats = Array.isArray(node.material)
        ? node.material
        : [node.material];

      mats.forEach((m) => {
        if (!m || !m.emissive) return;

        m.userData._prevEmissive =
          m.userData._prevEmissive ??
          m.emissive.getHex();

        if (color != null) {
          m.emissive.set(color);
          m.emissiveIntensity = 0.28;
        } else {
          m.emissive.setHex(m.userData._prevEmissive);
          m.emissiveIntensity = 1;
        }
      });
    });
  }

  // --------------------------------------------------------------------
  // Collision detection
  // --------------------------------------------------------------------
  // Called after any action that commits a new transform (place,
  // duplicate, move finishes, rotate, scale, delete, clear, reset) — never
  // from inside a per-frame loop, per the performance requirements.
  checkCollisions() {
    const { collisions, warnings } = computeCollisions(
      this.list(),
      COLLISION_CONFIG.clearanceMargin
    );

    this._collisionIds = collisions;
    this._warningIds = warnings;

    this.list().forEach((rec) => this._applyVisualState(rec.id));

    this._emit('collisionChange', {
      collisions: [...collisions],
      warnings: [...warnings],
    });

    return { collisions, warnings };
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

    this.checkCollisions();

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

    this.checkCollisions();

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

    let wrapper;

    try {
      wrapper = await this.modelManager.createInstance(rec.modelId);
    } catch (err) {
      console.error('Failed to duplicate model:', err);

      this._emit('loadError', err.message || String(err));

      return null;
    }

    // Exact transform, already placed — skip computePlacementTransform
    // (see _finalizeInstance's comment for why).
    const dup = this._finalizeInstance(
      rec.modelId,
      wrapper,
      pos,
      quat,
      rec.surfaceType
    );

    dup.group.scale.copy(rec.group.scale);
    dup.original.scale.copy(rec.group.scale);

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

  // ROOT CAUSE (delete / clear-scene / multi-object-deletion bugs):
  // this used to call `ModelManager.dispose(rec.group)` as if it were a
  // static method. ModelManager.dispose() is an INSTANCE method with a
  // completely different job (tear down the whole manager: clear every
  // instance, wipe the template cache, dispose the Draco decoder) — there
  // is no static `dispose`. Calling it threw a TypeError immediately.
  //
  // Because `this.scene.remove(rec.group)` ran on the line BEFORE the
  // throw, the object visually vanished, but everything after the crash
  // never ran: `this.objects.delete(rec.id)` was skipped, so the stale
  // record stayed in the `objects` Map forever, `selectedId` was never
  // cleared, and the 'objectsChange'/'selectionChange' events never fired.
  // The object's mesh/material also never got disposed (leak), and it was
  // never removed from ModelManager's own `instances` Set either, since
  // that removal only happens inside the real `removeInstance()` method,
  // which this code bypassed entirely.
  //
  // With object #1's stale record still sitting in the map after the
  // first "delete", creating more objects and trying to delete THOSE hit
  // the same crash again — matching "first object deletes, later ones
  // don't" and "delete works sometimes."
  //
  // Fix: route through ModelManager's real instance method, which does
  // scene removal + instances-Set removal + geometry/material disposal in
  // one correct place.
  deleteSelected() {
    const rec = this.getSelected();

    if (!rec) return;

    this.modelManager.removeInstance(rec.group);

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

  // Same root cause as deleteSelected(): the old `ModelManager.dispose()`
  // call threw on the FIRST object in the loop, which aborted the entire
  // forEach — so Clear Scene only ever removed one object from the scene
  // (the first) and never reached `this.objects.clear()`, leaving every
  // other placed object still visible and still tracked.
  clearAll() {
    this.list().forEach((rec) => {
      this.modelManager.removeInstance(rec.group);
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
  // Reset (whole-scene reset, distinct from Clear Scene)
  // --------------------------------------------------------------------
  // "Reset" and "Clear Scene" now do the same underlying cleanup — the
  // difference is UX only: Clear Scene asks for confirmation first (see
  // main.js), Reset is an instant "start over" action. Both must leave the
  // app in exactly the state a fresh page load would: no placed objects,
  // no selection, no move-mode armed. Fit/measurement UI state is cleared
  // by main.js in response to the 'sceneReset' event, since that state
  // lives in FitChecker/MeasurementManager, not here.
  resetScene() {
    this.clearAll();

    this._emit('sceneReset');
  }

  // --------------------------------------------------------------------
  // Shared pointer gestures
  // --------------------------------------------------------------------

  attachGestures(
    domElement,
    { getCamera, onEmptyTap, isMeasuring }
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

        // ROOT CAUSE (Will It Fit? not working in AR): every tap used to
        // raycast against placed objects FIRST, regardless of what mode
        // the app was in. Measuring a real-world opening almost always
        // means tapping right on/near the object you're checking the fit
        // of (e.g. tapping the edges of a doorway with a door model
        // already placed there to compare against) — so the tap kept
        // hitting that object and re-selecting/dragging it instead of
        // ever reaching the measurement code. While a measurement is in
        // progress, object selection and dragging are suppressed
        // entirely so every tap unambiguously becomes a measurement
        // point.
        if (isMeasuring?.()) {
          this._dragging = false;
          return;
        }

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

          // Same reasoning as onPointerDown above: while measuring, never
          // let object hit-testing intercept the tap — it always becomes
          // a measurement point.
          if (isMeasuring?.()) {
            onEmptyTap?.(
              ndc.x,
              ndc.y
            );

            return;
          }

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