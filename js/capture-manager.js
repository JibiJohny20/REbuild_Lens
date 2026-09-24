// ============================================================================
// capture-manager.js
// Photo + video capture of the rendered <canvas>.
//
// KNOWN LIMITATION (flagged honestly, not glossed over):
// During an active WebXR immersive-ar session, the browser composites the
// real camera passthrough with the WebXR compositor — frames are NOT
// guaranteed to land in the canvas's own regular drawing buffer the way a
// normal WebGL frame does, and browser support for capturing that
// composited output via canvas.toBlob()/captureStream() during an
// immersive-ar session is inconsistent across devices/browsers as of this
// writing. This code captures whatever the canvas's own drawing buffer
// contains, which reliably includes 3D Preview mode content, and includes
// the placed AR objects, but may or may not include the live camera
// passthrough background depending on device/browser. Verify on the
// target AR-capable phone; see the root-cause report for details.
// ============================================================================

import { CAPTURE_CONFIG } from './config.js';

export class CaptureManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this._tickTimer = null;
    this._startedAt = 0;
  }

  static isVideoSupported() {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function'
    );
  }

  /** Returns the Blob and triggers a browser download. */
  capturePhoto(filename = `rebuild-lens-${Date.now()}.png`) {
    return new Promise((resolve, reject) => {
      // Requires the renderer to have been created with
      // { preserveDrawingBuffer: true } — otherwise WebGL is free to clear
      // the drawing buffer immediately after compositing, and toBlob()
      // reads back a blank/garbage frame more often than not.
      this.renderer.domElement.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not capture the current frame.'));
          return;
        }
        this._downloadBlob(blob, filename);
        resolve(blob);
      }, CAPTURE_CONFIG.photoMimeType);
    });
  }

  /** @param {(seconds:number)=>void} [onTick] called every ~250ms with elapsed seconds. */
  startVideoRecording(onTick) {
    if (this.isRecording) return;

    if (!CaptureManager.isVideoSupported()) {
      throw new Error('Video recording is not supported on this device.');
    }

    const stream = this.renderer.domElement.captureStream(30);

    const mimeType =
      CAPTURE_CONFIG.videoMimeTypeCandidates.find((type) =>
        MediaRecorder.isTypeSupported?.(type)
      ) || '';

    this.mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    this.recordedChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(CAPTURE_CONFIG.videoTimesliceMs);
    this.isRecording = true;
    this._startedAt = performance.now();

    if (onTick) {
      this._tickTimer = setInterval(() => {
        onTick((performance.now() - this._startedAt) / 1000);
      }, 250);
    }
  }

  stopVideoRecording(filename = `rebuild-lens-${Date.now()}.webm`) {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('No active recording.'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        clearInterval(this._tickTimer);
        this._tickTimer = null;

        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        this.recordedChunks = [];

        if (blob.size === 0) {
          reject(new Error('Recording produced no data.'));
          return;
        }

        this._downloadBlob(blob, filename);
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  cancelVideoRecording() {
    if (this.mediaRecorder && this.isRecording) {
      // No onstop handler attached for this path — discard, don't download.
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    clearInterval(this._tickTimer);
    this._tickTimer = null;
    this.isRecording = false;
    this.recordedChunks = [];
  }

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}