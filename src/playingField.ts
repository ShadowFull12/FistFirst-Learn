import { HandData, HAND_LANDMARKS } from './handTracking';

/**
 * Playing Field - A moveable game boundary
 * 
 * Controls:
 * - Show open palm (front facing, all fingers up) for 3 seconds to enter move mode
 * - Move palm to reposition the field
 * - Close fist to lock position
 */

export interface PlayingFieldBounds {
  x: number;      // Left edge
  y: number;      // Top edge
  width: number;
  height: number;
  right: number;  // Computed: x + width
  bottom: number; // Computed: y + height
}

type FieldMode = 'normal' | 'move-pending' | 'moving';

export class PlayingField {
  private bounds: PlayingFieldBounds;
  private defaultSizeRatio: number = 0.8; // 80% of screen
  private screenWidth: number;
  private screenHeight: number;
  private mode: FieldMode = 'normal';
  private palmHoldStartTime: number = 0;
  private palmHoldDuration: number = 3000; // 3 seconds to activate move mode
  private isVisible: boolean = true;
  private onBoundsChanged: ((bounds: PlayingFieldBounds) => void) | null = null;
  
  // Visual feedback
  private moveProgress: number = 0; // 0-1 for palm hold progress
  private lastPalmPosition: { x: number; y: number } | null = null;

  constructor(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.bounds = this.calculateDefaultBounds();
  }

  private calculateDefaultBounds(): PlayingFieldBounds {
    const width = this.screenWidth * this.defaultSizeRatio;
    const height = this.screenHeight * this.defaultSizeRatio;
    const x = (this.screenWidth - width) / 2;
    const y = (this.screenHeight - height) / 2;
    
    return {
      x,
      y,
      width,
      height,
      right: x + width,
      bottom: y + height
    };
  }

  setOnBoundsChanged(callback: (bounds: PlayingFieldBounds) => void): void {
    this.onBoundsChanged = callback;
  }

  private notifyBoundsChanged(): void {
    if (this.onBoundsChanged) {
      this.onBoundsChanged(this.bounds);
    }
  }

  // Reset to 80% default size
  resetToDefault(): void {
    this.bounds = this.calculateDefaultBounds();
    this.mode = 'normal';
    this.moveProgress = 0;
    this.notifyBoundsChanged();
    console.log('Playing field reset to 80% default');
  }

  // Handle screen resize
  resize(screenWidth: number, screenHeight: number): void {
    // Keep same relative position and size
    const relX = this.bounds.x / this.screenWidth;
    const relY = this.bounds.y / this.screenHeight;
    const relW = this.bounds.width / this.screenWidth;
    const relH = this.bounds.height / this.screenHeight;

    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.bounds = {
      x: relX * screenWidth,
      y: relY * screenHeight,
      width: relW * screenWidth,
      height: relH * screenHeight,
      right: 0,
      bottom: 0
    };
    this.updateComputedBounds();
    this.notifyBoundsChanged();
  }

  private updateComputedBounds(): void {
    this.bounds.right = this.bounds.x + this.bounds.width;
    this.bounds.bottom = this.bounds.y + this.bounds.height;
  }

  getBounds(): PlayingFieldBounds {
    return { ...this.bounds };
  }

  getMode(): FieldMode {
    return this.mode;
  }

  getMoveProgress(): number {
    return this.moveProgress;
  }

  isFieldVisible(): boolean {
    return this.isVisible;
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (visible) {
      // Reset to default when made visible again
      this.resetToDefault();
    }
  }

  toggleVisibility(): void {
    this.setVisible(!this.isVisible);
  }

