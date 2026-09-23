// ============================================================================
// ar.js
// Real WebXR immersive-ar handling: session request/teardown, hit-test
// source, reference spaces, the placement reticle, and per-frame updates.
// No fake camera-feed-plus-CSS trickery — this only runs when
// navigator.xr reports genuine 'immersive-ar' support.
// ============================================================================

import * as THREE from 'three';

export class ARController {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {HTMLElement} overlayRoot - DOM element used as the WebXR dom-overlay root.
   */
  constructor(renderer, scene, overlayRoot) {
    this.renderer = renderer;
    this.scene = scene;
    this.overlayRoot = overlayRoot;

    this.session = null;
    this.hitTestSource = null;
    this.viewerSpace = null;
    this.localSpace = null;
    this.reticle = this._buildReticle();
    this.reticleVisible = false;

    // renderer.xr.getCamera() only returns a correctly-populated camera
    // AFTER renderer.render(scene, <a camera>) has run at least once per
    // frame. That "a camera" is this reference camera — its own transform
    // is irrelevant during an XR session (WebXR supplies the real pose),
    // but its near/far planes are copied into the XR camera, so keep them
    // sensible for a handheld AR scale.
    this._referenceCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 100);

    this.callbacks = {
      onSessionStart: () => {},
      onSessionEnd: () => {},
      onReticleUpdate: () => {},
      onFrame: () => {},
    };

    this._onSessionEnded = this._onSessionEnded.bind(this);
    this._renderLoop = this._renderLoop.bind(this);
  }

  on(name, fn) {
    this.callbacks[name] = fn;
  }

  /** Feature-detects real WebXR immersive-ar support. Never assumes support. */
  static async isSupported() {
    if (!('xr' in navigator)) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch (err) {
      return false;
    }
  }

  async start() {
    if (!('xr' in navigator)) {
      throw new Error('WebXR is not available in this browser.');
    }
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      throw new Error('immersive-ar is not supported on this device/browser.');
    }

    this.session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor', 'anchors'],
      domOverlay: this.overlayRoot ? { root: this.overlayRoot } : undefined,
    });

    this.renderer.xr.setReferenceSpaceType('local');
    await this.renderer.xr.setSession(this.session);

    this.viewerSpace = await this.session.requestReferenceSpace('viewer');
    this.hitTestSource = await this.session.requestHitTestSource({ space: this.viewerSpace });
    this.localSpace = this.renderer.xr.getReferenceSpace();

    this.reticle.visible = false;
    this.scene.add(this.reticle);

    this.session.addEventListener('end', this._onSessionEnded);
    this.renderer.setAnimationLoop(this._renderLoop);

    this.callbacks.onSessionStart();
  }

  async stop() {
    if (this.session) {
      await this.session.end().catch(() => {});
    }
  }

  _onSessionEnded() {
    this.session?.removeEventListener('end', this._onSessionEnded);
    this.renderer.setAnimationLoop(null);
    this.scene.remove(this.reticle);
    this.reticleVisible = false;
    this.hitTestSource = null;
    this.viewerSpace = null;
    this.localSpace = null;
    this.session = null;
    this.callbacks.onSessionEnd();
  }

  _renderLoop(timestamp, frame) {
    if (frame && this.hitTestSource && this.localSpace) {
      const results = frame.getHitTestResults(this.hitTestSource);
      if (results.length > 0) {
        const pose = results[0].getPose(this.localSpace);
        if (pose) {
          this.reticle.visible = true;
          this.reticle.matrix.fromArray(pose.transform.matrix);
          this.reticle.matrix.decompose(this.reticle.position, this.reticle.quaternion, this.reticle.scale);
          if (!this.reticleVisible) {
            this.reticleVisible = true;
            this.callbacks.onReticleUpdate(true);
          }
        }
      } else if (this.reticleVisible) {
        this.reticleVisible = false;
        this.reticle.visible = false;
        this.callbacks.onReticleUpdate(false);
      }
    }
    this.callbacks.onFrame(timestamp, frame);
    this.renderer.render(this.scene, this._referenceCamera);
  }

  isPresenting() {
    return !!this.session;
  }

  hasValidReticle() {
    return this.isPresenting() && this.reticleVisible;
  }

  getReticlePose() {
    if (!this.hasValidReticle()) return null;
    return {
      position: this.reticle.position.clone(),
      quaternion: this.reticle.quaternion.clone(),
    };
  }

  /** Camera to use for raycasting placed objects while an AR session is active. */
  getCamera() {
    return this.isPresenting() ? this.renderer.xr.getCamera() : null;
  }

  _buildReticle() {
    const geometry = new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x2d6cdf, opacity: 0.9, transparent: true });
    const ring = new THREE.Mesh(geometry, material);

    const dotGeometry = new THREE.CircleGeometry(0.012, 24).rotateX(-Math.PI / 2);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x2d6cdf });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);

    const group = new THREE.Group();
    group.add(ring, dot);
    group.matrixAutoUpdate = false;
    group.visible = false;
    return group;
  }
}
