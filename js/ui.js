// ============================================================================
// ui.js
// Structure AR - UI Manager
// Handles:
// - Landing screen
// - Help screen
// - AR / Preview UI
// - Toolbar
// - Selection panel
// - Modals
// ============================================================================

import {
  MODELS,
  MODEL_ORDER,
  REPEATABLE_MODELS
} from './config.js';

export class UIManager {

  constructor() {

    // ------------------------------------------------------------------------
    // DOM REFERENCES
    // ------------------------------------------------------------------------

    this.el = {

      app: document.getElementById('app'),

      // Screens
      screenLanding: document.getElementById('screen-landing'),
      screenHelp: document.getElementById('screen-help'),
      arSupportNote: document.getElementById('ar-support-note'),

      // Landing buttons
      btnStartAr: document.getElementById('btn-start-ar'),
      btn3dPreview: document.getElementById('btn-3d-preview'),
      btnHelp: document.getElementById('btn-help'),
      btnHelpClose: document.getElementById('btn-help-close'),

      // Main overlay
      overlay: document.getElementById('app-overlay'),
      gestureCatcher: document.getElementById('gesture-catcher'),

      modeLabel: document.getElementById('mode-label'),

      btnExit: document.getElementById('btn-exit'),
      btnHelpToggle: document.getElementById('btn-help-toggle'),

      instructionBanner:
        document.getElementById('instruction-banner'),

      loadingIndicator:
        document.getElementById('loading-indicator'),

      loadingText:
        document.getElementById('loading-text'),

      toast:
        document.getElementById('toast'),

      // Toolbar
      toolbar:
        document.getElementById('toolbar'),

      btnAddBrick:
        document.getElementById('btn-add-brick'),

      btnClearScene:
        document.getElementById('btn-clear-scene'),

      // Selection panel
      selectionPanel:
        document.getElementById('selection-panel'),

      selName:
        document.getElementById('sel-name'),

      selType:
        document.getElementById('sel-type'),

      selPosition:
        document.getElementById('sel-position'),

      selRotation:
        document.getElementById('sel-rotation'),

      selScale:
        document.getElementById('sel-scale'),

      btnPanelClose:
        document.getElementById('btn-panel-close'),

      btnMove:
        document.getElementById('btn-move'),

      btnRotate:
        document.getElementById('btn-rotate'),

      btnScaleUp:
        document.getElementById('btn-scale-up'),

      btnScaleDown:
        document.getElementById('btn-scale-down'),

      btnDuplicate:
        document.getElementById('btn-duplicate'),

      btnReset:
        document.getElementById('btn-reset'),

      btnDelete:
        document.getElementById('btn-delete'),

      // Confirmation modal
      confirmModal:
        document.getElementById('confirm-modal'),

      confirmMessage:
        document.getElementById('confirm-message'),

      confirmCancel:
        document.getElementById('confirm-cancel'),

      confirmOk:
        document.getElementById('confirm-ok'),

      // Unsupported AR modal
      unsupportedModal:
        document.getElementById('unsupported-modal'),

      unsupportedPreview:
        document.getElementById('unsupported-preview'),

      unsupportedClose:
        document.getElementById('unsupported-close'),
    };

    this._toastTimer = null;

    // Make sure Help starts hidden
    if (this.el.screenHelp) {
      this.el.screenHelp.hidden = true;
    }

    // Make sure modals start hidden
    if (this.el.confirmModal) {
      this.el.confirmModal.hidden = true;
    }

    if (this.el.unsupportedModal) {
      this.el.unsupportedModal.hidden = true;
    }
  }

  // ==========================================================================
  // SCREEN / MODE
  // ==========================================================================

  setMode(mode) {

    this.el.app.classList.remove(
      'mode-landing',
      'mode-ar',
      'mode-preview'
    );

    this.el.app.classList.add(
      `mode-${mode}`
    );

    // Landing visibility
    this.el.screenLanding.hidden =
      mode !== 'landing';

    // Overlay visibility
    this.el.overlay.hidden =
      mode === 'landing';

    // Mode label
    if (mode === 'ar') {

      this.el.modeLabel.textContent =
        'AR MODE';

    } else if (mode === 'preview') {

      this.el.modeLabel.textContent =
        '3D PREVIEW';

    } else {

      this.el.modeLabel.textContent =
        '';
    }

    // Exit button
    this.el.btnExit.textContent =
      mode === 'ar'
        ? 'Exit AR'
        : 'Exit Preview';

    if (mode !== 'landing') {

      this.setSelectedToolbarItem(null);

      this.updateSelectionPanel(null);

      this.el.btnAddBrick.hidden = true;
    }
  }

  // ==========================================================================
  // HELP
  // ==========================================================================

  showHelp(show) {

    if (!this.el.screenHelp) {
      return;
    }

    if (show) {

      /*
       * IMPORTANT:
       * The AR/Preview overlay contains #gesture-catcher, which covers
       * the screen. Put the Help screen above the overlay so its Close
       * button can receive clicks.
       */

      this.el.screenHelp.hidden = false;

      this.el.screenHelp.style.zIndex = '100000';

      this.el.screenHelp.style.pointerEvents =
        'auto';

      this.el.screenHelp.style.position =
        'absolute';

      this.el.screenHelp.style.inset =
        '0';

      // Disable gesture interception while Help is open
      if (this.el.gestureCatcher) {

        this.el.gestureCatcher.style.pointerEvents =
          'none';
      }

    } else {

      this.el.screenHelp.hidden = true;

      this.el.screenHelp.style.zIndex = '';

      this.el.screenHelp.style.pointerEvents =
        '';

      this.el.screenHelp.style.position =
        '';

      this.el.screenHelp.style.inset =
        '';

      // Re-enable gesture layer when returning to AR/Preview
      if (
        this.el.gestureCatcher &&
        this.el.overlay &&
        !this.el.overlay.hidden
      ) {

        this.el.gestureCatcher.style.pointerEvents =
          'auto';
      }
    }
  }