  /**
   * STRICT palm detection - only triggers when:
   * 1. FRONT of palm facing camera (not back of hand) - verified by Z-depth
   * 2. All 5 fingers fully extended and pointing UP
   * 3. Fingers are STRAIGHT (not bent at any joint)
   * 4. Palm is not tilted sideways
   * 5. Hand is in "STOP" gesture position
   * 
   * Uses 3D depth (Z) to distinguish front vs back of palm:
   * - Front of palm: fingertips are CLOSER to camera (lower Z) than palm base
   * - Back of hand: fingertips are FURTHER from camera (higher Z) than palm base
   */
  private isValidOpenPalm(hand: HandData): boolean {
    const landmarks = hand.screenLandmarks;
    
    // Must not be pinching or making a fist
    if (hand.isPinching || hand.isFist) {
      return false;
    }
    
    const palmCenter = hand.palmCenter;
    const wrist = landmarks[HAND_LANDMARKS.WRIST];
    
    // ===== CHECK 1: Palm must be UPRIGHT (wrist below palm center) =====
    const isUprightPalm = wrist.y > palmCenter.y + 30;
    if (!isUprightPalm) {
      return false;
    }
    
    // ===== CHECK 2: FRONT of palm facing camera (Z-depth check) =====
    // When viewing FRONT of palm, fingertips are CLOSER to camera than palm/wrist
    // Z values: lower = closer to camera
    const wristZ = wrist.z;
    const palmBaseZ = (
      landmarks[HAND_LANDMARKS.INDEX_MCP].z +
      landmarks[HAND_LANDMARKS.MIDDLE_MCP].z +
      landmarks[HAND_LANDMARKS.RING_MCP].z +
      landmarks[HAND_LANDMARKS.PINKY_MCP].z
    ) / 4;
    
    const fingertipZ = (
      landmarks[HAND_LANDMARKS.INDEX_TIP].z +
      landmarks[HAND_LANDMARKS.MIDDLE_TIP].z +
      landmarks[HAND_LANDMARKS.RING_TIP].z +
      landmarks[HAND_LANDMARKS.PINKY_TIP].z
    ) / 4;
    
    // Front of palm: fingertips should be closer to camera (lower Z) than palm base
    // If fingertipZ > palmBaseZ, we're seeing the BACK of the hand
    const isFrontOfPalm = fingertipZ < palmBaseZ + 10; // Small tolerance
    if (!isFrontOfPalm) {
      return false;
    }
    
    // ===== CHECK 3: Thumb position confirms front of palm =====
    // On FRONT of RIGHT palm: thumb is on LEFT side (lower X in mirrored view)
    // On FRONT of LEFT palm: thumb is on RIGHT side (higher X in mirrored view)
    const thumbTip = landmarks[HAND_LANDMARKS.THUMB_TIP];
    const pinkyMcp = landmarks[HAND_LANDMARKS.PINKY_MCP];
    const indexMcp = landmarks[HAND_LANDMARKS.INDEX_MCP];
    
    // Check thumb is on the correct side for front of palm
    const isRightHand = hand.handedness === 'Right';
    // In mirrored webcam: Right hand's thumb should be to the RIGHT of pinky
    // (appears opposite because of mirror)
    const thumbOnCorrectSide = isRightHand 
      ? thumbTip.x > pinkyMcp.x  // Right hand front: thumb appears on right in mirror
      : thumbTip.x < pinkyMcp.x; // Left hand front: thumb appears on left in mirror
    
    if (!thumbOnCorrectSide) {
      return false;
    }
    
    // ===== CHECK 4: All 4 fingers must be STRAIGHT and pointing UP =====
    const fingerChecks = [
      { mcp: HAND_LANDMARKS.INDEX_MCP, pip: HAND_LANDMARKS.INDEX_PIP, dip: HAND_LANDMARKS.INDEX_DIP, tip: HAND_LANDMARKS.INDEX_TIP },
      { mcp: HAND_LANDMARKS.MIDDLE_MCP, pip: HAND_LANDMARKS.MIDDLE_PIP, dip: HAND_LANDMARKS.MIDDLE_DIP, tip: HAND_LANDMARKS.MIDDLE_TIP },
      { mcp: HAND_LANDMARKS.RING_MCP, pip: HAND_LANDMARKS.RING_PIP, dip: HAND_LANDMARKS.RING_DIP, tip: HAND_LANDMARKS.RING_TIP },
      { mcp: HAND_LANDMARKS.PINKY_MCP, pip: HAND_LANDMARKS.PINKY_PIP, dip: HAND_LANDMARKS.PINKY_DIP, tip: HAND_LANDMARKS.PINKY_TIP }
    ];
    
    let straightFingers = 0;
    
    for (const finger of fingerChecks) {
      const mcp = landmarks[finger.mcp];
      const pip = landmarks[finger.pip];
      const dip = landmarks[finger.dip];
      const tip = landmarks[finger.tip];
      
      // Finger must point UPWARD (tip.y < mcp.y, with Y increasing downward)
      const isPointingUp = tip.y < mcp.y - 40;
      
      // Finger must be STRAIGHT: each joint progressively higher
      // MCP -> PIP -> DIP -> TIP should have decreasing Y values
      const isJointAligned = mcp.y > pip.y && pip.y > dip.y && dip.y > tip.y;
      
      // Finger must be extended (tip far from palm)
      const tipDist = Math.sqrt(
        Math.pow(tip.x - palmCenter.x, 2) +
        Math.pow(tip.y - palmCenter.y, 2)
      );
      const isExtended = tipDist > 90;
      
      // Check finger is not bent backwards or curled
      // The angle at PIP should not indicate bending
      const pipToMcp = { x: mcp.x - pip.x, y: mcp.y - pip.y };
      const pipToTip = { x: tip.x - pip.x, y: tip.y - pip.y };
      const dotProduct = pipToMcp.x * pipToTip.x + pipToMcp.y * pipToTip.y;
      const isNotBent = dotProduct < 0; // Negative dot product means roughly straight line
      
      if (isPointingUp && isJointAligned && isExtended && isNotBent) {
        straightFingers++;
      }
    }
    
    // Need ALL 4 fingers straight and pointing up
    if (straightFingers < 4) {
      return false;
    }
    
    // ===== CHECK 5: Thumb must be extended outward =====
    const thumbMcp = landmarks[HAND_LANDMARKS.THUMB_MCP];
    const thumbDist = Math.sqrt(
      Math.pow(thumbTip.x - palmCenter.x, 2) +
      Math.pow(thumbTip.y - palmCenter.y, 2)
    );
    const thumbExtended = thumbDist > 70;
    if (!thumbExtended) {
      return false;
    }
    
    // ===== CHECK 6: Palm facing camera (fingers spread horizontally) =====
    const fingerSpread = Math.abs(indexMcp.x - pinkyMcp.x);
    const hasPalmWidth = fingerSpread > 70;
    if (!hasPalmWidth) {
      return false;
    }
    
    // ===== CHECK 7: MCPs should be roughly at same height (palm not tilted) =====
    const mcpYValues = [
      landmarks[HAND_LANDMARKS.INDEX_MCP].y,
      landmarks[HAND_LANDMARKS.MIDDLE_MCP].y,
      landmarks[HAND_LANDMARKS.RING_MCP].y,
      landmarks[HAND_LANDMARKS.PINKY_MCP].y
    ];
    const mcpYRange = Math.max(...mcpYValues) - Math.min(...mcpYValues);
    const isPalmLevel = mcpYRange < 50; // MCPs roughly aligned
    if (!isPalmLevel) {
      return false;
    }
    
    // ===== CHECK 8: Z-depth consistency (palm flat toward camera) =====
    const mcpZValues = [
      landmarks[HAND_LANDMARKS.INDEX_MCP].z,
      landmarks[HAND_LANDMARKS.MIDDLE_MCP].z,
      landmarks[HAND_LANDMARKS.RING_MCP].z,
      landmarks[HAND_LANDMARKS.PINKY_MCP].z
    ];
    const zRange = Math.max(...mcpZValues) - Math.min(...mcpZValues);
    const isFlatTowardCamera = zRange < 40;
    if (!isFlatTowardCamera) {
      return false;
    }
    
    // All checks passed - this is a valid front-facing open palm!
    return true;
  }

