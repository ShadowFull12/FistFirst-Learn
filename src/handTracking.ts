import { HandLandmarker, FilesetResolver, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { CanvasRenderer } from './renderer';

// Hand landmark indices for reference
export const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20
};

// Connections between landmarks for drawing
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // Index
  [0, 9], [9, 10], [10, 11], [11, 12],    // Middle
  [0, 13], [13, 14], [14, 15], [15, 16],  // Ring
  [0, 17], [17, 18], [18, 19], [19, 20],  // Pinky
  [5, 9], [9, 13], [13, 17]               // Palm
];

export interface HandData {
  landmarks: NormalizedLandmark[];
  handedness: 'Left' | 'Right';
  screenLandmarks: { x: number; y: number; z: number }[];
  palmCenter: { x: number; y: number; z: number };
  palmVertices: { x: number; y: number }[];
  velocity: { x: number; y: number };
  smoothedVelocity: { x: number; y: number }; // For throwing
  isPinching: boolean;
  pinchStrength: number;
  depth: number;
  isFist: boolean;
  handScale: number;
  isPartial: boolean; // Whether hand is partially visible
  isPointing: boolean; // Index finger extended, others curled
  pointingAt: { x: number; y: number } | null; // Where index finger is pointing
}

interface VelocityHistory {
  x: number;
  y: number;
  timestamp: number;
}

interface StoredLandmark {
  x: number;
  y: number;
  z: number;
  confidence: number;
  timestamp: number;
}

/**
 * Hand Tracking Manager - Optimized for partial hand detection
 * Supports edge-of-screen pinching and rotation stability
 */
export class HandTracker {
  private handLandmarker: HandLandmarker | null = null;
  private renderer: CanvasRenderer;
  private lastResults: HandData[] = [];
  private previousLandmarks: Map<string, StoredLandmark[]> = new Map();
  private velocityHistory: Map<string, VelocityHistory[]> = new Map();
  private enabled: boolean = true;
  private onHandsDetected: ((hands: HandData[]) => void) | null = null;
  
  // Tuned for stability and partial hand detection
  private smoothingFactor: number = 0.2; // Slightly more smoothing for stability
  private velocityHistoryLength: number = 8;
  private landmarkPersistence: number = 400; // ms to keep last known landmark positions
  private lastDetectionTimestamp: number = 0;

  constructor(renderer: CanvasRenderer) {
    this.renderer = renderer;
  }

