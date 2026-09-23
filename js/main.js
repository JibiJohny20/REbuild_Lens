// ============================================================================
// main.js
// Structure AR - Application Entry Point
// Handles:
// - Landing screen
// - 3D Preview
// - WebXR AR
// - Model placement
// - Selection and interaction
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { MODELS } from './config.js';
import { ModelManager } from './model-manager.js';
import { InteractionManager } from './interaction-manager.js';
import { ARController } from './ar.js';
import { UIManager } from './ui.js';

// ============================================================================
// DOM
// ============================================================================

const viewport = document.getElementById('viewport');
const gestureCatcher = document.getElementById('gesture-catcher');

// ============================================================================
// THREE.JS RENDERER
// ============================================================================

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// WebXR support
renderer.xr.enabled = true;

viewport.appendChild(renderer.domElement);

// ============================================================================
// SCENE
// ============================================================================

const scene = new THREE.Scene();

// Lighting
const hemiLight = new THREE.HemisphereLight(
  0xffffff,
  0x445566,
  1.1
);

scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(
  0xffffff,
  1.4
);

dirLight.position.set(2, 4, 3);
scene.add(dirLight);

// ============================================================================
// PREVIEW CAMERA
// ============================================================================

const previewCamera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.01,
  100
);

previewCamera.position.set(
  2.4,
  1.8,
  2.8
);

// ============================================================================
// ORBIT CONTROLS
// ============================================================================

const previewControls = new OrbitControls(
  previewCamera,
  gestureCatcher
);

previewControls.target.set(0, 0.4, 0);

previewControls.enableDamping = true;
previewControls.dampingFactor = 0.08;

previewControls.minDistance = 0.5;
previewControls.maxDistance = 12;

previewControls.maxPolarAngle = Math.PI * 0.49;

previewControls.enabled = false;

previewControls.update();

// ============================================================================
// PREVIEW GRID
// ============================================================================

const previewGrid = new THREE.GridHelper(
  20,
  40,
  0x2d6cdf,
  0xc7d0da
);

previewGrid.material.opacity = 0.5;
previewGrid.material.transparent = true;
previewGrid.visible = false;

scene.add(previewGrid);

// ============================================================================
// WINDOW RESIZE
// ============================================================================

window.addEventListener('resize', () => {
  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  previewCamera.aspect =
    window.innerWidth / window.innerHeight;

  previewCamera.updateProjectionMatrix();
});

// ============================================================================
// APPLICATION MANAGERS
// ============================================================================

const ui = new UIManager();

const modelManager = new ModelManager(scene);

const interaction = new InteractionManager(
  scene,
  modelManager
);

const arController = new ARController(
  renderer,
  scene,
  ui.el.overlay
);

// ============================================================================
// APPLICATION STATE
// ============================================================================

let currentMode = 'landing';
let selectedModelId = null;

// ============================================================================
// ACTIVE CAMERA
// ============================================================================

function getActiveCamera() {
  if (currentMode === 'ar') {
    return arController.getCamera();
  }

  if (currentMode === 'preview') {
    return previewCamera;
  }

  return null;
}

// ============================================================================
// MODEL PLACEMENT
// ============================================================================

async function attemptPlacement(ndcX, ndcY) {

  if (!selectedModelId) {
    ui.showToast(
      'Select a component from the toolbar first.'
    );

    return;
  }

  // ----------------------------------------------------------
  // AR MODE
  // ----------------------------------------------------------

  if (currentMode === 'ar') {

    const pose = arController.getReticlePose();

    if (!pose) {

      ui.showToast(
        'Move your phone slowly to detect a surface first.'
      );

      return;
    }

    try {

      ui.setLoading(
        true,
        `Loading ${MODELS[selectedModelId].name}…`
      );

      await interaction.placeModel(
        selectedModelId,
        pose.position,
        pose.quaternion
      );

    } catch (error) {

      console.error(error);

      ui.showToast(
        'Unable to place the selected model.'
      );

    } finally {

      ui.setLoading(false);
    }

    return;
  }

  // ----------------------------------------------------------
  // 3D PREVIEW MODE
  // ----------------------------------------------------------

  if (currentMode === 'preview') {

    const point = interaction.raycastGround(
      ndcX,
      ndcY,
      previewCamera,
      0
    );

    if (!point) {
      return;
    }

    try {

      ui.setLoading(
        true,
        `Loading ${MODELS[selectedModelId].name}…`
      );

      await interaction.placeModel(
        selectedModelId,
        point,
        new THREE.Quaternion()
      );

    } catch (error) {

      console.error(error);

      ui.showToast(
        'Unable to load the selected model.'
      );

    } finally {

      ui.setLoading(false);
    }
  }
}

