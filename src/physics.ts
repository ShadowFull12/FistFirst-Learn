import Matter from 'matter-js';
import { CanvasRenderer } from './renderer';
import { HandData, HAND_LANDMARKS } from './handTracking';
import { PlayingFieldBounds } from './playingField';

const { Engine, World, Bodies, Body, Events } = Matter;

// Physics constants - tuned for responsive throwing
const MAX_VELOCITY = 25; // Allow faster throws
const BOUNDARY_MARGIN = 15; // Extra margin inside boundaries

export interface PhysicsObject {
  id: string;
  body: Matter.Body;
  type: 'circle' | 'rectangle' | 'polygon' | 'triangle' | 'hexagon' | 'star' | 'custom';
  color: string;
  strokeColor?: string;
  label?: string;
  shapeInfo?: {
    sides?: number;
    points?: number;
    customVertices?: { x: number; y: number }[];
    width?: number;  // Original width for rectangles
    height?: number; // Original height for rectangles
  };
}

export interface PhysicsConfig {
  gravity: { x: number; y: number };
  boundariesEnabled: boolean;
  handsCollidable: boolean;
  magneticAttraction: boolean;
  comfortZoneEnabled: boolean;
}

// Store initial boundary frame position for AR persistence
interface BoundaryFrame {
  width: number;
  height: number;
  initialized: boolean;
}

/**
 * Physics Engine - Matter.js integration with solid hand collision support
 */
export class PhysicsEngine {
  private engine: Matter.Engine;
  private world: Matter.World;
  private renderer: CanvasRenderer;
  private objects: Map<string, PhysicsObject> = new Map();
  private boundaries: Matter.Body[] = [];
  private handBodies: Map<string, Matter.Body[]> = new Map();
  private config: PhysicsConfig = {
    gravity: { x: 0, y: 0.5 }, // Start with slight gravity
    boundariesEnabled: true,  // Boundaries enabled by default
    handsCollidable: true,    // Hand collision enabled by default
    magneticAttraction: false, // Magnetic attraction OFF by default (use palm for field move only)
    comfortZoneEnabled: false  // Using playing field instead of comfort zone
  };
  private boundaryFrame: BoundaryFrame = { width: 0, height: 0, initialized: false };
  private grabbedObjects: Map<string, { objectId: string; constraint: Matter.Constraint | null }> = new Map();
  private objectIdCounter: number = 0;
  private lastHandPositions: Map<string, { x: number; y: number }> = new Map();
  private comfortZoneHeight: number = 0.75; // Balls stay in top 75% of screen
  private playingFieldBounds: PlayingFieldBounds | null = null; // Custom playing field
  private onBoundariesChangedCallback: ((enabled: boolean) => void) | null = null;

  constructor(renderer: CanvasRenderer) {
    this.renderer = renderer;
    this.engine = Engine.create({
      gravity: { x: 0, y: 0.5, scale: 0.001 }, // Light gravity from start
      // Improve collision detection for fast objects
      positionIterations: 10,
      velocityIterations: 10,
      constraintIterations: 4
    });
    this.world = this.engine.world;
    
    this.setupCollisionEvents();
  }

  // Initialize boundaries based on first frame - call this after resize
  initializeBoundaryFrame(): void {
    if (!this.boundaryFrame.initialized) {
      this.boundaryFrame.width = this.renderer.width;
      this.boundaryFrame.height = this.renderer.height;
      this.boundaryFrame.initialized = true;
      this.enableBoundaries();
      console.log(`AR Boundary frame initialized: ${this.boundaryFrame.width}x${this.boundaryFrame.height}`);
    }
  }

  getBoundaryFrame(): BoundaryFrame {
    return this.boundaryFrame;
  }

  private setupCollisionEvents(): void {
    Events.on(this.engine, 'collisionStart', (_event) => {
      // Handle collision sounds/effects here if needed
      // Access _event.pairs for collision pair data
    });
  }

  // Gravity control
  setGravity(x: number, y: number): void {
    this.config.gravity = { x, y };
    this.engine.gravity.x = x;
    this.engine.gravity.y = y;
  }

  getGravity(): { x: number; y: number } {
    return this.config.gravity;
  }

  enableGravity(strength: number = 1): void {
    this.setGravity(0, strength);
  }

  disableGravity(): void {
    this.setGravity(0, 0);
  }

