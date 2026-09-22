// ============================================================================
// config.js
// Central configuration for Structure AR.
// Change model paths, display names, or scale-correction values here only —
// nothing else in the codebase hard-codes model data.
// ============================================================================

/**
 * Master model registry.
 *
 * scale       -> uniform scale multiplier applied after the model loads.
 *                Different GLB exports come out of different tools (Blender,
 *                SketchUp, Revit-to-glTF, etc.) at wildly different real-world
 *                units, so each model gets its own correction factor here
 *                instead of a single global scale.
 * type        -> shown in the info panel ("Structural Component", etc).
 * color       -> accent color used for this component's toolbar icon/outline
 *                fallback (used only if no icon image is present).
 * yOffset     -> optional vertical nudge (in meters, applied after scaling)
 *                to correct models whose origin isn't at their base.
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
  },

  window: {
    id: 'window',
    name: 'Window',
    type: 'Architectural Component',
    path: 'assets/models/window.glb',
    scale: 1,
    yOffset: 0,
    color: '#4a7ea8',
  },

  beam: {
    id: 'beam',
    name: 'Beam',
    type: 'Structural Component',
    path: 'assets/models/beam-optimized.glb',
    scale: 1,
    yOffset: 0,
    color: '#5c6570',
  },

  slab: {
    id: 'slab',
    name: 'Concrete Slab',
    type: 'Structural Component',
    path: 'assets/models/ConcreteSlab-optimized.glb',
    scale: 1,
    yOffset: 0,
    color: '#7a7a7a',
  },

  woodenplank: {
    id: 'woodenplank',
    name: 'Wood',
    type: 'Material Component',
    path: 'assets/models/wood-optimized.glb',
    scale: 1,
    yOffset: 0,
    color: '#a3703f',
  },

  brick: {
    id: 'brick',
    name: 'Red Brick',
    type: 'Material Component',
    path: 'assets/models/redbrick-optimized.glb',
    scale: 1,
    yOffset: 0,
    color: '#a24a3d',
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
};