// ============================================================================
// GESTURES
// ============================================================================

interaction.attachGestures(
  gestureCatcher,
  {
    getCamera: getActiveCamera,

    onEmptyTap: (ndcX, ndcY) => {
      attemptPlacement(ndcX, ndcY);
    },
  }
);

// ============================================================================
// SELECTION CHANGE
// ============================================================================

interaction.on(
  'selectionChange',
  (record) => {

    previewControls.enabled =
      currentMode === 'preview' && !record;

    ui.updateSelectionPanel(record);

    ui.setMoveButtonActive(
      interaction.moveModeActive
    );

    if (currentMode === 'ar') {

      if (record) {

        ui.setInstruction(null);

      } else if (
        arController.hasValidReticle()
      ) {

        ui.setInstruction(
          selectedModelId
            ? `Tap to place ${MODELS[selectedModelId].name}`
            : 'Select a component below to place it.'
        );

      } else {

        ui.setInstruction(
          'Move your phone slowly to detect a surface.'
        );
      }
    }
  }
);

// ============================================================================
// OBJECT CHANGES
// ============================================================================

interaction.on(
  'objectsChange',
  () => {
    // Reserved for future object count / status updates.
  }
);

// ============================================================================
// MODEL LOAD ERROR
// ============================================================================

interaction.on(
  'loadError',
  (message) => {

    ui.setLoading(false);

    ui.showToast(message);
  }
);

// ============================================================================
// TOOLBAR
// ============================================================================

ui.buildToolbar(
  (modelId) => {

    selectedModelId = modelId;

    ui.setSelectedToolbarItem(modelId);

    if (currentMode === 'ar') {

      ui.setInstruction(
        arController.hasValidReticle()
          ? `Tap to place ${MODELS[modelId].name}`
          : 'Move your phone slowly to detect a surface.'
      );

    } else if (currentMode === 'preview') {

      ui.setInstruction(
        `Tap the ground to place ${MODELS[modelId].name}`
      );
    }
  }
);

// ============================================================================
// ADD BRICK
// ============================================================================

ui.el.btnAddBrick.addEventListener(
  'click',
  () => {

    selectedModelId = 'brick';

    ui.setSelectedToolbarItem('brick');

    ui.showToast(
      'Brick selected — tap a surface to place another.'
    );
  }
);

// ============================================================================
// CLEAR SCENE
// ============================================================================

ui.el.btnClearScene.addEventListener(
  'click',
  async () => {

    if (interaction.list().length === 0) {
      return;
    }

    const ok = await ui.confirm(
      'Remove all placed components?'
    );

    if (ok) {
      interaction.clearAll();
    }
  }
);

// ============================================================================
// SELECTION PANEL
// ============================================================================

ui.el.btnPanelClose.addEventListener(
  'click',
  () => {
    interaction.clearSelection();
  }
);

// MOVE
ui.el.btnMove.addEventListener(
  'click',
  () => {

    const active =
      interaction.setMoveMode(
        !interaction.moveModeActive
      );

    ui.setMoveButtonActive(active);

    ui.showToast(
      active
        ? 'Move armed — drag anywhere to move the object.'
        : 'Move off.'
    );
  }
);

// ROTATE
ui.el.btnRotate.addEventListener(
  'click',
  () => {

    interaction.rotateSelected(
      THREE.MathUtils.degToRad(22.5)
    );

    ui.updateSelectionPanel(
      interaction.getSelected()
    );
  }
);

// SCALE UP
ui.el.btnScaleUp.addEventListener(
  'click',
  () => {

    interaction.scaleSelectedBy(1.1);

    ui.updateSelectionPanel(
      interaction.getSelected()
    );
  }
);

// SCALE DOWN
ui.el.btnScaleDown.addEventListener(
  'click',
  () => {

    interaction.scaleSelectedBy(1 / 1.1);

    ui.updateSelectionPanel(
      interaction.getSelected()
    );
  }
);

// DUPLICATE
ui.el.btnDuplicate.addEventListener(
  'click',
  async () => {

    try {

      ui.setLoading(
        true,
        'Duplicating…'
      );

      await interaction.duplicateSelected();

    } catch (error) {

      console.error(error);

      ui.showToast(
        'Unable to duplicate the component.'
      );

    } finally {

      ui.setLoading(false);
    }
  }
);

// RESET
ui.el.btnReset.addEventListener(
  'click',
  () => {

    interaction.resetSelected();

    ui.updateSelectionPanel(
      interaction.getSelected()
    );
  }
);

// DELETE
ui.el.btnDelete.addEventListener(
  'click',
  async () => {

    const ok = await ui.confirm(
      'Delete selected component?'
    );

    if (ok) {
      interaction.deleteSelected();
    }
  }
);

