import * as faceapi from 'face-api.js';

/**
 * Detects blink by measuring Eye Aspect Ratio (EAR).
 * A blink occurs when EAR drops below threshold momentarily.
 * 
 * face-api.js eye landmarks have 6 points:
 * [0] = left corner, [1] = upper-left, [2] = upper-right,
 * [3] = right corner, [4] = lower-right, [5] = lower-left
 */

const EAR_THRESHOLD = 0.26; // Below this = eye closed (relaxed for webcam quality)
const BLINK_CONSECUTIVE = 1; // Just 1 frame with closed eyes is enough

export class LivenessDetector {
  constructor() {
    this.closedFrames = 0;
    this.blinkDetected = false;
    this.openEarBaseline = null;
    this.frameCount = 0;
  }

  reset() {
    this.closedFrames = 0;
    this.blinkDetected = false;
    this.openEarBaseline = null;
    this.frameCount = 0;
  }

  /**
   * Check a video frame for blink.
   * Returns: { blinkDetected: boolean, ear: number }
   */
  async checkFrame(videoElement) {
    if (!videoElement || videoElement.readyState !== 4) {
      return { blinkDetected: this.blinkDetected, ear: null };
    }

    try {
      const detection = await faceapi
        .detectSingleFace(videoElement)
        .withFaceLandmarks();

      if (!detection) {
        return { blinkDetected: this.blinkDetected, ear: null };
      }

      const landmarks = detection.landmarks;
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();

      const leftEAR = computeEAR(leftEye);
      const rightEAR = computeEAR(rightEye);
      const avgEAR = (leftEAR + rightEAR) / 2;

      this.frameCount++;

      // Establish baseline (open eyes) from first few frames
      if (this.frameCount <= 3) {
        if (!this.openEarBaseline || avgEAR > this.openEarBaseline) {
          this.openEarBaseline = avgEAR;
        }
        return { blinkDetected: false, ear: avgEAR };
      }

      // Dynamic threshold: use 65% of baseline as threshold
      const dynamicThreshold = this.openEarBaseline 
        ? this.openEarBaseline * 0.65 
        : EAR_THRESHOLD;

      if (avgEAR < dynamicThreshold) {
        this.closedFrames++;
      } else {
        // Eyes opened after being closed = blink completed
        if (this.closedFrames >= BLINK_CONSECUTIVE) {
          this.blinkDetected = true;
        }
        this.closedFrames = 0;
      }

      return { blinkDetected: this.blinkDetected, ear: avgEAR };
    } catch (err) {
      return { blinkDetected: this.blinkDetected, ear: null };
    }
  }

  isConfirmed() {
    return this.blinkDetected;
  }
}

function computeEAR(eyePoints) {
  if (!eyePoints || eyePoints.length < 6) return 0.3;

  // face-api.js eye landmarks:
  // [0]=left corner, [1]=upper-left, [2]=upper-right, [3]=right corner, [4]=lower-right, [5]=lower-left
  const p1 = eyePoints[0]; // left corner
  const p2 = eyePoints[1]; // upper-left
  const p3 = eyePoints[2]; // upper-right
  const p4 = eyePoints[3]; // right corner
  const p5 = eyePoints[4]; // lower-right
  const p6 = eyePoints[5]; // lower-left

  // Vertical distances (top to bottom)
  const vertical1 = distance(p2, p6); // upper-left to lower-left
  const vertical2 = distance(p3, p5); // upper-right to lower-right
  // Horizontal distance
  const horizontal = distance(p1, p4); // left corner to right corner

  if (horizontal === 0) return 0.3;
  return (vertical1 + vertical2) / (2 * horizontal);
}

function distance(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}
