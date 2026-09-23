// ============================================================================
// fit-checker.js
// Will It Fit? — pure comparison logic, shared identically by AR mode
// (measured real-world opening) and 3D Preview mode (typed/virtual-room
// opening). No THREE/DOM dependency so it's trivially unit-testable.
// ============================================================================

import { MODELS, FIT_CONFIG } from './config.js';

export const FitResult = Object.freeze({
  FITS: 'FITS',
  DOES_NOT_FIT: 'DOES_NOT_FIT',
  UNCERTAIN: 'UNCERTAIN',
});

export class FitChecker {
  /**
   * @param {string} modelId
   * @param {{width:number, height:number, depth?:number, estimated?:boolean}} opening
   * @param {number} rotationDeg - current Y rotation of the placed object,
   *                                 in degrees, used to decide whether the
   *                                 object's width/height axes should be
   *                                 swapped against the opening.
   */
  checkFit(modelId, opening, rotationDeg = 0) {
    const config = MODELS[modelId];

    if (!config?.dimensions) {
      return {
        result: FitResult.UNCERTAIN,
        reason: 'No dimension data is available for this component.',
      };
    }

    if (!opening || opening.width == null || opening.height == null) {
      return {
        result: FitResult.UNCERTAIN,
        reason: 'Measure the opening first.',
      };
    }

    const { width, height, depth } = config.dimensions;

    // A 90°/270° placement swaps which object dimension lines up with the
    // opening's width vs height.
    const normalizedRotation = ((rotationDeg % 180) + 180) % 180;
    const swapped = Math.abs(normalizedRotation - 90) < 1;

    const objWidth = swapped ? height : width;
    const objHeight = swapped ? width : height;

    const widthClearance = round(opening.width - objWidth);
    const heightClearance = round(opening.height - objHeight);
    const depthClearance =
      opening.depth != null && depth != null ? round(opening.depth - depth) : null;

    const fitsWidth = widthClearance >= 0;
    const fitsHeight = heightClearance >= 0;
    const fitsDepth = depthClearance == null || depthClearance >= 0;
    const fits = fitsWidth && fitsHeight && fitsDepth;

    // If it doesn't fit as currently rotated, check whether rotating 90°
    // would help (relevant for anything wider than it is tall, or an
    // opening that's the "wrong way" relative to the object).
    const rotatedWidthClearance = round(opening.width - objHeight);
    const rotatedHeightClearance = round(opening.height - objWidth);
    const suggestRotate =
      !fits && rotatedWidthClearance >= 0 && rotatedHeightClearance >= 0;

    const tight =
      fits &&
      (Math.abs(widthClearance) < FIT_CONFIG.tightClearanceThreshold ||
        Math.abs(heightClearance) < FIT_CONFIG.tightClearanceThreshold ||
        (depthClearance != null &&
          Math.abs(depthClearance) < FIT_CONFIG.tightClearanceThreshold));

    return {
      result: fits ? FitResult.FITS : FitResult.DOES_NOT_FIT,
      tight,
      objectDimensions: { width: objWidth, height: objHeight, depth },
      requiredWidth: objWidth,
      requiredHeight: objHeight,
      availableWidth: opening.width,
      availableHeight: opening.height,
      widthClearance,
      heightClearance,
      depthClearance,
      suggestRotate,
      estimated: opening.estimated !== false,
      label: FIT_CONFIG.measurementLabel,
    };
  }
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}