  // Main update function - call every frame with hand data
  update(hands: HandData[], currentTime: number): void {
    if (!this.isVisible) return;

    // Find the dominant hand (prefer right)
    const hand = hands.find(h => h.handedness === 'Right') || hands[0];
    
    if (!hand) {
      // No hand detected - reset states if in pending mode
      if (this.mode === 'move-pending') {
        this.mode = 'normal';
        this.moveProgress = 0;
      }
      return;
    }

    const palmPos = hand.palmCenter;
    const isValidPalm = this.isValidOpenPalm(hand);
    const isFist = hand.isFist;
    
    // State machine for field manipulation (no resizing - only move)
    switch (this.mode) {
      case 'normal':
        // Check for valid open palm (start move countdown)
        if (isValidPalm) {
          this.mode = 'move-pending';
          this.palmHoldStartTime = currentTime;
          this.lastPalmPosition = { x: palmPos.x, y: palmPos.y };
        }
        break;

      case 'move-pending':
        if (isValidPalm) {
          // Still showing valid palm - update progress
          const elapsed = currentTime - this.palmHoldStartTime;
          this.moveProgress = Math.min(1, elapsed / this.palmHoldDuration);
          this.lastPalmPosition = { x: palmPos.x, y: palmPos.y };
          
          if (elapsed >= this.palmHoldDuration) {
            // Transition to moving mode
            this.mode = 'moving';
            this.moveProgress = 1;
            console.log('Move mode activated! Close fist to place field.');
          }
        } else {
          // Palm not valid anymore - cancel
          this.mode = 'normal';
          this.moveProgress = 0;
        }
        break;

      case 'moving':
        if (isFist) {
          // Fist detected - lock position
          this.mode = 'normal';
          this.moveProgress = 0;
          console.log('Field position locked!');
          this.notifyBoundsChanged();
        } else {
          // Move field with palm position
          const centerX = palmPos.x;
          const centerY = palmPos.y;
          
          // Keep field centered on hand
          this.bounds.x = centerX - this.bounds.width / 2;
          this.bounds.y = centerY - this.bounds.height / 2;
          
          // Clamp to screen
          this.bounds.x = Math.max(0, Math.min(this.screenWidth - this.bounds.width, this.bounds.x));
          this.bounds.y = Math.max(0, Math.min(this.screenHeight - this.bounds.height, this.bounds.y));
          
          this.updateComputedBounds();
          this.lastPalmPosition = { x: palmPos.x, y: palmPos.y };
        }
        break;
    }
  }

