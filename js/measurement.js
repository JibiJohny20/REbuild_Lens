// ============================================================================
// measurement.js
// "Tap two points" measurement, shared by AR mode and 3D Preview mode.
//
// DESIGN NOTE on how a "tap" becomes a 3D point:
// This app's existing AR placement already works by aiming a single,
// viewer-centered reticle (see ar.js) and tapping anywhere on screen to
// confirm — the tap location itself is never raycast against the real
// world. Measurement reuses that exact convention for consistency and to
// avoid requiring WebXR's separate "transient-input hit test" feature
// (aim-at-point-A, tap to record; re-aim at point-B, tap to record).
// In 3D Preview mode there's no such constraint, so measurement taps there
// ARE raycast against the ground plane at the actual tap location.
// Either way, by the time a point reaches MeasurementManager it's already
// a resolved THREE.Vector3 — this class only does the distance math.
// ============================================================================

import * as THREE from 'three';

export class MeasurementManager {
  constructor() {
    this.active = false;
    this.mode = null; // 'width' | 'height'
    this.points = [];
    this.result = { width: null, height: null, depth: null, estimated: true };

    this.listeners = { pointAdded: [], measurementComplete: [], resultChange: [], cancelled: [] };
  }

  on(event, cb) {
    this.listeners[event]?.push(cb);
  }

  _emit(event, payload) {
    this.listeners[event]?.forEach((cb) => cb(payload));
  }

  start(mode) {
    if (mode !== 'width' && mode !== 'height') {
      throw new Error(`Unknown measurement mode: ${mode}`);
    }
    this.active = true;
    this.mode = mode;
    this.points = [];
  }

  cancel() {
    this.active = false;
    this.mode = null;
    this.points = [];
    this._emit('cancelled');
  }

  isActive() {
    return this.active;
  }

  /** @param {THREE.Vector3} worldPosition */
  addPoint(worldPosition) {
    if (!this.active) return null;

    this.points.push(worldPosition.clone());
    this._emit('pointAdded', { index: this.points.length, mode: this.mode });

    if (this.points.length < 2) {
      return null;
    }

    const distance = this.points[0].distanceTo(this.points[1]);
    const completedMode = this.mode;
    const measuredPoints = this.points.slice();

    this.result[completedMode] = distance;
    this.result.estimated = true;

    this.active = false;
    this.mode = null;
    this.points = [];

    const payload = { mode: completedMode, distance, points: measuredPoints };

    this._emit('measurementComplete', payload);
    this._emit('resultChange', this.getResult());

    return payload;
  }

  reset() {
    this.active = false;
    this.mode = null;
    this.points = [];
    this.result = { width: null, height: null, depth: null, estimated: true };
    this._emit('resultChange', this.getResult());
  }

  getResult() {
    return { ...this.result };
  }

  hasOpening() {
    return this.result.width != null && this.result.height != null;
  }
}

// ============================================================================
// Lightweight in-scene visual feedback for measurement: a small sphere at
// each tapped point and a connecting line while a two-tap measurement is in
// progress. Purely cosmetic — kept separate from MeasurementManager so the
// measurement math stays scene/THREE-agnostic.
// ============================================================================

export class MeasurementVisuals {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'measurement-visuals';
    this.scene.add(this.group);
  }

  addMarker(position) {
    const geometry = new THREE.SphereGeometry(0.012, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xffb020 });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    this.group.add(marker);
    return marker;
  }

  addLine(pointA, pointB) {
    const geometry = new THREE.BufferGeometry().setFromPoints([pointA, pointB]);
    const material = new THREE.LineBasicMaterial({ color: 0xffb020 });
    const line = new THREE.Line(geometry, material);
    this.group.add(line);
    return line;
  }

  clear() {
    [...this.group.children].forEach((child) => {
      this.group.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    });
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}