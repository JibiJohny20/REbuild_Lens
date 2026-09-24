// ============================================================================
// placement.js
// Surface-aware placement orientation.
//
// ROOT CAUSE of the "door appears tilted/lying down" bug:
// the old code copied the WebXR hit-test pose's quaternion onto every
// placed model verbatim. A hit-test pose orients its local +Y axis to the
// detected surface's normal — for a slightly uneven floor, or (worse) for
// a wall, that normal is nowhere near world-up, so the door inherited that
// tilt/roll directly and could end up lying flat or leaning.
//
// Fix: classify the hit surface as floor/wall from the pose's normal, and
// for models flagged `upright: true` in config.js, discard the surface's
// pitch/roll entirely and rebuild a quaternion that keeps world Y as up,
// using only a yaw (rotation about world Y) so the object still faces a
// sensible direction. Non-upright models keep following the detected
// surface as before (so a brick or plank can still lie flat on a floor or
// sit flush against a wall).
// ============================================================================

import * as THREE from 'three';
import { MODELS, APP_CONFIG } from './config.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const floorCosTolerance = Math.cos(
  THREE.MathUtils.degToRad(APP_CONFIG.floorNormalToleranceDeg)
);

/**
 * A WebXR/hit-test pose orients its local +Y axis to the surface normal.
 * This works identically for the 3D Preview's synthetic ground-plane hits,
 * since those are constructed with the same convention.
 */
export function getSurfaceNormal(hitQuaternion) {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(hitQuaternion).normalize();
}

export function classifySurface(hitQuaternion) {
  const normal = getSurfaceNormal(hitQuaternion);
  return Math.abs(normal.dot(WORLD_UP)) >= floorCosTolerance ? 'floor' : 'wall';
}

/**
 * @param {string} modelId
 * @param {THREE.Vector3} hitPosition   - world-space hit point
 * @param {THREE.Quaternion} hitQuaternion - pose returned by hit-test / ground raycast
 * @param {number} baseOffset           - distance (meters) from the model's
 *                                         origin to its lowest bounding-box
 *                                         point, so the object's base sits
 *                                         exactly on the surface instead of
 *                                         floating or clipping into it.
 * @param {THREE.Vector3} [cameraForward] - horizontal camera-facing hint,
 *                                         used only for upright objects
 *                                         placed on a floor (a floor hit's
 *                                         tangent axes carry no meaningful
 *                                         "which way should this face"
 *                                         information).
 */
export function computePlacementTransform(
  modelId,
  hitPosition,
  hitQuaternion,
  baseOffset = 0,
  cameraForward = null
) {
  const config = MODELS[modelId];
  const surfaceNormal = getSurfaceNormal(hitQuaternion);
  const surfaceType = classifySurface(hitQuaternion);

  // Push the object out along the surface normal by its own base offset so
  // it rests exactly on the surface — works the same whether that surface
  // is a floor (normal ~world-up) or a wall (normal horizontal).
  const position = hitPosition
    .clone()
    .add(surfaceNormal.clone().multiplyScalar(baseOffset));

  let quaternion;

  if (config?.upright) {
    let facing;

    if (surfaceType === 'wall') {
      // Face directly away from the wall.
      facing = surfaceNormal.clone();
    } else if (cameraForward) {
      facing = cameraForward.clone();
    } else {
      facing = new THREE.Vector3(0, 0, 1);
    }

    facing.y = 0;
    if (facing.lengthSq() < 1e-6) facing.set(0, 0, 1);
    facing.normalize();

    const yaw = Math.atan2(facing.x, facing.z);
    quaternion = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, yaw);
  } else {
    // Non-upright objects follow the detected surface as-is (lie flat on a
    // floor, sit flush against a wall).
    quaternion = hitQuaternion.clone();
  }

  return { position, quaternion, surfaceType };
}

// Note: the Rotate button (InteractionManager.rotateSelected) already only
// ever calls group.rotateY(...) — since an upright object's quaternion is
// always built from setFromAxisAngle(WORLD_UP, yaw) above, its local Y
// stays equal to world Y forever, so rotateY can never spin it into lying
// flat. No separate "is this model upright" check is needed at rotate time.