  // Render the playing field
  render(ctx: CanvasRenderingContext2D): void {
    if (!this.isVisible) return;

    const b = this.bounds;
    
    // Draw field border
    ctx.save();
    
    // Outer glow when in special mode
    if (this.mode !== 'normal') {
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 20;
    }
    
    // Field border
    ctx.strokeStyle = this.mode === 'moving' ? '#22c55e' : 
                      this.mode === 'move-pending' ? `rgba(34, 197, 94, ${0.5 + this.moveProgress * 0.5})` :
                      'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = this.mode === 'normal' ? 3 : 5;
    ctx.setLineDash(this.mode === 'moving' ? [] : [15, 10]);
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    ctx.setLineDash([]);
    
    // Semi-transparent fill outside the field (darken outside area)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    // Top bar
    ctx.fillRect(0, 0, this.screenWidth, b.y);
    // Bottom bar
    ctx.fillRect(0, b.bottom, this.screenWidth, this.screenHeight - b.bottom);
    // Left bar
    ctx.fillRect(0, b.y, b.x, b.height);
    // Right bar
    ctx.fillRect(b.right, b.y, this.screenWidth - b.right, b.height);
    
    // Move progress indicator
    if (this.mode === 'move-pending' && this.lastPalmPosition) {
      ctx.beginPath();
      ctx.arc(this.lastPalmPosition.x, this.lastPalmPosition.y, 50, -Math.PI / 2, -Math.PI / 2 + this.moveProgress * Math.PI * 2);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      // Progress text
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(this.moveProgress * 100)}%`, this.lastPalmPosition.x, this.lastPalmPosition.y + 70);
      ctx.fillText('Hold palm facing camera', this.lastPalmPosition.x, this.lastPalmPosition.y + 90);
    }
    
    // Mode indicator
    if (this.mode === 'moving') {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('✋ MOVING - Close fist to lock', b.x + b.width / 2, b.y - 15);
    }
    
    ctx.restore();
  }
}
