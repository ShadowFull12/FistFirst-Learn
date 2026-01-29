import OpenAI from 'openai';
import { PhysicsEngine } from './physics';
import { UIManager } from './uiManager';
import { HandData } from './handTracking';

// OpenRouter configuration for GLM 4.5 AIR (free)
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = 'z-ai/glm-4.5-air:free';

// Color palette for objects
const COLORS: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  white: '#ffffff',
  black: '#1a1a1a',
  gray: '#6b7280',
  cyan: '#06b6d4',
  teal: '#14b8a6',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  emerald: '#10b981',
  lime: '#84cc16',
  indigo: '#6366f1',
  rose: '#f43f5e'
};

// Shape types available
const SHAPES = ['ball', 'circle', 'rectangle', 'square', 'box', 'triangle', 'hexagon', 'pentagon', 'star', 'polygon'];

/**
 * Conversational AI Agent for FistFirst Learn
 * 
 * Features:
 * - Full conversational abilities
 * - Scene awareness (knows what objects are on screen)
 * - Finger pointing integration (create/modify where user points)
 * - Code-like capability to create anything
 * - Natural language understanding
 */
export class AIAssistant {
  private openai: OpenAI | null = null;
  private physics: PhysicsEngine;
  private uiManager: UIManager;
  private conversationHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  private onMessage: ((message: string, isUser: boolean) => void) | null = null;
  private isProcessing: boolean = false;
  
  // Scene context
  private lastHands: HandData[] = [];
  private lastPointingPosition: { x: number; y: number } | null = null;
  private selectedObjectId: string | null = null;

  constructor(physics: PhysicsEngine, uiManager: UIManager) {
    this.physics = physics;
    this.uiManager = uiManager;
  }

  initialize(apiKey: string): boolean {
    if (!apiKey || apiKey.trim() === '') {
      console.log('No API key provided - AI features will be limited');
      return false;
    }

    try {
      this.openai = new OpenAI({
        apiKey: apiKey,
        baseURL: OPENROUTER_BASE_URL,
        dangerouslyAllowBrowser: true,
        defaultHeaders: {
          'HTTP-Referer': window.location.origin,
          'X-Title': 'FistFirst Learn'
        }
      });
      console.log('AI Assistant initialized with OpenRouter (GLM 4.5 AIR)');
      return true;
    } catch (error) {
      console.error('Failed to initialize AI:', error);
      return false;
    }
  }

  setOnMessage(callback: (message: string, isUser: boolean) => void): void {
    this.onMessage = callback;
  }

  // Update hand data for pointing awareness
  updateHands(hands: HandData[]): void {
    this.lastHands = hands;
    
    // Check if user is pointing
    for (const hand of hands) {
      if (hand.isPointing && hand.pointingAt) {
        this.lastPointingPosition = hand.pointingAt;
        
        // Check if pointing at an object
        const obj = this.physics.getObjectAtPosition(hand.pointingAt.x, hand.pointingAt.y, 60);
        if (obj) {
          this.selectedObjectId = obj.id;
        }
      }
    }
  }

  // Get current scene context for AI
  private getSceneContext(): string {
    const info = this.physics.getObjectsInfo();
    const bounds = this.physics.getPlayingFieldBounds();
    const stats = this.physics.getStats();
    
    let context = `CURRENT SCENE STATE:\n`;
    context += `- Total objects: ${info.total}\n`;
    
    if (info.total > 0) {
      context += `- Objects by type: ${JSON.stringify(info.byType)}\n`;
      context += `- Objects by color: ${JSON.stringify(info.byColor)}\n`;
      context += `- Object details: ${JSON.stringify(info.objects.slice(0, 10))}\n`;
    }
    
    context += `- Gravity: (${stats.gravity.x}, ${stats.gravity.y})\n`;
    context += `- Boundaries enabled: ${stats.boundariesEnabled}\n`;
    context += `- Hand collision: ${stats.handsCollidable}\n`;
    
    if (bounds) {
      context += `- Playing field: ${Math.round(bounds.width)}x${Math.round(bounds.height)} at (${Math.round(bounds.x)}, ${Math.round(bounds.y)})\n`;
    }
    
    // Pointing context
    if (this.lastPointingPosition) {
      context += `- User pointing at: (${Math.round(this.lastPointingPosition.x)}, ${Math.round(this.lastPointingPosition.y)})\n`;
    }
    if (this.selectedObjectId) {
      const obj = this.physics.getObjectById(this.selectedObjectId);
      if (obj) {
        context += `- Selected object: ${obj.id} (${obj.type}, ${this.getColorName(obj.color)})\n`;
      }
    }
    
    return context;
  }

