import { HandData, HAND_LANDMARKS } from './handTracking';

/**
 * Playing Field - A moveable game boundary
 * 
 * Controls:
 * - Make an UPWARD FACING FIST for 3 seconds to enter move mode
 * - Keep fist closed to move the field with your hand
 * - OPEN your hand to lock the field position
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
   * Detect UPWARD FACING FIST - triggers when:
   * 1. Hand is making a fist (all fingers curled)
   * 2. Fist is facing UPWARD (wrist is below knuckles)
   * 3. Knuckles are roughly horizontal (not tilted)
   */
  private isUpwardFacingFist(hand: HandData): boolean {
    const landmarks = hand.screenLandmarks;
    
    // Must be making a fist
    if (!hand.isFist) {
      return false;
    }
    
    const wrist = landmarks[HAND_LANDMARKS.WRIST];
    const indexMcp = landmarks[HAND_LANDMARKS.INDEX_MCP];
    const middleMcp = landmarks[HAND_LANDMARKS.MIDDLE_MCP];
    const ringMcp = landmarks[HAND_LANDMARKS.RING_MCP];
    const pinkyMcp = landmarks[HAND_LANDMARKS.PINKY_MCP];
    
    // Calculate average knuckle position
    const knuckleAvgY = (indexMcp.y + middleMcp.y + ringMcp.y + pinkyMcp.y) / 4;
    const knuckleAvgX = (indexMcp.x + middleMcp.x + ringMcp.x + pinkyMcp.x) / 4;
    
    // ===== CHECK 1: Fist must be UPWARD (wrist below knuckles) =====
    // In screen coordinates, Y increases downward, so wrist.y > knuckleAvgY means wrist is below
    const isUpwardFist = wrist.y > knuckleAvgY + 20;
    if (!isUpwardFist) {
      return false;
    }
    
    // ===== CHECK 2: Knuckles should be roughly horizontal (not tilted) =====
    const mcpYValues = [indexMcp.y, middleMcp.y, ringMcp.y, pinkyMcp.y];
    const mcpYRange = Math.max(...mcpYValues) - Math.min(...mcpYValues);
    const isLevel = mcpYRange < 60;
    if (!isLevel) {
      return false;
    }
    
    // ===== CHECK 3: All fingers must be curled (tips close to palm) =====
    const fingerTips = [
      landmarks[HAND_LANDMARKS.INDEX_TIP],
      landmarks[HAND_LANDMARKS.MIDDLE_TIP],
      landmarks[HAND_LANDMARKS.RING_TIP],
      landmarks[HAND_LANDMARKS.PINKY_TIP]
    ];
    
    const palmCenter = hand.palmCenter;
    let curledFingers = 0;
    
    for (const tip of fingerTips) {
      const dist = Math.sqrt(
        Math.pow(tip.x - palmCenter.x, 2) +
        Math.pow(tip.y - palmCenter.y, 2)
      );
      // Finger is curled if tip is close to palm
      if (dist < 80) {
        curledFingers++;
      }
    }
    
    // Need at least 3 fingers curled (allowing some tolerance)
    if (curledFingers < 3) {
      return false;
    }
    
    // ===== CHECK 4: Thumb should be tucked or to the side =====
    const thumbTip = landmarks[HAND_LANDMARKS.THUMB_TIP];
    const thumbDist = Math.sqrt(
      Math.pow(thumbTip.x - palmCenter.x, 2) +
      Math.pow(thumbTip.y - palmCenter.y, 2)
    );
    // Thumb should be relatively close to palm (not extended)
    const thumbTucked = thumbDist < 100;
    if (!thumbTucked) {
      return false;
    }
    
    return true;
  }

  /**
   * Check if hand is OPEN (not a fist) - used to lock the field
   */
  private isOpenHand(hand: HandData): boolean {
    const landmarks = hand.screenLandmarks;
    const palmCenter = hand.palmCenter;
    
    // Hand should NOT be a fist
    if (hand.isFist) {
      return false;
    }
    
    // Check that fingers are extended
    const fingerTips = [
      landmarks[HAND_LANDMARKS.INDEX_TIP],
      landmarks[HAND_LANDMARKS.MIDDLE_TIP],
      landmarks[HAND_LANDMARKS.RING_TIP],
      landmarks[HAND_LANDMARKS.PINKY_TIP]
    ];
    
    let extendedFingers = 0;
    
    for (const tip of fingerTips) {
      const dist = Math.sqrt(
        Math.pow(tip.x - palmCenter.x, 2) +
        Math.pow(tip.y - palmCenter.y, 2)
      );
      // Finger is extended if tip is far from palm
      if (dist > 80) {
        extendedFingers++;
      }
    }
    
    // Need at least 3 fingers extended
    return extendedFingers >= 3;
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
    const isUpwardFist = this.isUpwardFacingFist(hand);
    const isOpen = this.isOpenHand(hand);
    
    // State machine for field manipulation
    // NEW: Upward fist starts countdown, keep fist to move, open hand to lock
    switch (this.mode) {
      case 'normal':
        // Check for upward facing fist (start move countdown)
        if (isUpwardFist) {
          this.mode = 'move-pending';
          this.palmHoldStartTime = currentTime;
          this.lastPalmPosition = { x: palmPos.x, y: palmPos.y };
        }
        break;

      case 'move-pending':
        if (isUpwardFist) {
          // Still holding upward fist - update progress
          const elapsed = currentTime - this.palmHoldStartTime;
          this.moveProgress = Math.min(1, elapsed / this.palmHoldDuration);
          this.lastPalmPosition = { x: palmPos.x, y: palmPos.y };
          
          if (elapsed >= this.palmHoldDuration) {
            // Transition to moving mode
            this.mode = 'moving';
            this.moveProgress = 1;
            console.log('Move mode activated! Keep fist to move, open hand to lock.');
          }
        } else {
          // Fist not valid anymore - cancel
          this.mode = 'normal';
          this.moveProgress = 0;
        }
        break;

      case 'moving':
        if (isOpen) {
          // Open hand detected - lock position
          this.mode = 'normal';
          this.moveProgress = 0;
          console.log('Field position locked!');
          this.notifyBoundsChanged();
        } else {
          // Keep fist closed to move field with hand position
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
      
      // Progress text - fix mirrored text by temporarily resetting transform
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to normal (un-mirror)
      const textX = this.screenWidth - this.lastPalmPosition.x; // Flip X for correct position
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign = 'center';
      
      // Draw background for better visibility
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(textX - 120, this.lastPalmPosition.y + 55, 240, 50);
      
      ctx.fillStyle = '#22c55e';
      ctx.fillText(`${Math.round(this.moveProgress * 100)}%`, textX, this.lastPalmPosition.y + 75);
      ctx.font = 'bold 14px system-ui';
      ctx.fillText('Hold upward fist to move field', textX, this.lastPalmPosition.y + 95);
      ctx.restore();
    }
    
    // Mode indicator
    if (this.mode === 'moving') {
      // Fix mirrored text
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to normal
      const centerX = this.screenWidth - (b.x + b.width / 2); // Flip X
      
      // Draw background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(centerX - 160, b.y - 35, 320, 30);
      
      ctx.fillStyle = 'rgba(34, 197, 94, 0.95)';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('✊ MOVING - Open hand to lock', centerX, b.y - 15);
      ctx.restore();
    }
    
    ctx.restore();
  }
}
