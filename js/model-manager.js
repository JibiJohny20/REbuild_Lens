import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MODELS } from './config.js';

export class ModelManager {
  constructor(scene) {
    this.scene = scene;

    // GLTF loader
    this.loader = new GLTFLoader();

    // Draco decoder for compressed GLB files
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(
      'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'
    );

    this.loader.setDRACOLoader(this.dracoLoader);

    // Store loaded model templates
    this.cache = new Map();

    // Store actual model instances placed in the scene
    this.instances = new Set();
  }

  // --------------------------------------------------
  // LOAD MODEL TEMPLATE
  // --------------------------------------------------

  async loadTemplate(modelId) {
    if (this.cache.has(modelId)) {
      return this.cache.get(modelId);
    }

    const config = MODELS[modelId];

    if (!config) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    try {
      const gltf = await this.loader.loadAsync(config.path);

      const template = gltf.scene;

      template.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.cache.set(modelId, template);

      return template;

    } catch (error) {
      console.error(
        `Failed to load ${config.path}`,
        error
      );

      throw error;
    }
  }

  // --------------------------------------------------
  // CREATE MODEL INSTANCE
  // --------------------------------------------------

  async createInstance(modelId) {
    const config = MODELS[modelId];

    if (!config) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    const template = await this.loadTemplate(modelId);

    // Clone the model
    const instance = template.clone(true);

    // Clone materials so every placed model
    // can be manipulated independently
    instance.traverse((child) => {
      if (child.isMesh) {
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map((material) =>
              material.clone()
            );
          } else {
            child.material = child.material.clone();
          }
        }

        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Store useful information
    instance.userData = {
      modelId: modelId,
      name: config.name,
      type: config.type,
      originalScale: config.scale || 1,
      originalPosition: instance.position.clone(),
      originalRotation: instance.rotation.clone(),
    };

    // Apply configured scale
    instance.scale.setScalar(config.scale || 1);

    // Apply Y offset
    if (config.yOffset) {
      instance.position.y += config.yOffset;
    }

    // Add to scene
    this.scene.add(instance);

    // Keep track of placed instance
    this.instances.add(instance);

    return instance;
  }

  // --------------------------------------------------
  // GET INSTANCE
  // --------------------------------------------------

  getInstance(object) {
    if (!object) {
      return null;
    }

    // If the object itself is a placed model
    if (this.instances.has(object)) {
      return object;
    }

    // If a mesh inside a placed model was clicked,
    // walk upward through its parents.
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
        if (instance.userData?.modelId === object) {
          return instance;
        }
      }
    }

    return null;
  }

  // --------------------------------------------------
  // GET ALL INSTANCES
  // --------------------------------------------------

  getInstances() {
    return [...this.instances];
  }

  // --------------------------------------------------
  // GET INSTANCE COUNT
  // --------------------------------------------------

  getInstanceCount() {
    return this.instances.size;
  }

  // --------------------------------------------------
  // REMOVE INSTANCE
  // --------------------------------------------------

  removeInstance(instance) {
    if (!instance) {
      return;
    }

    // Remove from scene
    this.scene.remove(instance);

    // Remove from tracked instances
    this.instances.delete(instance);

    // Dispose geometry/materials
    instance.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }

        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => {
              material.dispose();
            });
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }

  // --------------------------------------------------
  // CLEAR ALL MODELS
  // --------------------------------------------------

  clearAll() {
    const instances = [...this.instances];

    instances.forEach((instance) => {
      this.removeInstance(instance);
    });
  }

  // --------------------------------------------------
  // CLEANUP
  // --------------------------------------------------

  dispose() {
    this.clearAll();

    this.cache.clear();

    this.dracoLoader.dispose();
  }
}