  private getColorName(hex: string): string {
    for (const [name, value] of Object.entries(COLORS)) {
      if (value.toLowerCase() === hex.toLowerCase()) return name;
    }
    return hex;
  }

  private buildSystemPrompt(): string {
    return `You are an advanced AI physics developer assistant for FistFirst Learn, an AR physics sandbox. You can create, modify, and analyze physics simulations using hand gestures.

YOUR CAPABILITIES:
1. Create ANY shape: balls, rectangles, triangles, hexagons, stars, pentagons, custom polygons
2. Query the scene: count objects, identify colors, check positions
3. Modify objects: change color, size, position, velocity, make static/dynamic
4. Control physics: gravity, bounciness, friction, boundaries
5. Create UI elements: sliders, counters at specific positions
6. Understand pointing gestures: user can point at objects or positions

RESPONSE FORMAT:
When executing actions, respond with JSON action blocks followed by a natural response:

\`\`\`action
{"actions": [
  {"fn": "functionName", "args": {...}},
  {"fn": "anotherFunction", "args": {...}}
]}
\`\`\`

Your natural response here.

AVAILABLE FUNCTIONS:
- createBall: {x?, y?, radius?, color?, bounciness?} - x,y are 0-100 percentages
- createRectangle: {x?, y?, width?, height?, color?}
- createTriangle: {x?, y?, size?, color?}
- createHexagon: {x?, y?, size?, color?}
- createPolygon: {x?, y?, sides?, size?, color?} - any regular polygon
- createStar: {x?, y?, points?, outerRadius?, innerRadius?, color?}
- createMultiple: {count, shape, color?, size?, pattern?} - pattern: "random", "grid", "circle", "line"
- setGravity: {x?, y?, strength?, direction?}
- setBounciness: {value} or {objectId, value}
- setColor: {objectId, color}
- setPosition: {objectId, x, y}
- setVelocity: {objectId, vx, vy}
- scaleObject: {objectId, scale}
- makeStatic: {objectId, isStatic}
- removeObject: {objectId}
- clearAll: {}
- enableBoundaries: {enable}
- enableHandCollision: {enable}
- enableMagnetic: {enable}
- recallBalls: {}
- createSlider: {x?, y?, label, controls}
- createCounter: {x?, y?, label, tracks}
- queryScene: {} - returns scene info (use when asked about objects)
- getObjectAt: {x, y} - get object at position (for pointing)
- createAtPointing: {shape, color?, size?} - create where user is pointing

CONTEXT AWARENESS:
- When user says "here", "there", "where I'm pointing" - use the pointing position
- When user says "that", "this object", "the selected one" - use selectedObjectId
- When asked "how many" or "count" - query the scene first
- For "rainbow" - use multiple colors
- For positions: percentages (0-100) or "center", "top", "bottom", "left", "right", "random"

EXAMPLES:
User: "Create 5 red triangles"
\`\`\`action
{"actions": [{"fn": "createMultiple", "args": {"count": 5, "shape": "triangle", "color": "red"}}]}
\`\`\`
Created 5 red triangles!

User: "How many balls are on screen?"
\`\`\`action
{"actions": [{"fn": "queryScene", "args": {}}]}
\`\`\`
[After getting scene info] There are 3 balls - 2 blue and 1 red.

User: "Put a slider here" (while pointing)
\`\`\`action
{"actions": [{"fn": "createSlider", "args": {"x": "pointing", "y": "pointing", "label": "Gravity", "controls": "gravity"}}]}
\`\`\`
Added a gravity slider where you pointed!

Be helpful, creative, and conversational. Keep responses brief but informative.`;
  }

