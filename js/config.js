// ============================================================================
// config.js
// Central configuration for Structure AR.
// Change model paths, display names, scale-correction, dimension or
// placement metadata here only — nothing else in the codebase hard-codes
// model data.
// ============================================================================

/**
 * Master model registry.
 *
 * scale            -> uniform scale multiplier applied after the model loads.
 *                      Different GLB exports come out of different tools
 *                      (Blender, SketchUp, Revit-to-glTF, etc.) at wildly
 *                      different real-world units, so each model gets its
 *                      own correction factor here instead of a single
 *                      global scale.
 * type             -> shown in the info panel ("Structural Component", etc).
 * color            -> accent color used for this component's toolbar
 *                      icon/outline fallback (used only if no icon image is
 *                      present).
 * yOffset          -> optional MANUAL vertical nudge (meters, applied after
 *                      scaling) for final fine-tuning. The automatic
 *                      bounding-box "stand on the surface" placement (see
 *                      placement.js) handles the general case; use this only
 *                      to correct a model whose visual base doesn't line up
 *                      with its true geometric bounding box (e.g. a door
 *                      with a decorative frame that extends past the sill).
 * dimensions       -> REAL-WORLD size in meters {width, height, depth}. This
 *                      is the single source of truth used by the info
 *                      panel, Will It Fit, AR fit checking, collision
 *                      detection and measurement comparison — never
 *                      duplicate these numbers elsewhere.
 *                      NOTE: placeholder figures below use typical
 *                      construction-catalog sizes for each component type.
 *                      Replace with the real measured/CAD dimensions of
 *                      each specific GLB for accurate Will-It-Fit results.
 * placementSurface -> guides automatic orientation on placement:
 *                        'wall'          - must stand against a vertical
 *                                          surface (door, window)
 *                        'floor'         - must lie flat on a horizontal
 *                                          surface (slab)
 *                        'floor_or_wall' - orientation follows whichever
 *                                          surface was hit (beam, brick)
 *                        'floor_or_free' - normally floor-resting, but not
 *                                          restricted to a detected plane
 *                                          (wood, in 3D Preview's free
 *                                          ground)
 * upright          -> when true, the object always keeps world Y as "up"
 *                      regardless of the tilt of the detected surface (used
 *                      for door/window so they never end up lying down just
 *                      because a hit-test result was slightly tilted).
 */
export const MODELS = {
  door: {
    id: 'door',
    name: 'Salvaged Door',
    type: 'Architectural Component',
    path: 'assets/models/SalvagedDoor-optimized.glb',
    scale: 1,
    yOffset: 0,
    color: '#8a5a34',
    dimensions: { width: 0.90, height: 2.10, depth: 0.10 },
    placementSurface: 'wall',
    upright: true,
  },

  window: {
    id: 'window',
    name: 'Window',
    type: 'Architectural Component',
    path: 'assets/models/window.glb',
    scale: 1,
    yOffset: 0,
    color: '#4a7ea8',
    dimensions: { width: 1.20, height: 1.00, depth: 0.10 },
    placementSurface: 'wall',
    upright: true,
  },

  beam: {
    id: 'beam',
    name: 'Beam',
    type: 'Structural Component',
    path: 'assets/models/beam-optimized.glb',
    scale: 1,
    yOffset: 0,
    color: '#5c6570',
    dimensions: { width: 3.00, height: 0.20, depth: 0.20 },
    placementSurface: 'floor_or_wall',
    upright: false,
  },

  slab: {
    id: 'slab',
    name: 'Concrete Slab',
    type: 'Structural Component',
    path: 'assets/models/ConcreteSlab-optimized.glb',
    scale: 1,
    yOffset: 0,
    color: '#7a7a7a',
    dimensions: { width: 1.00, height: 0.05, depth: 1.00 },
    placementSurface: 'floor',
    upright: false,
  },

  woodenplank: {
    id: 'woodenplank',
    name: 'Wood',
    type: 'Material Component',
    path: 'assets/models/wood-optimized.glb',
    scale: 1,
    yOffset: 0,
    color: '#a3703f',
    dimensions: { width: 1.80, height: 0.02, depth: 0.14 },
    placementSurface: 'floor_or_free',
    upright: false,
  },

  brick: {
    id: 'brick',
    name: 'Red Brick',
    type: 'Material Component',
    path: 'assets/models/redbrick-optimized.glb',
    scale: 1,
    yOffset: 0,
    color: '#a24a3d',
    dimensions: { width: 0.19, height: 0.09, depth: 0.09 },
    placementSurface: 'floor_or_wall',
    upright: false,
  },
};

// Ordered list drives the bottom toolbar layout.
export const MODEL_ORDER = ['door', 'window', 'beam', 'slab', 'woodenplank', 'brick'];

// Which model ids get an "Add another" quick-repeat affordance in the panel.
// Bricks are the obvious repeat-heavy component but any id can be added here.
export const REPEATABLE_MODELS = ['brick'];

export const APP_CONFIG = {
  // Ground plane size for the 3D Preview mode (meters).
  previewGroundSize: 20,
  // Default distance (meters) in front of the camera where preview placement
  // raycasts against the ground plane.
  duplicateOffset: { x: 0.15, y: 0, z: 0.15 },
  rotateStepDegrees: 22.5,
  scaleStep: 0.1,
  minScale: 0.1,
  maxScale: 5,
  // Max number of simultaneous hit-test-driven reticle updates per second is
  // implicitly capped by requestAnimationFrame; no extra throttling needed.

  // Treat a detected-plane normal within this many degrees of world-up as
  // "floor"; anything further from vertical is treated as "wall". WebXR/
  // ARCore/ARKit hit-test poses orient their local +Y to the surface
  // normal, so this is measured against that axis.
  floorNormalToleranceDeg: 55,
};

export const FIT_CONFIG = {
  // Below this measured clearance (meters) a "FITS" result is downgraded
  // to a clearance warning in the UI (still numerically fits, but tight).
  tightClearanceThreshold: 0.03,
  // AR point-to-point measurement is inherently approximate (drift, hand
  // shake, hit-test noise). Results are always labelled as estimates.
  measurementLabel: 'Estimated AR measurement',
};

export const CAPTURE_CONFIG = {
  photoMimeType: 'image/png',
  videoMimeTypeCandidates: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
  videoTimesliceMs: 250,
};

// Preset step sizes (degrees) the Rotate controls cycle through. Index into
// this array is what the "Angle" button advances; APP_CONFIG.rotateStepDegrees
// stays as the default starting step.
export const ROTATE_STEP_OPTIONS_DEG = [15, 22.5, 45, 90];

// localStorage key used by Save Project / Load Project.
export const PROJECT_STORAGE_KEY = 'structure-ar-project-v1';

// Collision detection settings, consumed by interaction-manager.js.
// clearanceMargin -> distance (meters) below which two non-overlapping
// objects are flagged with the orange "insufficient clearance" warning.
export const COLLISION_CONFIG = {
  clearanceMargin: 0.02,
};