  async initialize(): Promise<void> {
    try {
      console.log('Loading MediaPipe vision library with GPU acceleration...');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      console.log('Creating hand landmarker (GPU accelerated)...');
      try {
        // GPU with LOW confidence thresholds for partial hand detection
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU'
          },
          numHands: 2,
          runningMode: 'VIDEO',
          minHandDetectionConfidence: 0.3,  // Lower for partial hand
          minHandPresenceConfidence: 0.3,   // Lower for edge detection
          minTrackingConfidence: 0.3        // Lower for rotation stability
        });
        console.log('✓ Hand tracking initialized with GPU (partial hand support)');
      } catch (gpuError) {
        console.warn('GPU delegate failed, using CPU...', gpuError);
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU'
          },
          numHands: 2,
          runningMode: 'VIDEO',
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3
        });
        console.log('Hand tracking initialized (CPU)');
      }
    } catch (error) {
      console.error('Failed to initialize hand tracking:', error);
      throw new Error('Failed to load hand tracking. Please check your internet connection and refresh.');
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setOnHandsDetected(callback: (hands: HandData[]) => void): void {
    this.onHandsDetected = callback;
  }

  detect(video: HTMLVideoElement, timestamp: number): HandData[] {
    if (!this.handLandmarker || !this.enabled) {
      return this.lastResults;
    }

    this.lastDetectionTimestamp = timestamp;

    try {
      const results = this.handLandmarker.detectForVideo(video, timestamp);
      const hands: HandData[] = [];

      if (results.landmarks && results.handedness) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const landmarks = results.landmarks[i];
          const handedness = results.handedness[i][0].categoryName as 'Left' | 'Right';
          
          // Check which landmarks are visible (inside screen bounds)
          const visibleCount = this.countVisibleLandmarks(landmarks);
          const isPartial = visibleCount < 21;
          
          // Process landmarks with persistence for missing ones
          const screenLandmarks = this.processLandmarksWithPersistence(
            landmarks,
            handedness,
            this.renderer.width,
            this.renderer.height,
            timestamp
          );

          // Calculate 3D palm center
          const palmCenter = this.calculatePalmCenter3D(screenLandmarks);
          
          // Calculate palm vertices for collision
          const palmVertices = this.calculatePalmVertices(screenLandmarks);
          
          // Calculate real-time velocity with history for throwing
          const { velocity, smoothedVelocity } = this.calculateVelocityWithHistory(
            handedness, 
            palmCenter, 
            timestamp
          );
          
          // Hand scale for depth estimation
          const handScale = this.calculateHandScale(screenLandmarks);
          
          // Detect gestures - works with partial hand!
          const { isPinching, pinchStrength } = this.detectPinchPartial(screenLandmarks, handedness);
          const isFist = this.detectFist(screenLandmarks);
          
          // Detect pointing gesture (index extended, others curled)
          const { isPointing, pointingAt } = this.detectPointing(screenLandmarks);
          
          // Average depth
          const depth = screenLandmarks.reduce((sum, l) => sum + l.z, 0) / screenLandmarks.length;

          hands.push({
            landmarks,
            handedness,
            screenLandmarks,
            palmCenter,
            palmVertices,
            velocity,
            smoothedVelocity,
            isPinching,
            pinchStrength,
            depth,
            isFist,
            handScale,
            isPartial,
            isPointing,
            pointingAt
          });
        }
      }

      this.lastResults = hands;
      
      if (this.onHandsDetected) {
        this.onHandsDetected(hands);
      }

      return hands;
    } catch (error) {
      console.error('Hand detection error:', error);
      return this.lastResults;
    }
  }

  // Count how many landmarks are within visible bounds
  private countVisibleLandmarks(landmarks: NormalizedLandmark[]): number {
    let count = 0;
    for (const l of landmarks) {
      if (l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1) {
        count++;
      }
    }
    return count;
  }

  // Process landmarks with persistence - keeps last known position for missing landmarks
  private processLandmarksWithPersistence(
    landmarks: NormalizedLandmark[],
    handedness: string,
    width: number,
    height: number,
    timestamp: number
  ): { x: number; y: number; z: number }[] {
    const key = handedness;
    const prevLandmarks = this.previousLandmarks.get(key) || [];
    const processed: { x: number; y: number; z: number }[] = [];
    const newStored: StoredLandmark[] = [];

    for (let i = 0; i < landmarks.length; i++) {
      const rawX = landmarks[i].x * width;
      const rawY = landmarks[i].y * height;
      const rawZ = (landmarks[i].z || 0) * width;
      
      // Check if landmark is within reasonable bounds
      const isVisible = landmarks[i].x >= -0.1 && landmarks[i].x <= 1.1 &&
                       landmarks[i].y >= -0.1 && landmarks[i].y <= 1.1;
      
      let x: number, y: number, z: number;
      let confidence = isVisible ? 1.0 : 0.3;
      
      if (isVisible) {
        // Use current detection with smoothing
        if (prevLandmarks[i] && timestamp - prevLandmarks[i].timestamp < this.landmarkPersistence) {
          // Smooth with previous
          const blend = this.smoothingFactor * prevLandmarks[i].confidence;
          x = prevLandmarks[i].x * blend + rawX * (1 - blend);
          y = prevLandmarks[i].y * blend + rawY * (1 - blend);
          z = prevLandmarks[i].z * blend + rawZ * (1 - blend);
        } else {
          x = rawX;
          y = rawY;
          z = rawZ;
        }
      } else if (prevLandmarks[i] && timestamp - prevLandmarks[i].timestamp < this.landmarkPersistence) {
        // Use last known position with decay
        const age = timestamp - prevLandmarks[i].timestamp;
        const decay = Math.max(0, 1 - age / this.landmarkPersistence);
        x = prevLandmarks[i].x;
        y = prevLandmarks[i].y;
        z = prevLandmarks[i].z;
        confidence = prevLandmarks[i].confidence * decay;
      } else {
        // Estimate from visible landmarks
        x = rawX;
        y = rawY;
        z = rawZ;
        confidence = 0.1;
      }

      processed.push({ x, y, z });
      newStored.push({ x, y, z, confidence, timestamp });
    }

    this.previousLandmarks.set(key, newStored);
    return processed;
  }

  private calculatePalmCenter3D(landmarks: { x: number; y: number; z: number }[]): { x: number; y: number; z: number } {
    const palmIndices = [0, 5, 9, 13, 17];
    let sumX = 0, sumY = 0, sumZ = 0;
    
    for (const idx of palmIndices) {
      sumX += landmarks[idx].x;
      sumY += landmarks[idx].y;
      sumZ += landmarks[idx].z;
    }
    
    return {
      x: sumX / palmIndices.length,
      y: sumY / palmIndices.length,
      z: sumZ / palmIndices.length
    };
  }

  private calculatePalmVertices(landmarks: { x: number; y: number; z: number }[]): { x: number; y: number }[] {
    const palmShape = [
      landmarks[HAND_LANDMARKS.WRIST],
      landmarks[HAND_LANDMARKS.THUMB_CMC],
      landmarks[HAND_LANDMARKS.THUMB_MCP],
      landmarks[HAND_LANDMARKS.INDEX_MCP],
      landmarks[HAND_LANDMARKS.MIDDLE_MCP],
      landmarks[HAND_LANDMARKS.RING_MCP],
      landmarks[HAND_LANDMARKS.PINKY_MCP],
    ];
    return palmShape.map(p => ({ x: p.x, y: p.y }));
  }

  private calculateVelocityWithHistory(
    handedness: string,
    currentPosition: { x: number; y: number; z: number },
    timestamp: number
  ): { velocity: { x: number; y: number }; smoothedVelocity: { x: number; y: number } } {
    const key = `${handedness}_palm`;
    let history = this.velocityHistory.get(key) || [];
    
    // Add current position to history
    history.push({ x: currentPosition.x, y: currentPosition.y, timestamp });
    
    // Keep only recent history
    const maxAge = 150; // 150ms of history
    history = history.filter(h => timestamp - h.timestamp < maxAge);
    if (history.length > this.velocityHistoryLength) {
      history = history.slice(-this.velocityHistoryLength);
    }
    this.velocityHistory.set(key, history);

    if (history.length < 2) {
      return { velocity: { x: 0, y: 0 }, smoothedVelocity: { x: 0, y: 0 } };
    }

    // Instant velocity (last 2 frames)
    const prev = history[history.length - 2];
    const curr = history[history.length - 1];
    const dt = Math.max(1, curr.timestamp - prev.timestamp);
    const velocity = {
      x: (curr.x - prev.x) / dt * 16, // Normalize to ~60fps
      y: (curr.y - prev.y) / dt * 16
    };

    // Smoothed velocity for throwing (weighted average of recent velocities)
    let totalWeight = 0;
    let smoothedX = 0;
    let smoothedY = 0;
    
    for (let i = 1; i < history.length; i++) {
      const h1 = history[i - 1];
      const h2 = history[i];
      const hdt = Math.max(1, h2.timestamp - h1.timestamp);
      const weight = i / history.length; // More recent = higher weight
      
      smoothedX += ((h2.x - h1.x) / hdt * 16) * weight;
      smoothedY += ((h2.y - h1.y) / hdt * 16) * weight;
      totalWeight += weight;
    }

    const smoothedVelocity = {
      x: totalWeight > 0 ? smoothedX / totalWeight : 0,
      y: totalWeight > 0 ? smoothedY / totalWeight : 0
    };

    return { velocity, smoothedVelocity };
  }

  private calculateHandScale(landmarks: { x: number; y: number; z: number }[]): number {
    // Distance from wrist to middle fingertip as scale reference
    const wrist = landmarks[HAND_LANDMARKS.WRIST];
    const middleTip = landmarks[HAND_LANDMARKS.MIDDLE_TIP];
    
    return Math.sqrt(
      Math.pow(middleTip.x - wrist.x, 2) +
      Math.pow(middleTip.y - wrist.y, 2)
    );
  }

  private detectPinch(landmarks: { x: number; y: number; z: number }[]): { isPinching: boolean; pinchStrength: number } {
    const thumbTip = landmarks[HAND_LANDMARKS.THUMB_TIP];
    const indexTip = landmarks[HAND_LANDMARKS.INDEX_TIP];
    
    // 2D distance only - more reliable for grab detection
    const distance = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) +
      Math.pow(thumbTip.y - indexTip.y, 2)
    );
    
    // More forgiving thresholds for easier grabbing
    const pinchThreshold = 60; // Increased from 45
    const maxDistance = 150;   // Increased from 120
    
    const pinchStrength = Math.max(0, Math.min(1, 1 - (distance / maxDistance)));
    const isPinching = distance < pinchThreshold;
    
    return { isPinching, pinchStrength };
  }

  // Detect pinch even with partial hand visibility (only thumb and index visible)
  private detectPinchPartial(
    landmarks: { x: number; y: number; z: number }[],
    handedness: string
  ): { isPinching: boolean; pinchStrength: number } {
    const key = handedness;
    const storedLandmarks = this.previousLandmarks.get(key);
    
    const thumbTip = landmarks[HAND_LANDMARKS.THUMB_TIP];
    const indexTip = landmarks[HAND_LANDMARKS.INDEX_TIP];
    
    // Check if we have thumb and index positions (either current or stored)
    let hasThumb = thumbTip.x !== 0 || thumbTip.y !== 0;
    let hasIndex = indexTip.x !== 0 || indexTip.y !== 0;
    
    // Check stored landmarks confidence
    if (storedLandmarks) {
      const thumbStored = storedLandmarks[HAND_LANDMARKS.THUMB_TIP];
      const indexStored = storedLandmarks[HAND_LANDMARKS.INDEX_TIP];
      
      if (thumbStored && thumbStored.confidence > 0.3) hasThumb = true;
      if (indexStored && indexStored.confidence > 0.3) hasIndex = true;
    }
    
    // If both thumb and index are available, do normal pinch detection
    if (hasThumb && hasIndex) {
      // 2D distance for pinch
      const distance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2)
      );
      
      // Very forgiving thresholds for edge-of-screen detection
      const pinchThreshold = 70; // Even more forgiving for partial hands
      const maxDistance = 160;
      
      const pinchStrength = Math.max(0, Math.min(1, 1 - (distance / maxDistance)));
      const isPinching = distance < pinchThreshold;
      
      return { isPinching, pinchStrength };
    }
    
    // Not enough data for pinch detection
    return { isPinching: false, pinchStrength: 0 };
  }

  private detectFist(landmarks: { x: number; y: number; z: number }[]): boolean {
    // Check if fingers are curled (tips close to palm)
    const palmCenter = this.calculatePalmCenter3D(landmarks);
    const fingerTips = [
      HAND_LANDMARKS.INDEX_TIP,
      HAND_LANDMARKS.MIDDLE_TIP,
      HAND_LANDMARKS.RING_TIP,
      HAND_LANDMARKS.PINKY_TIP
    ];
    
    let curledFingers = 0;
    for (const tipIdx of fingerTips) {
      const tip = landmarks[tipIdx];
      const dist = Math.sqrt(
        Math.pow(tip.x - palmCenter.x, 2) +
        Math.pow(tip.y - palmCenter.y, 2)
      );
      if (dist < 80) curledFingers++;
    }
    
    return curledFingers >= 3;
  }

  // Detect pointing gesture - index finger extended, other fingers curled
  private detectPointing(landmarks: { x: number; y: number; z: number }[]): {
    isPointing: boolean;
    pointingAt: { x: number; y: number } | null;
  } {
    const wrist = landmarks[HAND_LANDMARKS.WRIST];
    const indexTip = landmarks[HAND_LANDMARKS.INDEX_TIP];
    const indexPip = landmarks[HAND_LANDMARKS.INDEX_PIP];
    const indexMcp = landmarks[HAND_LANDMARKS.INDEX_MCP];
    const middleTip = landmarks[HAND_LANDMARKS.MIDDLE_TIP];
    const ringTip = landmarks[HAND_LANDMARKS.RING_TIP];
    const pinkyTip = landmarks[HAND_LANDMARKS.PINKY_TIP];
    const palmCenter = this.calculatePalmCenter3D(landmarks);
    
    // Check if index finger is extended (tip far from palm)
    const indexDist = Math.sqrt(
      Math.pow(indexTip.x - palmCenter.x, 2) +
      Math.pow(indexTip.y - palmCenter.y, 2)
    );
    
    // Check if other fingers are curled (tips close to palm)
    const middleDist = Math.sqrt(
      Math.pow(middleTip.x - palmCenter.x, 2) +
      Math.pow(middleTip.y - palmCenter.y, 2)
    );
    const ringDist = Math.sqrt(
      Math.pow(ringTip.x - palmCenter.x, 2) +
      Math.pow(ringTip.y - palmCenter.y, 2)
    );
    const pinkyDist = Math.sqrt(
      Math.pow(pinkyTip.x - palmCenter.x, 2) +
      Math.pow(pinkyTip.y - palmCenter.y, 2)
    );
    
    // Index extended, others curled
    const indexExtended = indexDist > 100;
    const othersCurled = middleDist < 90 && ringDist < 90 && pinkyDist < 90;
    
    // Also check index finger is straight (tip above PIP)
    const indexStraight = this.isFingerStraight(indexMcp, indexPip, indexTip);
    
    const isPointing = indexExtended && othersCurled && indexStraight;
    
    if (isPointing) {
      // Calculate where the finger is pointing
      // Extend a line from MCP through TIP
      const dx = indexTip.x - indexMcp.x;
      const dy = indexTip.y - indexMcp.y;
      const extension = 2.0; // How far to extend the pointing line
      
      return {
        isPointing: true,
        pointingAt: {
          x: indexTip.x + dx * extension,
          y: indexTip.y + dy * extension
        }
      };
    }
    
    return { isPointing: false, pointingAt: null };
  }

  // Helper to check if finger joints are roughly aligned (straight finger)
  private isFingerStraight(
    mcp: { x: number; y: number },
    pip: { x: number; y: number },
    tip: { x: number; y: number }
  ): boolean {
    // Calculate angle at PIP joint
    const v1 = { x: mcp.x - pip.x, y: mcp.y - pip.y };
    const v2 = { x: tip.x - pip.x, y: tip.y - pip.y };
    
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    if (mag1 < 1 || mag2 < 1) return false;
    
    const cosAngle = dot / (mag1 * mag2);
    // cos(angle) < -0.5 means angle > 120 degrees (roughly straight)
    return cosAngle < -0.3;
  }

  render(hands: HandData[]): void {
    this.renderer.clearHands();
    const ctx = this.renderer.getHandContext();

    for (const hand of hands) {
      const baseColor = hand.handedness === 'Left' ? '#10b981' : '#3b82f6';
      const landmarks = hand.screenLandmarks;
      
      // Depth-based alpha (closer = more solid)
      const depthAlpha = Math.max(0.4, Math.min(1, 1 + hand.depth * 0.5));

      // Draw solid palm with 3D shading
      ctx.beginPath();
      const palmVerts = hand.palmVertices;
      if (palmVerts.length > 0) {
        ctx.moveTo(palmVerts[0].x, palmVerts[0].y);
        for (let i = 1; i < palmVerts.length; i++) {
          ctx.lineTo(palmVerts[i].x, palmVerts[i].y);
        }
        ctx.closePath();
        
        // Gradient fill for 3D effect
        const gradient = ctx.createRadialGradient(
          hand.palmCenter.x, hand.palmCenter.y, 0,
          hand.palmCenter.x, hand.palmCenter.y, 80
        );
        gradient.addColorStop(0, `${baseColor}${Math.floor(depthAlpha * 180).toString(16).padStart(2, '0')}`);
        gradient.addColorStop(1, `${baseColor}${Math.floor(depthAlpha * 80).toString(16).padStart(2, '0')}`);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Draw finger bones with thickness based on depth
      for (const [start, end] of HAND_CONNECTIONS) {
        const startL = landmarks[start];
        const endL = landmarks[end];
        
        // Thicker lines for closer parts
        const avgZ = (startL.z + endL.z) / 2;
        const thickness = Math.max(2, 5 - avgZ * 0.02);
        
        ctx.beginPath();
        ctx.moveTo(startL.x, startL.y);
        ctx.lineTo(endL.x, endL.y);
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Draw 3D landmarks with depth-based size
      for (let i = 0; i < landmarks.length; i++) {
        const l = landmarks[i];
        const isKeyPoint = [0, 4, 8, 12, 16, 20].includes(i);
        const baseSize = isKeyPoint ? 10 : 6;
        const size = Math.max(3, baseSize - l.z * 0.01);
        
        // 3D sphere effect
        const gradient = ctx.createRadialGradient(
          l.x - size * 0.3, l.y - size * 0.3, 0,
          l.x, l.y, size
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.5, baseColor);
        gradient.addColorStop(1, this.darkenColor(baseColor));
        
        ctx.beginPath();
        ctx.arc(l.x, l.y, size, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Draw palm center with velocity indicator
      const velMag = Math.sqrt(hand.velocity.x ** 2 + hand.velocity.y ** 2);
      const centerSize = 20 + Math.min(15, velMag * 0.5);
      
      ctx.beginPath();
      ctx.arc(hand.palmCenter.x, hand.palmCenter.y, centerSize, 0, Math.PI * 2);
      ctx.fillStyle = hand.isPinching ? 'rgba(239, 68, 68, 0.8)' : 
                      hand.isFist ? 'rgba(245, 158, 11, 0.8)' :
                      `${baseColor}aa`;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw velocity vector
      if (velMag > 2) {
        const velScale = Math.min(50, velMag * 3);
        ctx.beginPath();
        ctx.moveTo(hand.palmCenter.x, hand.palmCenter.y);
        ctx.lineTo(
          hand.palmCenter.x + hand.velocity.x * velScale / velMag * 0.5,
          hand.palmCenter.y + hand.velocity.y * velScale / velMag * 0.5
        );
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Pinch indicator
      if (hand.isPinching) {
        const thumbTip = landmarks[HAND_LANDMARKS.THUMB_TIP];
        const indexTip = landmarks[HAND_LANDMARKS.INDEX_TIP];
        const midX = (thumbTip.x + indexTip.x) / 2;
        const midY = (thumbTip.y + indexTip.y) / 2;
        
        ctx.beginPath();
        ctx.arc(midX, midY, 25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✊', midX, midY);
      }
    }
  }

  private darkenColor(hex: string): string {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40);
    return `rgb(${r}, ${g}, ${b})`;
  }

  getLastResults(): HandData[] {
    return this.lastResults;
  }

  destroy(): void {
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
  }
}