// ============================================================================
// 3D PREVIEW MODE
// ============================================================================

function enterPreview() {

  console.log('Entering 3D Preview');

  currentMode = 'preview';

  selectedModelId = null;

  interaction.clearSelection();

  ui.setMode('preview');

  ui.setInstruction(
    'Select a component, then tap the ground to place it.'
  );

  previewControls.enabled = true;

  previewGrid.visible = true;

  renderer.setAnimationLoop(
    previewLoop
  );
}

// ============================================================================
// EXIT TO LANDING
// ============================================================================

function exitToLanding() {

  console.log('Returning to landing screen');

  currentMode = 'landing';

  selectedModelId = null;

  interaction.clearSelection();

  ui.setMode('landing');

  ui.setInstruction(null);

  previewControls.enabled = false;

  previewGrid.visible = false;

  renderer.setAnimationLoop(null);
}

// ============================================================================
// PREVIEW RENDER LOOP
// ============================================================================

function previewLoop() {

  previewControls.update();

  renderer.render(
    scene,
    previewCamera
  );
}

// ============================================================================
// WEBXR AR
// ============================================================================

async function enterAR() {

  ui.showArSupportNote(null);

  const supported =
    await ARController.isSupported();

  if (!supported) {

    ui.showUnsupportedModal(true);

    return;
  }

  try {

    currentMode = 'ar';

    selectedModelId = null;

    interaction.clearSelection();

    previewControls.enabled = false;

    previewGrid.visible = false;

    ui.setMode('ar');

    ui.setInstruction(
      'Move your phone slowly to detect a surface.'
    );

    await arController.start();

  } catch (error) {

    console.error(
      'AR start error:',
      error
    );

    currentMode = 'landing';

    ui.setMode('landing');

    ui.showUnsupportedModal(true);
  }
}

// ============================================================================
// AR SESSION END
// ============================================================================

arController.on(
  'onSessionEnd',
  () => {

    if (currentMode === 'ar') {

      currentMode = 'landing';

      ui.setMode('landing');

      ui.setInstruction(null);
    }
  }
);

// ============================================================================
// AR RETICLE UPDATE
// ============================================================================

arController.on(
  'onReticleUpdate',
  (visible) => {

    if (
      currentMode !== 'ar' ||
      interaction.getSelected()
    ) {
      return;
    }

    if (!visible) {

      ui.setInstruction(
        'Move your phone slowly to detect a surface.'
      );

    } else {

      ui.setInstruction(
        selectedModelId
          ? `Tap to place ${MODELS[selectedModelId].name}`
          : 'Select a component below to place it.'
      );
    }
  }
);

// ============================================================================
// MAIN BUTTONS
// ============================================================================

ui.el.btnStartAr.addEventListener(
  'click',
  enterAR
);

ui.el.btn3dPreview.addEventListener(
  'click',
  () => {
    console.log('3D Preview button clicked');
    enterPreview();
  }
);

ui.el.btnHelp.addEventListener(
  'click',
  () => {
    ui.showHelp(true);
  }
);

ui.el.btnHelpClose.addEventListener(
  'click',
  () => {
    ui.showHelp(false);
  }
);

ui.el.btnHelpToggle.addEventListener(
  'click',
  () => {
    ui.showHelp(true);
  }
);

// ============================================================================
// EXIT BUTTON
// ============================================================================

ui.el.btnExit.addEventListener(
  'click',
  async () => {

    if (currentMode === 'ar') {

      await arController.stop();
    }

    exitToLanding();
  }
);

// ============================================================================
// UNSUPPORTED AR MODAL
// ============================================================================

// IMPORTANT:
// We also attach directly to the actual DOM element.
// This makes the preview button work even if UIManager's
// element mapping has a problem.

const unsupportedPreviewButton =
  document.getElementById('unsupported-preview');

if (unsupportedPreviewButton) {

  unsupportedPreviewButton.addEventListener(
    'click',
    () => {

      console.log(
        'Open 3D Preview clicked'
      );

      ui.showUnsupportedModal(false);

      enterPreview();
    }
  );
}

const unsupportedCloseButton =
  document.getElementById('unsupported-close');

if (unsupportedCloseButton) {

  unsupportedCloseButton.addEventListener(
    'click',
    () => {

      ui.showUnsupportedModal(false);
    }
  );
}

// ============================================================================
// STARTUP
// ============================================================================

(async () => {

  try {

    const supported =
      await ARController.isSupported();

    if (!supported) {

      ui.showArSupportNote(
        'AR isn’t supported on this browser/device. Start AR will offer the 3D Preview instead.'
      );
    }

  } catch (error) {

    console.warn(
      'Unable to check AR support:',
      error
    );
  }

})();
