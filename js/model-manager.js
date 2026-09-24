import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MODELS } from './config.js';

export class ModelManager {
  constructor(scene) {
    // --------------------------------------------------
    // SCENE VALIDATION
    // --------------------------------------------------

    if (!scene) {
      throw new Error(
        'ModelManager: THREE.Scene was not provided. ' +
        'Create it using new ModelManager(scene).'
      );
    }

    this.scene = scene;

    // --------------------------------------------------
    // GLTF LOADER
    // --------------------------------------------------

    this.loader = new GLTFLoader();

    // --------------------------------------------------
    // DRACO LOADER
    // --------------------------------------------------

    this.dracoLoader = new DRACOLoader();

    this.dracoLoader.setDecoderPath(
      'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'
    );

    this.loader.setDRACOLoader(this.dracoLoader);

    // --------------------------------------------------
    // MODEL CACHE
    // --------------------------------------------------

    // Stores loaded GLB/GLTF templates
    this.cache = new Map();

    // Stores actual models placed in the scene
    this.instances = new Set();
  }

  // ==================================================
  // LOAD MODEL TEMPLATE
  // ==================================================

  async loadTemplate(modelId) {
    // Return cached model if already loaded
    if (this.cache.has(modelId)) {
      return this.cache.get(modelId);
    }

    const config = MODELS[modelId];

    if (!config) {
      throw new Error(
        `Unknown model: ${modelId}`
      );
    }

    try {
      console.log(
        `[ModelManager] Loading model: ${config.path}`
      );

      const gltf = await this.loader.loadAsync(
        config.path
      );

      const template = gltf.scene;

      // Configure meshes
      template.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          // Make sure the model is visible
          child.visible = true;
        }
      });

      // Store in cache
      this.cache.set(modelId, template);

      console.log(
        `[ModelManager] Model loaded successfully: ${config.name}`
      );

      return template;

    } catch (error) {
      console.error(
        `[ModelManager] Failed to load model: ${config.path}`,
        error
      );

      throw new Error(
        `Could not load ${config.name}. Check that the GLB file exists at ${config.path}.`
      );
    }
  }

  // ==================================================
  // CREATE MODEL INSTANCE
  // ==================================================

  async createInstance(modelId) {
    const config = MODELS[modelId];

    if (!config) {
      throw new Error(
        `Unknown model: ${modelId}`
      );
    }

    // Load the original template
    const template = await this.loadTemplate(modelId);

    // --------------------------------------------------
    // CLONE MODEL
    // --------------------------------------------------

    const instance = template.clone(true);

    // --------------------------------------------------
    // CLONE MATERIALS
    // --------------------------------------------------

    instance.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(
            (material) => material.clone()
          );
        } else {
          child.material = child.material.clone();
        }
      }

      child.castShadow = true;
      child.receiveShadow = true;
      child.visible = true;
    });

    // --------------------------------------------------
    // USER DATA
    // --------------------------------------------------

    instance.userData = {
      modelId: modelId,
      name: config.name,
      type: config.type,

      originalScale:
        config.scale || 1,

      originalPosition:
        instance.position.clone(),

      originalRotation:
        instance.rotation.clone(),
    };

    // --------------------------------------------------
    // SCALE
    // --------------------------------------------------

    const scale = config.scale || 1;

    instance.scale.setScalar(scale);

    // --------------------------------------------------
    // Y OFFSET (manual fine-tune, see config.js)
    // --------------------------------------------------

    if (config.yOffset) {
      instance.position.y += config.yOffset;
    }

    // --------------------------------------------------
    // BASE OFFSET (for surface-aware placement)
    // --------------------------------------------------
    // Distance from the instance's origin down to the lowest point of its
    // (scaled) bounding box, measured while it still sits at the origin so
    // this is a pure model-space value. placement.js uses this to push a
    // placed instance out along the detected surface's normal so its base
    // rests exactly on that surface instead of floating above it or
    // clipping through it — this is also part of the door-orientation fix,
    // since without it an upright door was landing with its center (not
    // its bottom edge) at the hit-test point.
    instance.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(instance);

    instance.userData.baseOffset = bounds.isEmpty()
      ? 0
      : -bounds.min.y;

    // --------------------------------------------------
    // ADD MODEL TO SCENE
    // --------------------------------------------------

    if (!this.scene) {
      throw new Error(
        'ModelManager: Scene is undefined while placing model.'
      );
    }

    this.scene.add(instance);

    // --------------------------------------------------
    // STORE INSTANCE
    // --------------------------------------------------

    this.instances.add(instance);

    console.log(
      `[ModelManager] Placed: ${config.name}`
    );

    return instance;
  }

  // ==================================================
  // GET INSTANCE
  // ==================================================

  getInstance(object) {
    if (!object) {
      return null;
    }

    // If object itself is a placed model
    if (this.instances.has(object)) {
      return object;
    }

    // If a mesh inside the model was clicked,
    // walk up through its parents.
    let current = object;

    while (current) {
      if (this.instances.has(current)) {
        return current;
      }

      current = current.parent;
    }

    // If a model ID was supplied
    if (typeof object === 'string') {
      for (const instance of this.instances) {
        if (
          instance.userData?.modelId === object
        ) {
          return instance;
        }
      }
    }

    return null;
  }

  // ==================================================
  // GET ALL INSTANCES
  // ==================================================

  getInstances() {
    return [...this.instances];
  }

  // ==================================================
  // GET INSTANCE COUNT
  // ==================================================

  getInstanceCount() {
    return this.instances.size;
  }

  // ==================================================
  // REMOVE INSTANCE
  // ==================================================

  removeInstance(instance) {
    if (!instance) {
      return;
    }

    // Remove from scene
    if (this.scene) {
      this.scene.remove(instance);
    }

    // Remove from tracked instances
    this.instances.delete(instance);

    // Dispose geometry/materials
    instance.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      // Dispose geometry
      if (child.geometry) {
        child.geometry.dispose();
      }

      // Dispose materials
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => {
            material.dispose();
          });
        } else {
          child.material.dispose();
        }
      }
    });
  }

  // ==================================================
  // CLEAR ALL MODELS
  // ==================================================

  clearAll() {
    const instances = [
      ...this.instances
    ];

    instances.forEach((instance) => {
      this.removeInstance(instance);
    });
  }

  // ==================================================
  // CLEANUP
  // ==================================================

  dispose() {
    // Remove placed models
    this.clearAll();

    // Clear template cache
    this.cache.clear();

    // Dispose Draco decoder
    this.dracoLoader.dispose();
  }
}