  // ==========================================================================
  // AR SUPPORT NOTE
  // ==========================================================================

  showArSupportNote(text) {

    if (!text) {

      this.el.arSupportNote.hidden =
        true;

      return;
    }

    this.el.arSupportNote.hidden =
      false;

    this.el.arSupportNote.textContent =
      text;
  }

  // ==========================================================================
  // TOOLBAR
  // ==========================================================================

  buildToolbar(onSelect) {

    this.el.toolbar.innerHTML = '';

    MODEL_ORDER.forEach((id) => {

      const def = MODELS[id];

      if (!def) {
        return;
      }

      const item =
        document.createElement('button');

      item.type = 'button';

      item.className =
        'toolbar-item';

      item.dataset.modelId =
        id;

      item.innerHTML = `
        <span
          class="swatch"
          style="background:${def.color}"
        ></span>

        <span class="label">
          ${def.name}
        </span>
      `;

      item.addEventListener(
        'click',
        (event) => {

          event.stopPropagation();

          onSelect(id);
        }
      );

      this.el.toolbar.appendChild(item);
    });
  }

  // ==========================================================================
  // SELECTED TOOLBAR ITEM
  // ==========================================================================

  setSelectedToolbarItem(modelId) {

    this.el.toolbar
      .querySelectorAll('.toolbar-item')
      .forEach((node) => {

        node.classList.toggle(
          'selected',
          node.dataset.modelId === modelId
        );
      });

    this.el.btnAddBrick.hidden =
      !(
        modelId &&
        REPEATABLE_MODELS.includes(modelId)
      );
  }

  // ==========================================================================
  // INSTRUCTION
  // ==========================================================================

  setInstruction(text) {

    if (!text) {

      this.el.instructionBanner.hidden =
        true;

      return;
    }

    this.el.instructionBanner.hidden =
      false;

    this.el.instructionBanner.textContent =
      text;
  }

  // ==========================================================================
  // LOADING
  // ==========================================================================

  setLoading(
    isLoading,
    text = 'Loading model…'
  ) {

    this.el.loadingIndicator.hidden =
      !isLoading;

    this.el.loadingText.textContent =
      text;
  }

  // ==========================================================================
  // TOAST
  // ==========================================================================

  showToast(
    message,
    duration = 2600
  ) {

    clearTimeout(
      this._toastTimer
    );

    this.el.toast.textContent =
      message;

    this.el.toast.hidden =
      false;

    this._toastTimer =
      setTimeout(() => {

        this.el.toast.hidden =
          true;

      }, duration);
  }

  // ==========================================================================
  // SELECTION PANEL
  // ==========================================================================

  updateSelectionPanel(record) {

    if (!record) {

      this.el.selectionPanel.hidden =
        true;

      return;
    }

    const def =
      MODELS[record.modelId];

    const group =
      record.group;

    if (!def || !group) {
      return;
    }

    this.el.selectionPanel.hidden =
      false;

    this.el.selName.textContent =
      def.name;

    this.el.selType.textContent =
      def.type;

    this.el.selPosition.textContent =
      `${group.position.x.toFixed(2)}, ` +
      `${group.position.y.toFixed(2)}, ` +
      `${group.position.z.toFixed(2)} m`;

    const degrees =
      (group.rotation.y * 180) /
      Math.PI;

    this.el.selRotation.textContent =
      `${degrees.toFixed(0)}°`;

    this.el.selScale.textContent =
      `${group.scale.x.toFixed(2)}×`;
  }

  // ==========================================================================
  // MOVE BUTTON
  // ==========================================================================

  setMoveButtonActive(active) {

    this.el.btnMove.classList.toggle(
      'active',
      !!active
    );
  }

  // ==========================================================================
  // CONFIRMATION MODAL
  // ==========================================================================

  confirm(message) {

    return new Promise((resolve) => {

      this.el.confirmMessage.textContent =
        message;

      this.el.confirmModal.hidden =
        false;

      const cleanup = (result) => {

        this.el.confirmModal.hidden =
          true;

        this.el.confirmOk.removeEventListener(
          'click',
          onOk
        );

        this.el.confirmCancel.removeEventListener(
          'click',
          onCancel
        );

        resolve(result);
      };

      const onOk = (event) => {

        event.stopPropagation();

        cleanup(true);
      };

      const onCancel = (event) => {

        event.stopPropagation();

        cleanup(false);
      };

      this.el.confirmOk.addEventListener(
        'click',
        onOk
      );

      this.el.confirmCancel.addEventListener(
        'click',
        onCancel
      );
    });
  }

  // ==========================================================================
  // UNSUPPORTED AR MODAL
  // ==========================================================================

  showUnsupportedModal(show) {

    if (!this.el.unsupportedModal) {
      return;
    }

    if (show) {

      this.el.unsupportedModal.hidden =
        false;

      /*
       * Put modal above EVERYTHING.
       */

      this.el.unsupportedModal.style.zIndex =
        '999999';

      this.el.unsupportedModal.style.pointerEvents =
        'auto';

    } else {

      this.el.unsupportedModal.hidden =
        true;

      this.el.unsupportedModal.style.zIndex =
        '';

      this.el.unsupportedModal.style.pointerEvents =
        '';
    }
  }
}