  async processCommand(userMessage: string): Promise<string> {
    if (this.isProcessing) {
      return 'Please wait, still processing...';
    }

    this.isProcessing = true;
    this.onMessage?.(userMessage, true);

    try {
      // Get current scene context
      const sceneContext = this.getSceneContext();
      
      // If no OpenAI, use enhanced fallback
      if (!this.openai) {
        const response = this.enhancedFallbackParser(userMessage);
        this.onMessage?.(response, false);
        return response;
      }

      // Build messages with scene context
      const systemPrompt = this.buildSystemPrompt();
      const contextMessage = `${sceneContext}\n\nUser message: ${userMessage}`;
      
      this.conversationHistory.push({ role: 'user', content: contextMessage });

      const response = await this.openai.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.conversationHistory.slice(-12)
        ],
        max_tokens: 800,
        temperature: 0.7
      });

      const message = response.choices[0].message;
      let responseText = message.content || '';
      
      // Parse and execute action blocks
      const actionMatch = responseText.match(/```action\s*([\s\S]*?)```/);
      
      if (actionMatch) {
        try {
          const actionJson = JSON.parse(actionMatch[1].trim());
          const actions = actionJson.actions || [actionJson];
          
          for (const action of actions) {
            const result = this.executeAction(action.fn || action.function, action.args || action.params || {});
            console.log(`AI executed: ${action.fn}`, result);
            
            // If query, inject result into response
            if (action.fn === 'queryScene' || action.fn === 'getObjectAt') {
              responseText = responseText.replace(
                /```action[\s\S]*?```\s*/,
                ''
              );
              // Let AI know the result for follow-up
              if (result.data) {
                responseText = this.enhanceResponseWithData(userMessage, result.data, responseText);
              }
            }
          }
          
          // Clean action block from response
          responseText = responseText.replace(/```action[\s\S]*?```\s*/g, '').trim();
          
          if (!responseText) {
            responseText = 'Done!';
          }
        } catch (parseError) {
          console.error('Failed to parse action:', parseError);
          // Try fallback
          const fallback = this.enhancedFallbackParser(userMessage);
          if (!fallback.includes('not sure')) {
            responseText = fallback;
          }
        }
      } else {
        // No action block - maybe it's a question or conversation
        // Try fallback for action-like messages
        if (this.looksLikeAction(userMessage)) {
          const fallback = this.enhancedFallbackParser(userMessage);
          if (!fallback.includes('not sure')) {
            responseText = fallback;
          }
        }
      }

      this.conversationHistory.push({ role: 'assistant', content: responseText });
      this.onMessage?.(responseText, false);
      
      return responseText;
    } catch (error) {
      console.error('AI processing error:', error);
      const fallbackResponse = this.enhancedFallbackParser(userMessage);
      this.onMessage?.(fallbackResponse, false);
      return fallbackResponse;
    } finally {
      this.isProcessing = false;
    }
  }

  private looksLikeAction(text: string): boolean {
    const actionWords = ['create', 'make', 'add', 'put', 'spawn', 'generate', 'set', 'change', 
                         'remove', 'delete', 'clear', 'enable', 'disable', 'turn', 'gravity',
                         'bounce', 'ball', 'triangle', 'square', 'hexagon', 'star', 'polygon'];
    const lower = text.toLowerCase();
    return actionWords.some(word => lower.includes(word));
  }

  private enhanceResponseWithData(question: string, data: any, currentResponse: string): string {
    const lower = question.toLowerCase();
    
    if (lower.includes('how many') || lower.includes('count')) {
      if (data.total !== undefined) {
        const colorMentioned = this.extractColor(lower);
        const shapeMentioned = this.extractShape(lower);
        
        if (colorMentioned && data.byColor?.[colorMentioned]) {
          return `There ${data.byColor[colorMentioned] === 1 ? 'is' : 'are'} ${data.byColor[colorMentioned]} ${colorMentioned} object${data.byColor[colorMentioned] === 1 ? '' : 's'} on screen.`;
        }
        if (shapeMentioned && data.byType?.[shapeMentioned]) {
          return `There ${data.byType[shapeMentioned] === 1 ? 'is' : 'are'} ${data.byType[shapeMentioned]} ${shapeMentioned}${data.byType[shapeMentioned] === 1 ? '' : 's'} on screen.`;
        }
        return `There ${data.total === 1 ? 'is' : 'are'} ${data.total} object${data.total === 1 ? '' : 's'} on screen.`;
      }
    }
    
    return currentResponse || 'Let me check that for you.';
  }

  private executeAction(name: string, args: any): { success: boolean; message: string; data?: any } {
    const renderer = (this.physics as any).renderer;
    const width = renderer?.width || window.innerWidth;
    const height = renderer?.height || window.innerHeight;
    
    // Handle position arguments
    const getX = (val: any): number => {
      if (val === 'pointing' && this.lastPointingPosition) return this.lastPointingPosition.x;
      if (val === 'center') return width / 2;
      if (val === 'left') return width * 0.2;
      if (val === 'right') return width * 0.8;
      if (val === 'random') return Math.random() * width * 0.6 + width * 0.2;
      if (typeof val === 'number') return (val / 100) * width;
      return width / 2;
    };
    
    const getY = (val: any): number => {
      if (val === 'pointing' && this.lastPointingPosition) return this.lastPointingPosition.y;
      if (val === 'center') return height / 2;
      if (val === 'top') return height * 0.2;
      if (val === 'bottom') return height * 0.8;
      if (val === 'random') return Math.random() * height * 0.5 + height * 0.2;
      if (typeof val === 'number') return (val / 100) * height;
      return height / 3;
    };

    const getColor = (colorName: string | undefined): string => {
      if (!colorName) return COLORS.blue;
      if (colorName === 'random') {
        const keys = Object.keys(COLORS);
        return COLORS[keys[Math.floor(Math.random() * keys.length)]];
      }
      return COLORS[colorName.toLowerCase()] || colorName;
    };

    try {
      switch (name) {
        case 'createBall': {
          const x = getX(args.x ?? 'random');
          const y = getY(args.y ?? 'random');
          const radius = args.radius ?? 30;
          const color = getColor(args.color);
          this.physics.createBall(x, y, radius, color, { restitution: args.bounciness ?? 0.8 });
          return { success: true, message: `Created a ${args.color || 'blue'} ball` };
        }

        case 'createRectangle': {
          const x = getX(args.x ?? 'random');
          const y = getY(args.y ?? 'random');
          this.physics.createRectangle(x, y, args.width ?? 60, args.height ?? 60, getColor(args.color));
          return { success: true, message: 'Created a rectangle' };
        }

        case 'createTriangle': {
          const x = getX(args.x ?? 'random');
          const y = getY(args.y ?? 'random');
          this.physics.createPolygon(x, y, 3, args.size ?? 40, getColor(args.color));
          return { success: true, message: 'Created a triangle' };
        }

        case 'createHexagon': {
          const x = getX(args.x ?? 'random');
          const y = getY(args.y ?? 'random');
          this.physics.createPolygon(x, y, 6, args.size ?? 40, getColor(args.color));
          return { success: true, message: 'Created a hexagon' };
        }

        case 'createPolygon': {
          const x = getX(args.x ?? 'random');
          const y = getY(args.y ?? 'random');
          const sides = args.sides ?? 5;
          this.physics.createPolygon(x, y, sides, args.size ?? 40, getColor(args.color));
          return { success: true, message: `Created a ${sides}-sided polygon` };
        }

        case 'createStar': {
          const x = getX(args.x ?? 'random');
          const y = getY(args.y ?? 'random');
          this.physics.createStar(x, y, args.points ?? 5, args.outerRadius ?? 50, args.innerRadius ?? 25, getColor(args.color));
          return { success: true, message: `Created a ${args.points ?? 5}-point star` };
        }

        case 'createMultiple': {
          const count = Math.min(args.count ?? 5, 30);
          const shape = args.shape?.toLowerCase() || 'ball';
          const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
          
          for (let i = 0; i < count; i++) {
            let x: number, y: number;
            
            // Handle patterns
            if (args.pattern === 'grid') {
              const cols = Math.ceil(Math.sqrt(count));
              x = (((i % cols) + 0.5) / cols) * width * 0.6 + width * 0.2;
              y = ((Math.floor(i / cols) + 0.5) / Math.ceil(count / cols)) * height * 0.4 + height * 0.2;
            } else if (args.pattern === 'circle') {
              const angle = (i / count) * Math.PI * 2;
              const radius = Math.min(width, height) * 0.25;
              x = width / 2 + Math.cos(angle) * radius;
              y = height / 2 + Math.sin(angle) * radius;
            } else if (args.pattern === 'line') {
              x = ((i + 0.5) / count) * width * 0.8 + width * 0.1;
              y = height / 3;
            } else {
              // Random
              x = Math.random() * width * 0.6 + width * 0.2;
              y = Math.random() * height * 0.4 + height * 0.2;
            }
            
            const color = args.color === 'rainbow' || args.color === 'random' 
              ? colors[i % colors.length]
              : (args.color || 'random');
            const colorHex = getColor(color === 'random' ? colors[Math.floor(Math.random() * colors.length)] : color);
            const size = args.size === 'random' ? Math.random() * 30 + 20 : (args.size ?? 30);
            
            if (shape === 'ball' || shape === 'circle') {
              this.physics.createBall(x, y, size, colorHex);
            } else if (shape === 'rectangle' || shape === 'square' || shape === 'box') {
              this.physics.createRectangle(x, y, size * 1.5, size * 1.5, colorHex);
            } else if (shape === 'triangle') {
              this.physics.createPolygon(x, y, 3, size, colorHex);
            } else if (shape === 'hexagon') {
              this.physics.createPolygon(x, y, 6, size, colorHex);
            } else if (shape === 'pentagon') {
              this.physics.createPolygon(x, y, 5, size, colorHex);
            } else if (shape === 'star') {
              this.physics.createStar(x, y, 5, size, size / 2, colorHex);
            } else {
              this.physics.createBall(x, y, size, colorHex);
            }
          }
          return { success: true, message: `Created ${count} ${args.color || ''} ${shape}s` };
        }

        case 'createAtPointing': {
          if (!this.lastPointingPosition) {
            return { success: false, message: 'Point at where you want to create the object' };
          }
          const shape = args.shape?.toLowerCase() || 'ball';
          const color = getColor(args.color);
          const size = args.size ?? 35;
          const x = this.lastPointingPosition.x;
          const y = this.lastPointingPosition.y;
          
          if (shape === 'ball' || shape === 'circle') {
            this.physics.createBall(x, y, size, color);
          } else if (shape === 'triangle') {
            this.physics.createPolygon(x, y, 3, size, color);
          } else if (shape === 'hexagon') {
            this.physics.createPolygon(x, y, 6, size, color);
          } else if (shape === 'star') {
            this.physics.createStar(x, y, 5, size, size / 2, color);
          } else {
            this.physics.createRectangle(x, y, size * 1.5, size * 1.5, color);
          }
          return { success: true, message: `Created ${shape} where you pointed!` };
        }

        case 'setGravity': {
          let gx = 0, gy = 0;
          if (args.direction) {
            const strength = args.strength ?? 1;
            switch (args.direction.toLowerCase()) {
              case 'down': gy = strength; break;
              case 'up': gy = -strength; break;
              case 'left': gx = -strength; break;
              case 'right': gx = strength; break;
            }
          } else {
            gx = args.x ?? 0;
            gy = args.y ?? (args.strength ?? 0.5);
          }
          this.physics.setGravity(gx, gy);
          return { success: true, message: `Gravity set to (${gx}, ${gy})` };
        }

        case 'setBounciness': {
          if (args.objectId) {
            this.physics.setObjectBounciness(args.objectId, args.value);
          } else {
            this.physics.setAllBounciness(args.value);
          }
          return { success: true, message: `Bounciness set to ${args.value}` };
        }

        case 'setColor': {
          const objId = args.objectId || this.selectedObjectId;
          if (objId) {
            this.physics.setObjectColor(objId, getColor(args.color));
            return { success: true, message: `Changed color to ${args.color}` };
          }
          return { success: false, message: 'No object selected' };
        }

        case 'setPosition': {
          const objId = args.objectId || this.selectedObjectId;
          if (objId) {
            this.physics.setObjectPosition(objId, getX(args.x), getY(args.y));
            return { success: true, message: 'Moved object' };
          }
          return { success: false, message: 'No object selected' };
        }

        case 'setVelocity': {
          const objId = args.objectId || this.selectedObjectId;
          if (objId) {
            this.physics.setObjectVelocity(objId, args.vx ?? 0, args.vy ?? 0);
            return { success: true, message: 'Set velocity' };
          }
          return { success: false, message: 'No object selected' };
        }

        case 'scaleObject': {
          const objId = args.objectId || this.selectedObjectId;
          if (objId) {
            this.physics.scaleObject(objId, args.scale ?? 1.5);
            return { success: true, message: 'Scaled object' };
          }
          return { success: false, message: 'No object selected' };
        }

        case 'makeStatic': {
          const objId = args.objectId || this.selectedObjectId;
          if (objId) {
            this.physics.setObjectStatic(objId, args.isStatic !== false);
            return { success: true, message: args.isStatic !== false ? 'Object is now static' : 'Object can move now' };
          }
          return { success: false, message: 'No object selected' };
        }

        case 'removeObject': {
          const objId = args.objectId || this.selectedObjectId;
          if (objId) {
            this.physics.removeObject(objId);
            this.selectedObjectId = null;
            return { success: true, message: 'Removed object' };
          }
          return { success: false, message: 'No object selected' };
        }

        case 'clearAll': {
          this.physics.clearAllObjects();
          return { success: true, message: 'Cleared all objects' };
        }

        case 'enableBoundaries': {
          if (args.enable !== false) {
            this.physics.enableBoundaries();
          } else {
            this.physics.disableBoundaries();
          }
          return { success: true, message: args.enable !== false ? 'Boundaries enabled' : 'Boundaries disabled' };
        }

        case 'enableHandCollision': {
          if (args.enable !== false) {
            this.physics.enableHandCollision();
          } else {
            this.physics.disableHandCollision();
          }
          return { success: true, message: args.enable !== false ? 'Hand collision enabled' : 'Hand collision disabled' };
        }

        case 'enableMagnetic': {
          this.physics.setMagneticAttraction(args.enable !== false);
          return { success: true, message: args.enable !== false ? 'Magnetic attraction on!' : 'Magnetic attraction off' };
        }

        case 'recallBalls': {
          this.physics.recallBalls();
          return { success: true, message: 'Recalling objects to center' };
        }

        case 'createSlider': {
          const x = args.x === 'pointing' && this.lastPointingPosition 
            ? this.lastPointingPosition.x 
            : getX(args.x ?? 10);
          const y = args.y === 'pointing' && this.lastPointingPosition
            ? this.lastPointingPosition.y
            : getY(args.y ?? 10);
          this.uiManager.createSlider(x, y, args.label || 'Control', args.controls || 'gravity', args.min ?? 0, args.max ?? 2);
          return { success: true, message: `Created ${args.label || 'control'} slider` };
        }

        case 'createCounter': {
          const x = getX(args.x ?? 80);
          const y = getY(args.y ?? 5);
          this.uiManager.createCounter(x, y, args.label || 'Counter', args.tracks || 'objectCount');
          return { success: true, message: `Created ${args.label || ''} counter` };
        }

        case 'queryScene': {
          return { success: true, message: 'Scene queried', data: this.physics.getObjectsInfo() };
        }

        case 'getObjectAt': {
          const x = args.x === 'pointing' && this.lastPointingPosition ? this.lastPointingPosition.x : getX(args.x);
          const y = args.y === 'pointing' && this.lastPointingPosition ? this.lastPointingPosition.y : getY(args.y);
          const obj = this.physics.getObjectAtPosition(x, y, 60);
          if (obj) {
            this.selectedObjectId = obj.id;
            return { success: true, message: `Found ${obj.type}`, data: obj };
          }
          return { success: false, message: 'No object at that position' };
        }

        default:
          return { success: false, message: `Unknown action: ${name}` };
      }
    } catch (error) {
      console.error(`Error executing ${name}:`, error);
      return { success: false, message: `Error: ${error}` };
    }
  }

  private enhancedFallbackParser(input: string): string {
    const lower = input.toLowerCase();

    // Scene queries
    if (lower.includes('how many') || lower.includes('count')) {
      const info = this.physics.getObjectsInfo();
      const colorMentioned = this.extractColor(lower);
      const shapeMentioned = this.extractShape(lower);
      
      if (colorMentioned && info.byColor[colorMentioned]) {
        return `There ${info.byColor[colorMentioned] === 1 ? 'is' : 'are'} ${info.byColor[colorMentioned]} ${colorMentioned} object${info.byColor[colorMentioned] === 1 ? '' : 's'}.`;
      }
      if (shapeMentioned) {
        const typeKey = shapeMentioned === 'ball' ? 'circle' : shapeMentioned;
        if (info.byType[typeKey]) {
          return `There ${info.byType[typeKey] === 1 ? 'is' : 'are'} ${info.byType[typeKey]} ${shapeMentioned}${info.byType[typeKey] === 1 ? '' : 's'}.`;
        }
      }
      return `There ${info.total === 1 ? 'is' : 'are'} ${info.total} object${info.total === 1 ? '' : 's'} in the scene.`;
    }

    // Create shapes
    const shapeMatch = this.extractShape(lower);
    const color = this.extractColor(lower);
    const count = this.extractNumber(lower);
    
    if (shapeMatch) {
      if (lower.includes('rainbow')) {
        this.executeAction('createMultiple', { count: count || 7, shape: shapeMatch, color: 'rainbow' });
        return `Created ${count || 7} rainbow ${shapeMatch}s!`;
      }
      if (count && count > 1) {
        this.executeAction('createMultiple', { count, shape: shapeMatch, color: color || 'random' });
        return `Created ${count} ${color || 'colorful'} ${shapeMatch}s!`;
      }
      
      const actionName = shapeMatch === 'ball' || shapeMatch === 'circle' ? 'createBall' :
                         shapeMatch === 'triangle' ? 'createTriangle' :
                         shapeMatch === 'hexagon' ? 'createHexagon' :
                         shapeMatch === 'star' ? 'createStar' :
                         shapeMatch === 'pentagon' ? 'createPolygon' :
                         'createRectangle';
      
      const args: any = { color: color || 'blue' };
      if (actionName === 'createPolygon') args.sides = 5;
      
      // Check for "here" or pointing
      if (lower.includes('here') || lower.includes('where') || lower.includes('pointing')) {
        this.executeAction('createAtPointing', { shape: shapeMatch, color });
        return this.lastPointingPosition 
          ? `Created a ${color || ''} ${shapeMatch} where you're pointing!`
          : `Point at where you want the ${shapeMatch}, then ask again!`;
      }
      
      this.executeAction(actionName, args);
      return `Created a ${color || 'blue'} ${shapeMatch}!`;
    }

    // Gravity
    if (lower.includes('gravity')) {
      if (lower.includes('off') || lower.includes('disable') || lower.includes('no') || lower.includes('zero')) {
        this.executeAction('setGravity', { strength: 0 });
        return 'Gravity disabled - objects float!';
      }
      const strength = this.extractNumber(lower) || 1;
      const direction = lower.includes('up') ? 'up' : 
                       lower.includes('left') ? 'left' :
                       lower.includes('right') ? 'right' : 'down';
      this.executeAction('setGravity', { strength, direction });
      return `Gravity set ${direction}!`;
    }

    // Bounciness
    if (lower.includes('bounc')) {
      const value = lower.includes('super') || lower.includes('very') ? 0.95 :
                   lower.includes('more') ? 0.85 : (this.extractNumber(lower) || 80) / 100;
      this.executeAction('setBounciness', { value });
      return `Bounciness set to ${Math.round(value * 100)}%!`;
    }

    // Clear/reset
    if (lower.includes('clear') || lower.includes('reset') || lower.includes('remove all')) {
      this.executeAction('clearAll', {});
      return 'All objects cleared!';
    }

    // Recall
    if (lower.includes('recall') || lower.includes('bring back') || lower.includes('come here')) {
      this.executeAction('recallBalls', {});
      return 'Recalling objects to center!';
    }

    // Magnetic
    if (lower.includes('magnet')) {
      const enable = !(lower.includes('off') || lower.includes('disable'));
      this.executeAction('enableMagnetic', { enable });
      return enable ? 'Magnetic attraction enabled!' : 'Magnetic attraction disabled.';
    }

    // Selected object modifications
    if (this.selectedObjectId) {
      if (lower.includes('make it') || lower.includes('change')) {
        if (color) {
          this.executeAction('setColor', { color });
          return `Changed the object to ${color}!`;
        }
        if (lower.includes('bigger') || lower.includes('larger')) {
          this.executeAction('scaleObject', { scale: 1.5 });
          return 'Made it bigger!';
        }
        if (lower.includes('smaller')) {
          this.executeAction('scaleObject', { scale: 0.7 });
          return 'Made it smaller!';
        }
        if (lower.includes('static') || lower.includes('freeze')) {
          this.executeAction('makeStatic', { isStatic: true });
          return 'Object is now static!';
        }
      }
      if (lower.includes('delete') || lower.includes('remove')) {
        this.executeAction('removeObject', {});
        return 'Removed the selected object.';
      }
    }

    // Help
    if (lower.includes('help') || lower.includes('what can')) {
      return `I can create shapes (balls, triangles, hexagons, stars), control physics, count objects, and modify things. Try: "Create 5 rainbow stars", "How many red balls?", "Add gravity", or point and say "Put a hexagon here"!`;
    }

    return `I can create physics objects, count shapes, and modify the scene. Try "create a triangle", "how many balls?", or point and say "put a star here"!`;
  }

  private extractColor(text: string): string | null {
    const colorNames = Object.keys(COLORS);
    for (const color of colorNames) {
      if (text.includes(color)) return color;
    }
    return null;
  }

  private extractShape(text: string): string | null {
    for (const shape of SHAPES) {
      if (text.includes(shape)) return shape;
    }
    return null;
  }

  private extractNumber(text: string): number | null {
    // Handle word numbers
    const wordNumbers: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'dozen': 12, 'twenty': 20
    };
    
    for (const [word, num] of Object.entries(wordNumbers)) {
      if (text.includes(word)) return num;
    }
    
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

  isReady(): boolean {
    return this.openai !== null;
  }
}
