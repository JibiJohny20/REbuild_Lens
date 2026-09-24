// ============================================================================
// collision.js
// Collision check used by interaction-manager.js -> checkCollisions().
//
// PLACEHOLDER: interaction-manager.js imports this module, but the file was
// missing from the project, which broke the whole ES-module graph (and with
// it main.js and every button). This stub restores the module contract
// without changing any behavior: it reports no collisions and no warnings.
// If you already have your real collision.js, use that one instead — it only
// has to export checkCollisions(records, clearanceMargin) returning
// { collisions: Set<id>, warnings: Set<id> }.
// ============================================================================

/**
 * @param {Array<{id:number, group:import('three').Object3D}>} records
 * @param {number} clearanceMargin  meters
 * @returns {{collisions:Set<number>, warnings:Set<number>}}
 */
export function checkCollisions(records, clearanceMargin) {
  return { collisions: new Set(), warnings: new Set() };
}