  // Boundary walls - uses playing field if set, otherwise comfort zone
  enableBoundaries(skipCallback: boolean = false): void {
    if (this.config.boundariesEnabled) return;
    
    const thickness = 50;
    const options = {
      isStatic: true,
      restitution: 0.9, // Extra bouncy to keep balls moving
      friction: 0.05,
      label: 'boundary'
    };

    let left: number, top: number, right: number, bottom: number;
    
    if (this.playingFieldBounds) {
      // Use playing field bounds
      left = this.playingFieldBounds.x;
      top = this.playingFieldBounds.y;
      right = this.playingFieldBounds.right;
      bottom = this.playingFieldBounds.bottom;
    } else {
      // Use screen with comfort zone
      left = 0;
      top = 0;
      right = this.renderer.width;
      bottom = this.config.comfortZoneEnabled 
        ? this.renderer.height * this.comfortZoneHeight 
        : this.renderer.height;
    }
    
    const width = right - left;
    const height = bottom - top;
    const centerX = left + width / 2;
    const centerY = top + height / 2;

    this.boundaries = [
      // Top
      Bodies.rectangle(centerX, top - thickness / 2, width + thickness * 2, thickness, options),
      // Bottom
      Bodies.rectangle(centerX, bottom + thickness / 2, width + thickness * 2, thickness, options),
      // Left
      Bodies.rectangle(left - thickness / 2, centerY, thickness, height + thickness * 2, options),
      // Right
      Bodies.rectangle(right + thickness / 2, centerY, thickness, height + thickness * 2, options)
    ];

    World.add(this.world, this.boundaries);
    this.config.boundariesEnabled = true;
    console.log(`Boundaries enabled: ${Math.round(left)},${Math.round(top)} to ${Math.round(right)},${Math.round(bottom)}`);
    
    // Notify callback (unless skipped during internal updates)
    if (!skipCallback) {
      this.onBoundariesChangedCallback?.(true);
    }
  }

  // Set playing field bounds (called when field changes)
  setPlayingFieldBounds(bounds: PlayingFieldBounds | null): void {
    this.playingFieldBounds = bounds;
    this.updateBoundaries();
    
    // Move any objects outside the new bounds back inside
    if (bounds) {
      this.constrainObjectsToField();
    }
  }

  getPlayingFieldBounds(): PlayingFieldBounds | null {
    return this.playingFieldBounds;
  }

  // Move all objects back inside the playing field
  private constrainObjectsToField(): void {
    if (!this.playingFieldBounds) return;
    
    const b = this.playingFieldBounds;
    this.objects.forEach((obj) => {
      const pos = obj.body.position;
      let newX = pos.x;
      let newY = pos.y;
      
      const margin = 40;
      if (pos.x < b.x + margin) newX = b.x + margin;
      if (pos.x > b.right - margin) newX = b.right - margin;
      if (pos.y < b.y + margin) newY = b.y + margin;
      if (pos.y > b.bottom - margin) newY = b.bottom - margin;
      
      if (newX !== pos.x || newY !== pos.y) {
        Body.setPosition(obj.body, { x: newX, y: newY });
      }
    });
  }

  disableBoundaries(): void {
    if (!this.config.boundariesEnabled) return;
    
    World.remove(this.world, this.boundaries);
    this.boundaries = [];
    this.config.boundariesEnabled = false;
    
    // Notify callback
    this.onBoundariesChangedCallback?.(false);
  }

  // Update boundaries on resize
  updateBoundaries(): void {
    if (!this.config.boundariesEnabled) return;
    
    // Remove old boundaries
    World.remove(this.world, this.boundaries);
    this.boundaries = [];
    this.config.boundariesEnabled = false;
    
    // Re-enable with new dimensions (skip callback to avoid infinite loop)
    this.enableBoundaries(true);
  }

  areBoundariesEnabled(): boolean {
    return this.config.boundariesEnabled;
  }

  // Set callback for when boundaries are enabled/disabled
  setOnBoundariesChanged(callback: (enabled: boolean) => void): void {
    this.onBoundariesChangedCallback = callback;
  }

  // Object creation
  createBall(
    x: number,
    y: number,
    radius: number = 30,
    color: string = '#3b82f6',
    options: Partial<Matter.IBodyDefinition> = {}
  ): PhysicsObject {
    const id = `ball_${++this.objectIdCounter}`;
    
    const body = Bodies.circle(x, y, radius, {
      restitution: options.restitution ?? 0.8,
      friction: options.friction ?? 0.1,
      frictionAir: options.frictionAir ?? 0.01,
      density: options.density ?? 0.001,
      label: id,
      ...options
    });

    World.add(this.world, body);

    const obj: PhysicsObject = {
      id,
      body,
      type: 'circle',
      color,
      strokeColor: this.darkenColor(color)
    };

    this.objects.set(id, obj);
    console.log(`Created ball: ${id} at (${x}, ${y})`);
    return obj;
  }

  createRectangle(
    x: number,
    y: number,
    width: number = 60,
    height: number = 60,
    color: string = '#10b981',
    options: Partial<Matter.IBodyDefinition> = {}
  ): PhysicsObject {
    const id = `rect_${++this.objectIdCounter}`;
    
    const body = Bodies.rectangle(x, y, width, height, {
      restitution: options.restitution ?? 0.6,
      friction: options.friction ?? 0.1,
      frictionAir: options.frictionAir ?? 0.01,
      density: options.density ?? 0.001,
      label: id,
      ...options
    });

    World.add(this.world, body);

    const obj: PhysicsObject = {
      id,
      body,
      type: 'rectangle',
      color,
      strokeColor: this.darkenColor(color),
      shapeInfo: { width, height } // Store original dimensions
    };

    this.objects.set(id, obj);
    return obj;
  }

  // Create regular polygon (triangle, pentagon, hexagon, etc.)
  createPolygon(
    x: number,
    y: number,
    sides: number = 6,
    radius: number = 40,
    color: string = '#8b5cf6',
    options: Partial<Matter.IBodyDefinition> = {}
  ): PhysicsObject {
    const id = `poly_${++this.objectIdCounter}`;
    
    const body = Bodies.polygon(x, y, sides, radius, {
      restitution: options.restitution ?? 0.7,
      friction: options.friction ?? 0.1,
      frictionAir: options.frictionAir ?? 0.01,
      density: options.density ?? 0.001,
      label: id,
      ...options
    });

    World.add(this.world, body);

    let shapeType: PhysicsObject['type'] = 'polygon';
    if (sides === 3) shapeType = 'triangle';
    else if (sides === 6) shapeType = 'hexagon';

    const obj: PhysicsObject = {
      id,
      body,
      type: shapeType,
      color,
      strokeColor: this.darkenColor(color),
      shapeInfo: { sides }
    };

    this.objects.set(id, obj);
    console.log(`Created ${sides}-sided polygon: ${id} at (${x}, ${y})`);
    return obj;
  }

  // Create star shape
  createStar(
    x: number,
    y: number,
    points: number = 5,
    outerRadius: number = 50,
    innerRadius: number = 25,
    color: string = '#f59e0b',
    options: Partial<Matter.IBodyDefinition> = {}
  ): PhysicsObject {
    const id = `star_${++this.objectIdCounter}`;
    
    // Generate star vertices
    const vertices: { x: number; y: number }[] = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      vertices.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }
    
    const body = Bodies.fromVertices(x, y, [vertices], {
      restitution: options.restitution ?? 0.7,
      friction: options.friction ?? 0.1,
      frictionAir: options.frictionAir ?? 0.01,
      density: options.density ?? 0.001,
      label: id,
      ...options
    });

    World.add(this.world, body);

    const obj: PhysicsObject = {
      id,
      body,
      type: 'star',
      color,
      strokeColor: this.darkenColor(color),
      shapeInfo: { points, customVertices: vertices }
    };

    this.objects.set(id, obj);
    console.log(`Created ${points}-point star: ${id} at (${x}, ${y})`);
    return obj;
  }

  // Create custom shape from vertices
  createCustomShape(
    x: number,
    y: number,
    vertices: { x: number; y: number }[],
    color: string = '#06b6d4',
    options: Partial<Matter.IBodyDefinition> = {}
  ): PhysicsObject | null {
    if (vertices.length < 3) {
      console.error('Custom shape needs at least 3 vertices');
      return null;
    }

    const id = `custom_${++this.objectIdCounter}`;
    
    const body = Bodies.fromVertices(x, y, [vertices], {
      restitution: options.restitution ?? 0.6,
      friction: options.friction ?? 0.1,
      frictionAir: options.frictionAir ?? 0.01,
      density: options.density ?? 0.001,
      label: id,
      ...options
    });

    World.add(this.world, body);

    const obj: PhysicsObject = {
      id,
      body,
      type: 'custom',
      color,
      strokeColor: this.darkenColor(color),
      shapeInfo: { customVertices: vertices }
    };

    this.objects.set(id, obj);
    console.log(`Created custom shape: ${id} at (${x}, ${y})`);
    return obj;
  }

  // Query objects in the scene
  getObjectsInfo(): { 
    total: number; 
    byType: Record<string, number>; 
    byColor: Record<string, number>;
    objects: { 
      id: string; 
      type: string; 
      color: string; 
      x: number; 
      y: number; 
      velocity: { x: number; y: number };
      mass: number;
      density: number;
      bounciness: number;
      friction: number;
      isStatic: boolean;
    }[];
  } {
    const byType: Record<string, number> = {};
    const byColor: Record<string, number> = {};
    const objectsList: { 
      id: string; 
      type: string; 
      color: string; 
      x: number; 
      y: number; 
      velocity: { x: number; y: number };
      mass: number;
      density: number;
      bounciness: number;
      friction: number;
      isStatic: boolean;
    }[] = [];

    this.objects.forEach((obj) => {
      // Count by type
      byType[obj.type] = (byType[obj.type] || 0) + 1;
      
      // Count by color (approximate color name)
      const colorName = this.getColorName(obj.color);
      byColor[colorName] = (byColor[colorName] || 0) + 1;
      
      objectsList.push({
        id: obj.id,
        type: obj.type,
        color: colorName,
        x: Math.round(obj.body.position.x),
        y: Math.round(obj.body.position.y),
        velocity: {
          x: Math.round(obj.body.velocity.x * 10) / 10,
          y: Math.round(obj.body.velocity.y * 10) / 10
        },
        mass: Math.round(obj.body.mass * 1000) / 1000,
        density: Math.round(obj.body.density * 10000) / 10000,
        bounciness: Math.round(obj.body.restitution * 100) / 100,
        friction: Math.round(obj.body.friction * 100) / 100,
        isStatic: obj.body.isStatic
      });
    });

    return {
      total: this.objects.size,
      byType,
      byColor,
      objects: objectsList
    };
  }

  // Find object at specific position
  getObjectAtPosition(x: number, y: number, radius: number = 50): PhysicsObject | null {
    return this.findNearestObject({ x, y }, radius);
  }

  // Get color name from hex
  private getColorName(hex: string): string {
    const colorMap: Record<string, string> = {
      '#ef4444': 'red', '#f97316': 'orange', '#eab308': 'yellow',
      '#22c55e': 'green', '#3b82f6': 'blue', '#a855f7': 'purple',
      '#ec4899': 'pink', '#ffffff': 'white', '#1a1a1a': 'black',
      '#6b7280': 'gray', '#10b981': 'emerald', '#8b5cf6': 'violet',
      '#f59e0b': 'amber', '#06b6d4': 'cyan', '#14b8a6': 'teal'
    };
    return colorMap[hex.toLowerCase()] || hex;
  }

  // Modify existing object properties
  setObjectColor(objectId: string, color: string): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      obj.color = color;
      obj.strokeColor = this.darkenColor(color);
      return true;
    }
    return false;
  }

  setObjectVelocity(objectId: string, vx: number, vy: number): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      Body.setVelocity(obj.body, { x: vx, y: vy });
      return true;
    }
    return false;
  }

  setObjectPosition(objectId: string, x: number, y: number): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      Body.setPosition(obj.body, { x, y });
      return true;
    }
    return false;
  }

  setObjectStatic(objectId: string, isStatic: boolean): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      Body.setStatic(obj.body, isStatic);
      return true;
    }
    return false;
  }

  scaleObject(objectId: string, scale: number): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      Body.scale(obj.body, scale, scale);
      return true;
    }
    return false;
  }

  // Hand collision bodies
  enableHandCollision(): void {
    this.config.handsCollidable = true;
    console.log('Hand collision enabled');
  }

  disableHandCollision(): void {
    this.config.handsCollidable = false;
    // Remove existing hand bodies
    this.handBodies.forEach((bodies) => {
      World.remove(this.world, bodies);
    });
    this.handBodies.clear();
  }

  areHandsCollidable(): boolean {
    return this.config.handsCollidable;
  }

  updateHandBodies(hands: HandData[]): void {
    if (!this.config.handsCollidable) return;

    // Track which hands are currently detected
    const currentHands = new Set<string>();

    for (const hand of hands) {
      const handKey = hand.handedness;
      currentHands.add(handKey);

      if (!this.handBodies.has(handKey)) {
        // Create collision bodies for this hand
        const bodies = this.createHandCollisionBodies(hand);
        this.handBodies.set(handKey, bodies);
        World.add(this.world, bodies);
      }

      // Update positions
      this.updateHandBodyPositions(handKey, hand);
    }

    // Remove hands that are no longer detected
    this.handBodies.forEach((bodies, key) => {
      if (!currentHands.has(key)) {
        World.remove(this.world, bodies);
        this.handBodies.delete(key);
      }
    });

    // Handle grabbing
    this.updateGrabbing(hands);
  }

  private createHandCollisionBodies(hand: HandData): Matter.Body[] {
    const bodies: Matter.Body[] = [];
    const landmarks = hand.screenLandmarks;
    
    // Create solid palm collider using polygon from palm vertices
    const palmVerts = hand.palmVertices;
    if (palmVerts.length >= 3) {
      // Create palm as a large circle that covers the palm area
      bodies.push(Bodies.circle(
        hand.palmCenter.x,
        hand.palmCenter.y,
        60, // Larger palm collider for solid feel
        {
          isStatic: true,
          restitution: 0.3,
          friction: 1.0,
          label: `hand_${hand.handedness}_palm`
        }
      ));
    }

    // Finger colliders - multiple circles along each finger for solid coverage
    const fingerJoints = [
      // Thumb
      [HAND_LANDMARKS.THUMB_MCP, HAND_LANDMARKS.THUMB_IP, HAND_LANDMARKS.THUMB_TIP],
      // Index
      [HAND_LANDMARKS.INDEX_MCP, HAND_LANDMARKS.INDEX_PIP, HAND_LANDMARKS.INDEX_DIP, HAND_LANDMARKS.INDEX_TIP],
      // Middle
      [HAND_LANDMARKS.MIDDLE_MCP, HAND_LANDMARKS.MIDDLE_PIP, HAND_LANDMARKS.MIDDLE_DIP, HAND_LANDMARKS.MIDDLE_TIP],
      // Ring
      [HAND_LANDMARKS.RING_MCP, HAND_LANDMARKS.RING_PIP, HAND_LANDMARKS.RING_DIP, HAND_LANDMARKS.RING_TIP],
      // Pinky
      [HAND_LANDMARKS.PINKY_MCP, HAND_LANDMARKS.PINKY_PIP, HAND_LANDMARKS.PINKY_DIP, HAND_LANDMARKS.PINKY_TIP]
    ];

    for (const finger of fingerJoints) {
      for (const idx of finger) {
        const size = idx === finger[finger.length - 1] ? 18 : 12; // Larger tips
        bodies.push(Bodies.circle(
          landmarks[idx].x,
          landmarks[idx].y,
          size,
          {
            isStatic: true,
            restitution: 0.3,
            friction: 1.0,
            label: `hand_${hand.handedness}_joint_${idx}`
          }
        ));
      }
    }

    return bodies;
  }

  private updateHandBodyPositions(handKey: string, hand: HandData): void {
    const bodies = this.handBodies.get(handKey);
    if (!bodies || bodies.length === 0) return;

    const landmarks = hand.screenLandmarks;
    
    // Update palm (first body)
    Body.setPosition(bodies[0], {
      x: hand.palmCenter.x,
      y: hand.palmCenter.y
    });
    Body.setVelocity(bodies[0], hand.velocity);

    // Update finger joints (remaining bodies)
    const fingerJoints = [
      HAND_LANDMARKS.THUMB_MCP, HAND_LANDMARKS.THUMB_IP, HAND_LANDMARKS.THUMB_TIP,
      HAND_LANDMARKS.INDEX_MCP, HAND_LANDMARKS.INDEX_PIP, HAND_LANDMARKS.INDEX_DIP, HAND_LANDMARKS.INDEX_TIP,
      HAND_LANDMARKS.MIDDLE_MCP, HAND_LANDMARKS.MIDDLE_PIP, HAND_LANDMARKS.MIDDLE_DIP, HAND_LANDMARKS.MIDDLE_TIP,
      HAND_LANDMARKS.RING_MCP, HAND_LANDMARKS.RING_PIP, HAND_LANDMARKS.RING_DIP, HAND_LANDMARKS.RING_TIP,
      HAND_LANDMARKS.PINKY_MCP, HAND_LANDMARKS.PINKY_PIP, HAND_LANDMARKS.PINKY_DIP, HAND_LANDMARKS.PINKY_TIP
    ];

    for (let i = 0; i < fingerJoints.length && i + 1 < bodies.length; i++) {
      const idx = fingerJoints[i];
      Body.setPosition(bodies[i + 1], {
        x: landmarks[idx].x,
        y: landmarks[idx].y
      });
    }
  }

  private updateGrabbing(hands: HandData[]): void {
    for (const hand of hands) {
      const grabKey = hand.handedness;
      const currentGrab = this.grabbedObjects.get(grabKey);
      
      // Calculate grab point between thumb and index
      const thumbTip = hand.screenLandmarks[HAND_LANDMARKS.THUMB_TIP];
      const indexTip = hand.screenLandmarks[HAND_LANDMARKS.INDEX_TIP];
      const grabPoint = {
        x: (thumbTip.x + indexTip.x) / 2,
        y: (thumbTip.y + indexTip.y) / 2
      };
      
      // More forgiving pinch detection - use pinch strength
      const isHolding = hand.isPinching || hand.pinchStrength > 0.5;
      
      if (isHolding) {
        if (!currentGrab) {
          // Try to grab an object with larger detection radius
          const nearestObject = this.findNearestObject(grabPoint, 80);
          if (nearestObject) {
            this.grabbedObjects.set(grabKey, {
              objectId: nearestObject.id,
              constraint: null
            });
            Body.setStatic(nearestObject.body, true);
            Body.setVelocity(nearestObject.body, { x: 0, y: 0 });
            console.log(`Grabbed: ${nearestObject.id}`);
          }
        } else {
          // Keep object attached to grab point
          const obj = this.objects.get(currentGrab.objectId);
          if (obj) {
            // Instant follow for tight grab feel
            Body.setPosition(obj.body, { x: grabPoint.x, y: grabPoint.y });
            Body.setVelocity(obj.body, { x: 0, y: 0 }); // Zero velocity while held
          }
        }
      } else {
        // Release if was grabbing
        if (currentGrab) {
          const obj = this.objects.get(currentGrab.objectId);
          if (obj) {
            Body.setStatic(obj.body, false);
            // Use smoothedVelocity for more accurate throwing
            const throwVel = hand.smoothedVelocity || hand.velocity;
            let vx = throwVel.x * 1.5; // Boost throw velocity
            let vy = throwVel.y * 1.5;
            
            // Clamp velocity to prevent escaping boundaries
            const speed = Math.sqrt(vx * vx + vy * vy);
            if (speed > MAX_VELOCITY) {
              const scale = MAX_VELOCITY / speed;
              vx *= scale;
              vy *= scale;
            }
            
            // Ensure minimum throw velocity if there was movement
            if (speed > 1 && speed < 3) {
              const boost = 3 / speed;
              vx *= boost;
              vy *= boost;
            }
            
            Body.setVelocity(obj.body, { x: vx, y: vy });
            console.log(`Threw: ${currentGrab.objectId} vel=(${vx.toFixed(1)}, ${vy.toFixed(1)})`);
          }
          this.grabbedObjects.delete(grabKey);
        }
      }
    }
  }

  private findNearestObject(point: { x: number; y: number }, maxDistance: number): PhysicsObject | null {
    let nearest: PhysicsObject | null = null;
    let minDist = maxDistance;

    this.objects.forEach((obj) => {
      const dx = obj.body.position.x - point.x;
      const dy = obj.body.position.y - point.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < minDist) {
        minDist = dist;
        nearest = obj;
      }
    });

    return nearest;
  }

  // Object property modification
  setObjectBounciness(objectId: string, restitution: number): void {
    const obj = this.objects.get(objectId);
    if (obj) {
      obj.body.restitution = Math.max(0, Math.min(1, restitution));
    }
  }

  setAllBounciness(restitution: number): void {
    this.objects.forEach((obj) => {
      obj.body.restitution = Math.max(0, Math.min(1, restitution));
    });
  }

  setAllFriction(friction: number): void {
    this.objects.forEach((obj) => {
      obj.body.friction = Math.max(0, Math.min(1, friction));
    });
  }

  // === ADVANCED PHYSICS PROPERTIES ===
  
  // Set mass of a specific object (affects how it responds to forces)
  setObjectMass(objectId: string, mass: number): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      Body.setMass(obj.body, Math.max(0.01, mass));
      return true;
    }
    return false;
  }

  // Set density (mass per unit area) - automatically updates mass based on shape size
  setObjectDensity(objectId: string, density: number): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      Body.setDensity(obj.body, Math.max(0.0001, density));
      return true;
    }
    return false;
  }

  // Set friction (how much objects grip when sliding against each other)
  setObjectFriction(objectId: string, friction: number): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      obj.body.friction = Math.max(0, Math.min(1, friction));
      return true;
    }
    return false;
  }

  // Set air resistance (how much the object slows down in air)
  setObjectAirResistance(objectId: string, airFriction: number): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      obj.body.frictionAir = Math.max(0, Math.min(1, airFriction));
      return true;
    }
    return false;
  }

  // Set angular velocity (spin)
  setObjectSpin(objectId: string, angularVelocity: number): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      Body.setAngularVelocity(obj.body, angularVelocity);
      return true;
    }
    return false;
  }

  // Set angle (rotation in radians)
  setObjectAngle(objectId: string, angle: number): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      Body.setAngle(obj.body, angle);
      return true;
    }
    return false;
  }

  // Apply force to a specific object
  applyForceToObject(objectId: string, force: { x: number; y: number }): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      Body.applyForce(obj.body, obj.body.position, force);
      return true;
    }
    return false;
  }

  // Apply impulse (instant velocity change)
  applyImpulseToObject(objectId: string, impulse: { x: number; y: number }): boolean {
    const obj = this.objects.get(objectId);
    if (obj) {
      const currentVel = obj.body.velocity;
      Body.setVelocity(obj.body, { 
        x: currentVel.x + impulse.x, 
        y: currentVel.y + impulse.y 
      });
      return true;
    }
    return false;
  }

  // Get detailed physics info for an object
  getObjectPhysicsInfo(objectId: string): {
    mass: number;
    density: number;
    friction: number;
    airResistance: number;
    bounciness: number;
    velocity: { x: number; y: number };
    angularVelocity: number;
    angle: number;
    isStatic: boolean;
    position: { x: number; y: number };
  } | null {
    const obj = this.objects.get(objectId);
    if (!obj) return null;
    
    return {
      mass: obj.body.mass,
      density: obj.body.density,
      friction: obj.body.friction,
      airResistance: obj.body.frictionAir,
      bounciness: obj.body.restitution,
      velocity: { x: obj.body.velocity.x, y: obj.body.velocity.y },
      angularVelocity: obj.body.angularVelocity,
      angle: obj.body.angle,
      isStatic: obj.body.isStatic,
      position: { x: obj.body.position.x, y: obj.body.position.y }
    };
  }

  // Set all physics properties for an object at once
  setObjectPhysics(objectId: string, properties: {
    mass?: number;
    density?: number;
    friction?: number;
    airResistance?: number;
    bounciness?: number;
    isStatic?: boolean;
  }): boolean {
    const obj = this.objects.get(objectId);
    if (!obj) return false;
    
    if (properties.mass !== undefined) Body.setMass(obj.body, properties.mass);
    if (properties.density !== undefined) Body.setDensity(obj.body, properties.density);
    if (properties.friction !== undefined) obj.body.friction = properties.friction;
    if (properties.airResistance !== undefined) obj.body.frictionAir = properties.airResistance;
    if (properties.bounciness !== undefined) obj.body.restitution = properties.bounciness;
    if (properties.isStatic !== undefined) Body.setStatic(obj.body, properties.isStatic);
    
    return true;
  }

  // Set mass for all objects of a type or color
  setMassForAll(options: { type?: string; color?: string; mass: number }): number {
    let count = 0;
    this.objects.forEach((obj) => {
      if (options.type && obj.type !== options.type) return;
      if (options.color) {
        const colorName = this.getColorName(obj.color);
        if (colorName !== options.color.toLowerCase()) return;
      }
      Body.setMass(obj.body, options.mass);
      count++;
    });
    return count;
  }

  // Set density for all objects of a type or color
  setDensityForAll(options: { type?: string; color?: string; density: number }): number {
    let count = 0;
    this.objects.forEach((obj) => {
      if (options.type && obj.type !== options.type) return;
      if (options.color) {
        const colorName = this.getColorName(obj.color);
        if (colorName !== options.color.toLowerCase()) return;
      }
      Body.setDensity(obj.body, options.density);
      count++;
    });
    return count;
  }

  // Make objects "heavy" (like metal) or "light" (like foam)
  setObjectMaterial(objectId: string, material: 'metal' | 'wood' | 'rubber' | 'foam' | 'ice' | 'stone'): boolean {
    const materials: Record<string, { density: number; friction: number; restitution: number; frictionAir: number }> = {
      metal: { density: 0.008, friction: 0.3, restitution: 0.2, frictionAir: 0.005 },
      wood: { density: 0.003, friction: 0.4, restitution: 0.3, frictionAir: 0.01 },
      rubber: { density: 0.002, friction: 0.9, restitution: 0.9, frictionAir: 0.01 },
      foam: { density: 0.0005, friction: 0.6, restitution: 0.4, frictionAir: 0.05 },
      ice: { density: 0.002, friction: 0.02, restitution: 0.3, frictionAir: 0.001 },
      stone: { density: 0.006, friction: 0.5, restitution: 0.1, frictionAir: 0.005 }
    };
    
    const mat = materials[material];
    if (!mat) return false;
    
    const obj = this.objects.get(objectId);
    if (!obj) return false;
    
    Body.setDensity(obj.body, mat.density);
    obj.body.friction = mat.friction;
    obj.body.restitution = mat.restitution;
    obj.body.frictionAir = mat.frictionAir;
    
    return true;
  }

  // Compare masses between two objects
  compareMasses(id1: string, id2: string): { heavier: string; ratio: number } | null {
    const obj1 = this.objects.get(id1);
    const obj2 = this.objects.get(id2);
    if (!obj1 || !obj2) return null;
    
    const m1 = obj1.body.mass;
    const m2 = obj2.body.mass;
    
    return {
      heavier: m1 >= m2 ? id1 : id2,
      ratio: Math.max(m1, m2) / Math.min(m1, m2)
    };
  }

  applyForceToAll(force: { x: number; y: number }): void {
    this.objects.forEach((obj) => {
      Body.applyForce(obj.body, obj.body.position, force);
    });
  }

  // Object removal
  removeObject(id: string): boolean {
    const obj = this.objects.get(id);
    if (obj) {
      World.remove(this.world, obj.body);
      this.objects.delete(id);
      return true;
    }
    return false;
  }

  clearAllObjects(): void {
    this.objects.forEach((obj) => {
      World.remove(this.world, obj.body);
    });
    this.objects.clear();
    this.objectIdCounter = 0;
  }

  getObjects(): PhysicsObject[] {
    return Array.from(this.objects.values());
  }

  getObjectById(id: string): PhysicsObject | undefined {
    return this.objects.get(id);
  }

  // Simulation update
  update(deltaTime: number): void {
    // Apply magnetic attraction before physics step
    if (this.config.magneticAttraction) {
      this.applyMagneticAttraction();
    }
    
    Engine.update(this.engine, deltaTime);
    
    // Enforce boundaries and clamp velocities
    if (this.config.boundariesEnabled) {
      this.enforceObjectBounds();
    } else {
      // Remove objects that fall out of screen when boundaries are disabled
      this.removeOutOfBoundsObjects();
    }
  }
  
  // Remove objects that are off-screen (when boundaries are disabled)
  private removeOutOfBoundsObjects(): void {
    const margin = 200; // Extra margin before removal
    const minX = -margin;
    const maxX = this.renderer.width + margin;
    const minY = -margin;
    const maxY = this.renderer.height + margin;
    
    const toRemove: string[] = [];
    
    this.objects.forEach((obj, id) => {
      const pos = obj.body.position;
      if (pos.x < minX || pos.x > maxX || pos.y < minY || pos.y > maxY) {
        toRemove.push(id);
      }
    });
    
    for (const id of toRemove) {
      console.log(`🗑️ Removing out-of-bounds object: ${id}`);
      this.removeObject(id);
    }
  }
  
  // Magnetic attraction - balls gently move toward nearby hands
  private applyMagneticAttraction(): void {
    const attractionRange = 250; // Pixels - range of magnetic effect
    const attractionStrength = 0.00015; // Force multiplier
    
    this.lastHandPositions.forEach((handPos) => {
      this.objects.forEach((obj) => {
        // Skip grabbed objects
        if (obj.body.isStatic) return;
        
        const dx = handPos.x - obj.body.position.x;
        const dy = handPos.y - obj.body.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < attractionRange && distance > 30) {
          // Inverse square law with falloff
          const falloff = 1 - (distance / attractionRange);
          const force = attractionStrength * falloff * falloff;
          
          Body.applyForce(obj.body, obj.body.position, {
            x: dx * force,
            y: dy * force
          });
        }
      });
    });
  }
  
  // Call this from hand tracking to update hand positions for magnetic attraction
  updateHandPositionsForMagnet(hands: HandData[]): void {
    this.lastHandPositions.clear();
    for (const hand of hands) {
      this.lastHandPositions.set(hand.handedness, {
        x: hand.palmCenter.x,
        y: hand.palmCenter.y
      });
    }
  }
  
  // Recall all balls toward center of playing field (telekinesis)
  recallBalls(): void {
    let centerX: number, centerY: number;
    
    if (this.playingFieldBounds) {
      // Center of playing field
      centerX = this.playingFieldBounds.x + this.playingFieldBounds.width / 2;
      centerY = this.playingFieldBounds.y + this.playingFieldBounds.height / 3;
    } else {
      // Center of screen
      centerX = this.renderer.width / 2;
      centerY = this.renderer.height / 3;
    }
    
    this.objects.forEach((obj) => {
      if (obj.body.isStatic) return;
      
      const dx = centerX - obj.body.position.x;
      const dy = centerY - obj.body.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 50) {
        // Apply strong impulse toward center
        const force = 0.002;
        Body.applyForce(obj.body, obj.body.position, {
          x: dx * force,
          y: dy * force
        });
      }
    });
  }
  
  // Toggle magnetic attraction
  setMagneticAttraction(enabled: boolean): void {
    this.config.magneticAttraction = enabled;
    console.log(`Magnetic attraction: ${enabled ? 'ON' : 'OFF'}`);
  }
  
  isMagneticAttractionEnabled(): boolean {
    return this.config.magneticAttraction;
  }

  // Keep objects within boundaries (uses playing field or comfort zone)
  private enforceObjectBounds(): void {
    // Use playing field bounds if available, otherwise screen bounds
    let minX: number, minY: number, maxX: number, maxY: number;
    
    if (this.playingFieldBounds) {
      minX = this.playingFieldBounds.x;
      minY = this.playingFieldBounds.y;
      maxX = this.playingFieldBounds.right;
      maxY = this.playingFieldBounds.bottom;
    } else {
      minX = 0;
      minY = 0;
      maxX = this.renderer.width;
      maxY = this.config.comfortZoneEnabled 
        ? this.renderer.height * this.comfortZoneHeight 
        : this.renderer.height;
    }
    
    this.objects.forEach((obj) => {
      const body = obj.body;
      const pos = body.position;
      const vel = body.velocity;
      
      // Get object radius/size
      let radius = 30;
      if (obj.type === 'circle' && body.circleRadius) {
        radius = body.circleRadius;
      } else if (obj.type === 'rectangle') {
        // Approximate with bounding box
        const bounds = body.bounds;
        radius = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) / 2;
      }
      
      const margin = radius + BOUNDARY_MARGIN;
      let needsUpdate = false;
      let newX = pos.x;
      let newY = pos.y;
      let newVelX = vel.x;
      let newVelY = vel.y;
      
      // Check left boundary
      if (pos.x < minX + margin) {
        newX = minX + margin;
        newVelX = Math.abs(vel.x) * 0.5; // Bounce back
        needsUpdate = true;
      }
      // Check right boundary
      else if (pos.x > maxX - margin) {
        newX = maxX - margin;
        newVelX = -Math.abs(vel.x) * 0.5;
        needsUpdate = true;
      }
      
      // Check top boundary
      if (pos.y < minY + margin) {
        newY = minY + margin;
        newVelY = Math.abs(vel.y) * 0.5;
        needsUpdate = true;
      }
      // Check bottom boundary
      else if (pos.y > maxY - margin) {
        newY = maxY - margin;
        newVelY = -Math.abs(vel.y) * 0.6; // Slightly bouncier floor
        needsUpdate = true;
      }
      
      // Clamp velocity
      const speed = Math.sqrt(newVelX * newVelX + newVelY * newVelY);
      if (speed > MAX_VELOCITY) {
        const scale = MAX_VELOCITY / speed;
        newVelX *= scale;
        newVelY *= scale;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        Body.setPosition(body, { x: newX, y: newY });
        Body.setVelocity(body, { x: newVelX, y: newVelY });
      }
    });
  }

  // Rendering
  render(): void {
    this.renderer.clearPhysics();
    
    // Draw boundaries if enabled
    if (this.config.boundariesEnabled) {
      this.renderer.drawBoundaries();
    }

    // Draw physics objects
    this.objects.forEach((obj) => {
      const pos = obj.body.position;
      
      if (obj.type === 'circle') {
        const radius = (obj.body as any).circleRadius || 30;
        this.renderer.drawCircle(pos.x, pos.y, radius, obj.color, obj.strokeColor);
      } else if (obj.type === 'rectangle') {
        // Use stored original dimensions, not bounds (which change with rotation)
        const width = obj.shapeInfo?.width || 60;
        const height = obj.shapeInfo?.height || 60;
        this.renderer.drawRect(pos.x, pos.y, width, height, obj.body.angle, obj.color);
      } else {
        // Polygons, triangles, hexagons, stars, custom shapes - draw using vertices
        this.renderer.drawPolygon(obj.body.vertices, obj.color, obj.strokeColor, obj.body.angle);
      }
    });
  }

  // Utility
  private darkenColor(color: string): string {
    // Simple color darkening for stroke
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgb(${Math.floor(r * 0.7)}, ${Math.floor(g * 0.7)}, ${Math.floor(b * 0.7)})`;
    }
    return color;
  }

  getStats(): {
    objectCount: number;
    gravity: { x: number; y: number };
    boundariesEnabled: boolean;
    handsCollidable: boolean;
  } {
    return {
      objectCount: this.objects.size,
      gravity: this.config.gravity,
      boundariesEnabled: this.config.boundariesEnabled,
      handsCollidable: this.config.handsCollidable
    };
  }

  destroy(): void {
    World.clear(this.world, false);
    Engine.clear(this.engine);
  }
}
