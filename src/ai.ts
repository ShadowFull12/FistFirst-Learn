import OpenAI from 'openai';
import { PhysicsEngine, PhysicsObject } from './physics';
import { UIManager } from './uiManager';
import { HandData } from './handTracking';

// OpenRouter configuration - using intelligent FREE models
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Primary model: DeepSeek R1 - excellent reasoning model
const OPENROUTER_MODELS = [
  'deepseek/deepseek-r1-0528:free',           // Primary - DeepSeek R1 reasoning model
  'meta-llama/llama-3.3-70b-instruct:free',   // Fallback - Llama 3.3 70B
  'google/gemma-3-27b-it:free',               // Fallback - Google's Gemma 3
  'z-ai/glm-4.5-air:free'                     // Fallback - GLM 4.5 Air
];

let currentModelIndex = 0;

// Color palette
const COLORS: Record<string, string> = {
  red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e',
  blue: '#3b82f6', purple: '#a855f7', pink: '#ec4899', white: '#ffffff',
  black: '#1a1a1a', gray: '#6b7280', cyan: '#06b6d4', teal: '#14b8a6',
  amber: '#f59e0b', violet: '#8b5cf6', emerald: '#10b981', lime: '#84cc16',
  indigo: '#6366f1', rose: '#f43f5e', gold: '#fbbf24', silver: '#9ca3af'
};

/**
 * Truly Intelligent AI Agent for FistFirst Learn
 * 
 * This AI uses full LLM capabilities:
 * - Natural conversation and reasoning
 * - Understanding context and nuance
 * - Answering questions intelligently
 * - Making smart decisions
 * - Teaching and explaining
 */
export class AIAssistant {
  private openai: OpenAI | null = null;
  private physics: PhysicsEngine;
  private uiManager: UIManager;
  private conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];
  private onMessage: ((message: string, isUser: boolean) => void) | null = null;
  private isProcessing: boolean = false;
  
  // Context tracking
  private lastPointingPosition: { x: number; y: number } | null = null;
  private selectedObjectId: string | null = null;
  private lastCreatedIds: string[] = [];
  private lastActionDescription: string = '';

  constructor(physics: PhysicsEngine, uiManager: UIManager) {
    this.physics = physics;
    this.uiManager = uiManager;
  }

  initialize(apiKey: string): boolean {
    if (!apiKey || apiKey.trim() === '') {
      console.log('No API key provided');
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
      console.log('✓ AI initialized with Llama 3.3 70B (free)');
      return true;
    } catch (error) {
      console.error('Failed to initialize AI:', error);
      return false;
    }
  }

  setOnMessage(callback: (message: string, isUser: boolean) => void): void {
    this.onMessage = callback;
  }

  updateHands(hands: HandData[]): void {
    for (const hand of hands) {
      if (hand.isPointing && hand.pointingAt) {
        this.lastPointingPosition = hand.pointingAt;
        const obj = this.physics.getObjectAtPosition(hand.pointingAt.x, hand.pointingAt.y, 60);
        if (obj) {
          this.selectedObjectId = obj.id;
        }
      }
    }
  }

  /**
   * Build a rich, natural scene description for the AI
   */
  private buildSceneDescription(): string {
    const info = this.physics.getObjectsInfo();
    const stats = this.physics.getStats();
    const bounds = this.physics.getPlayingFieldBounds();
    
    let scene = '📍 CURRENT SCENE:\n';
    
    if (info.total === 0) {
      scene += 'The scene is empty - no objects are present.\n';
    } else {
      scene += `There are ${info.total} object(s) in the scene:\n`;
      
      // Group objects naturally
      const typeGroups: Record<string, any[]> = {};
      for (const obj of info.objects) {
        if (!typeGroups[obj.type]) typeGroups[obj.type] = [];
        typeGroups[obj.type].push(obj);
      }
      
      for (const [type, objects] of Object.entries(typeGroups)) {
        if (objects.length === 1) {
          const obj = objects[0];
          const colorName = this.getColorName(obj.color);
          scene += `  • One ${colorName} ${type} [id: ${obj.id}]`;
          if (obj.isStatic) scene += ' (frozen/static)';
          scene += `\n`;
        } else {
          scene += `  • ${objects.length} ${type}s: `;
          const colorCounts: Record<string, number> = {};
          for (const obj of objects) {
            const color = this.getColorName(obj.color);
            colorCounts[color] = (colorCounts[color] || 0) + 1;
          }
          const parts = Object.entries(colorCounts).map(([c, n]) => n > 1 ? `${n} ${c}` : c);
          scene += parts.join(', ') + '\n';
        }
      }
      
      // Detailed list with IDs
      scene += '\nDetailed list:\n';
      for (const obj of info.objects) {
        const physInfo = this.physics.getObjectPhysicsInfo(obj.id);
        scene += `  [${obj.id}] ${this.getColorName(obj.color)} ${obj.type}`;
        if (physInfo) {
          scene += ` | mass: ${physInfo.mass.toFixed(2)}, bounce: ${physInfo.bounciness.toFixed(2)}`;
        }
        if (obj.isStatic) scene += ' | STATIC';
        scene += '\n';
      }
    }
    
    // Physics state
    scene += '\n⚙️ PHYSICS:\n';
    scene += `  Gravity: ${stats.gravity.y > 0 ? 'down' : stats.gravity.y < 0 ? 'up' : 'off'} (${stats.gravity.y.toFixed(2)})\n`;
    scene += `  Boundaries: ${stats.boundariesEnabled ? 'ON' : 'OFF'}\n`;
    
    if (bounds) {
      scene += `  Play area: ${Math.round(bounds.width)}×${Math.round(bounds.height)} pixels\n`;
    }
    
    // User interaction context
    if (this.selectedObjectId) {
      const obj = this.physics.getObjectById(this.selectedObjectId);
      if (obj) {
        scene += `\n👆 USER IS POINTING AT: [${obj.id}] (a ${this.getColorName(obj.color)} ${obj.type})\n`;
        scene += `   When user says "this", "it", "that" - they mean THIS object!\n`;
      }
    }
    
    if (this.lastCreatedIds.length > 0) {
      scene += `\n🆕 Recently created: ${this.lastCreatedIds.join(', ')}\n`;
    }
    
    if (this.lastActionDescription) {
      scene += `📝 Last action: ${this.lastActionDescription}\n`;
    }
    
    return scene;
  }

  /**
   * Build a comprehensive system prompt for truly intelligent responses
   */
  private buildSystemPrompt(): string {
    return `You are an intelligent AI assistant in FistFirst Learn, an AR physics sandbox where users interact with physics objects using their hands.

## YOUR PERSONALITY:
- Friendly, helpful, and enthusiastic about physics and learning
- Give clear, concise responses
- Explain physics concepts when relevant
- Be conversational - you're a smart assistant, not a command parser

## UNDERSTANDING USER INTENT:
Think carefully about what the user actually wants:
- Questions (what, how, why, which, is it) → Answer intelligently, don't create objects
- References to "this", "it", "that" → Refer to the pointed-at object or last created
- "Make X bigger/red/bouncy" → Modify existing object, not create new
- "Create/add/spawn X" → Actually create something new
- Comparisons ("heavier than", "faster") → Modify relative properties
- General conversation → Chat naturally

## HOW TO RESPOND:

For ACTIONS (create, modify, delete, physics changes), include a JSON command block:
\`\`\`cmd
{"action": "actionName", "params": {...}}
\`\`\`

For MULTIPLE ACTIONS:
\`\`\`cmd
[
  {"action": "action1", "params": {...}},
  {"action": "action2", "params": {...}}
]
\`\`\`

For CONVERSATION (questions, explanations, chat) - just respond naturally without any cmd block!

## AVAILABLE ACTIONS:

### Creation (use only when user wants NEW objects):
- createBall: {x?, y?, radius?, color?}
- createRectangle: {x?, y?, width?, height?, color?}
- createTriangle: {x?, y?, size?, color?}
- createHexagon: {x?, y?, size?, color?}
- createPolygon: {x?, y?, sides?, size?, color?}
- createStar: {x?, y?, points?, size?, color?}
- createMultiple: {count, shape, color?, size?}

### Modification (when referencing existing objects):
- scaleObject: {objectId, scale} - scale > 1 = bigger, < 1 = smaller
- setColor: {objectId, color}
- setPosition: {objectId, x, y}
- setVelocity: {objectId, vx, vy}
- makeStatic: {objectId, isStatic}
- removeObject: {objectId}

### Physics Properties:
- setMass: {objectId, mass} - heavier: 5-10, lighter: 0.1-0.5, normal: 1
- setDensity: {objectId, density} - 0.0001=foam, 0.001=normal, 0.01=heavy
- setFriction: {objectId, friction} - 0=ice, 1=rubber
- setBounciness: {objectId, bounciness} - 0=no bounce, 1=super bouncy
- setAirResistance: {objectId, airResistance}
- setSpin: {objectId, angularVelocity}
- setMaterial: {objectId, material} - "metal", "wood", "rubber", "foam", "ice", "stone"
- applyForce: {objectId, x, y}
- applyImpulse: {objectId, x, y}

### Batch Operations:
- removeAll: {type?, color?} - remove all matching objects
- removeByType: {type} - "circle", "rectangle", "triangle", "star", "hexagon"
- removeByColor: {color}
- scaleAll: {type?, color?, scale}
- setColorAll: {type?, color, newColor}
- setMassForAll: {type?, color?, mass}

### Global Physics:
- setGravity: {x?, y?, direction?, strength?} - direction: "up", "down", "left", "right", "off"
- setAllBounciness: {value}
- enableBoundaries: {enable}
- recallBalls: {}
- clearAll: {}

## EXAMPLES OF INTELLIGENT RESPONSES:

User: "What's the heaviest object here?"
(no cmd block - just answer the question based on scene data)
"Looking at the scene, the blue rectangle has the highest mass at 2.5, while the red ball is lightest at 0.3. The rectangle would push other objects around more in collisions!"

User: "Make this ball red"
"Done! Changed it to red. 🔴"
\`\`\`cmd
{"action": "setColor", "params": {"objectId": "ball_1", "color": "red"}}
\`\`\`

User: "What happens if I increase gravity?"
(explain physics, offer to demonstrate)
"With higher gravity, objects will fall faster and bounce lower. The acceleration affects all objects equally regardless of mass - that's why a feather and bowling ball fall at the same rate in a vacuum! Want me to crank up the gravity so you can see?"

User: "Create a bouncy ball"
"Here's a super bouncy ball for you! 🏀"
\`\`\`cmd
[
  {"action": "createBall", "params": {"color": "orange", "radius": 35}},
  {"action": "setMaterial", "params": {"objectId": "LAST", "material": "rubber"}}
]
\`\`\`

User: "Why is the triangle not moving?"
(analyze scene and explain)
"The triangle might be static (frozen in place) or resting on the ground. Looking at the scene... [check if it's static or just at rest]"

User: "How are you?"
(normal conversation)
"I'm doing great! Ready to help you play with physics. What would you like to create or explore today?"

## CRITICAL RULES:
1. ALWAYS think about context - don't blindly parse keywords
2. "this/that/it" = pointed object or last created, NEVER create new
3. Questions = answer them, don't create objects
4. Be conversational and helpful, not robotic
5. Explain your actions when helpful
6. Use the objectId from the scene when modifying existing objects
7. "LAST" as objectId means the most recently created object

Colors: red, orange, yellow, green, blue, purple, pink, white, black, gray, cyan, teal, amber, violet, emerald, lime, indigo, rose, gold, silver

Remember: You're a smart AI assistant, not a command parser. Think, reason, and respond naturally!`;
  }

  /**
   * Main command processing - uses full LLM intelligence
   */
  async processCommand(userMessage: string): Promise<string> {
    if (this.isProcessing) {
      return 'Please wait, I\'m still thinking...';
    }

    this.isProcessing = true;

    try {
      if (!this.openai) {
        const response = this.offlineFallback(userMessage);
        this.onMessage?.(response, false);
        return response;
      }

      // Build rich context
      const sceneDescription = this.buildSceneDescription();
      const systemPrompt = this.buildSystemPrompt();
      
      // Build conversation context
      const recentHistory = this.conversationHistory.slice(-10);
      
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: systemPrompt }
      ];
      
      // Add recent conversation history
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
      
      // Add current message with scene context
      const fullMessage = `${sceneDescription}\n\n---\nUser says: "${userMessage}"`;
      messages.push({ role: 'user', content: fullMessage });
      
      console.log('🧠 Sending to AI:', fullMessage.substring(0, 800) + '...');

      // Try models in order until one works
      let aiResponse = '';
      let lastError: any = null;
      
      for (let i = 0; i < OPENROUTER_MODELS.length; i++) {
        const modelToUse = OPENROUTER_MODELS[(currentModelIndex + i) % OPENROUTER_MODELS.length];
        console.log(`🔄 Trying model: ${modelToUse}`);
        
        try {
          const response = await this.openai.chat.completions.create({
            model: modelToUse,
            messages: messages,
            max_tokens: 1000,
            temperature: 0.7,
          });

          aiResponse = response.choices[0].message.content || '';
          
          if (aiResponse && aiResponse.length > 0) {
            console.log(`✅ Success with ${modelToUse}`);
            currentModelIndex = (currentModelIndex + i) % OPENROUTER_MODELS.length; // Remember working model
            break;
          }
        } catch (modelError: any) {
          console.warn(`❌ Model ${modelToUse} failed:`, modelError.message || modelError);
          lastError = modelError;
          // Continue to next model
        }
      }
      
      // If all models failed
      if (!aiResponse) {
        console.error('All models failed, using fallback');
        const fallback = this.offlineFallback(userMessage);
        this.onMessage?.(fallback, false);
        return fallback;
      }
      
      console.log('🤖 AI response:', aiResponse);
      
      // Extract any command blocks and execute them
      const cmdMatch = aiResponse.match(/```cmd\s*([\s\S]*?)```/);
      
      if (cmdMatch) {
        try {
          const cmdContent = cmdMatch[1].trim();
          const commands = cmdContent.startsWith('[') ? JSON.parse(cmdContent) : [JSON.parse(cmdContent)];
          
          let lastCreatedId: string | null = null;
          
          for (const cmd of commands) {
            // Replace "LAST" with actual last created ID
            if (cmd.params?.objectId === 'LAST' && lastCreatedId) {
              cmd.params.objectId = lastCreatedId;
            } else if (cmd.params?.objectId === 'LAST' && this.lastCreatedIds.length > 0) {
              cmd.params.objectId = this.lastCreatedIds[0];
            }
            
            const result = this.executeAction(cmd.action, cmd.params || {});
            console.log(`✅ Executed ${cmd.action}:`, result);
            
            if (result.data?.id) {
              lastCreatedId = result.data.id;
              this.lastCreatedIds.unshift(result.data.id);
              if (this.lastCreatedIds.length > 5) this.lastCreatedIds.pop();
            }
            
            this.lastActionDescription = `${cmd.action} on ${cmd.params?.objectId || 'new object'}`;
          }
        } catch (parseError) {
          console.error('Failed to parse/execute commands:', parseError);
        }
      }
      
      // Clean response - remove cmd blocks for display
      let displayResponse = aiResponse.replace(/```cmd[\s\S]*?```/g, '').trim();
      
      // If response is empty after removing commands, provide default
      if (!displayResponse) {
        displayResponse = 'Done! ✨';
      }
      
      // Update conversation history
      this.conversationHistory.push({ role: 'user', content: userMessage });
      this.conversationHistory.push({ role: 'assistant', content: displayResponse });
      
      // Keep history manageable
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-16);
      }
      
      this.onMessage?.(displayResponse, false);
      return displayResponse;
      
    } catch (error: any) {
      console.error('AI error:', error);
      
      // If it's a rate limit or API error, try fallback
      const fallback = this.offlineFallback(userMessage);
      this.onMessage?.(fallback, false);
      return fallback;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single action
   */
  private executeAction(actionName: string, params: any): { success: boolean; message: string; data?: any } {
    const renderer = (this.physics as any).renderer;
    const width = renderer?.width || window.innerWidth;
    const height = renderer?.height || window.innerHeight;
    
    const getPos = (val: any, isX: boolean): number => {
      if (val === 'pointing' && this.lastPointingPosition) {
        return isX ? this.lastPointingPosition.x : this.lastPointingPosition.y;
      }
      if (val === 'center') return isX ? width / 2 : height / 2;
      if (val === 'random' || val === undefined) {
        return isX 
          ? Math.random() * width * 0.6 + width * 0.2 
          : Math.random() * height * 0.4 + height * 0.15;
      }
      if (typeof val === 'number') {
        if (val <= 100) return (val / 100) * (isX ? width : height);
        return val;
      }
      return isX ? width / 2 : height / 3;
    };

    const getColor = (c: string | undefined): string => {
      if (!c || c === 'random') {
        const keys = Object.keys(COLORS);
        return COLORS[keys[Math.floor(Math.random() * keys.length)]];
      }
      return COLORS[c.toLowerCase()] || c;
    };
    
    const getObjectId = (param: string | undefined): string | null => {
      if (param && param !== 'LAST') return param;
      return this.selectedObjectId || this.lastCreatedIds[0] || null;
    };

    try {
      switch (actionName) {
        // === CREATION ===
        case 'createBall': {
          const obj = this.physics.createBall(
            getPos(params.x, true),
            getPos(params.y, false),
            params.radius ?? 30,
            getColor(params.color)
          );
          return { success: true, message: 'Created ball', data: { id: obj.id } };
        }

        case 'createRectangle': {
          const obj = this.physics.createRectangle(
            getPos(params.x, true),
            getPos(params.y, false),
            params.width ?? 60,
            params.height ?? 60,
            getColor(params.color)
          );
          return { success: true, message: 'Created rectangle', data: { id: obj.id } };
        }

        case 'createTriangle': {
          const obj = this.physics.createPolygon(
            getPos(params.x, true),
            getPos(params.y, false),
            3,
            params.size ?? 40,
            getColor(params.color)
          );
          return { success: true, message: 'Created triangle', data: { id: obj.id } };
        }

        case 'createHexagon': {
          const obj = this.physics.createPolygon(
            getPos(params.x, true),
            getPos(params.y, false),
            6,
            params.size ?? 40,
            getColor(params.color)
          );
          return { success: true, message: 'Created hexagon', data: { id: obj.id } };
        }

        case 'createPolygon': {
          const obj = this.physics.createPolygon(
            getPos(params.x, true),
            getPos(params.y, false),
            params.sides ?? 5,
            params.size ?? 40,
            getColor(params.color)
          );
          return { success: true, message: 'Created polygon', data: { id: obj.id } };
        }

        case 'createStar': {
          const size = params.size ?? 50;
          const obj = this.physics.createStar(
            getPos(params.x, true),
            getPos(params.y, false),
            params.points ?? 5,
            size,
            size / 2,
            getColor(params.color)
          );
          return { success: true, message: 'Created star', data: { id: obj.id } };
        }

        case 'createMultiple': {
          const count = Math.min(params.count ?? 5, 30);
          const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
          const createdIds: string[] = [];
          
          for (let i = 0; i < count; i++) {
            const x = Math.random() * width * 0.6 + width * 0.2;
            const y = Math.random() * height * 0.3 + height * 0.1;
            const color = params.color === 'rainbow' || !params.color
              ? colors[i % colors.length] 
              : params.color;
            const size = params.size ?? 30;
            
            let obj: PhysicsObject;
            const shape = (params.shape || 'ball').toLowerCase();
            
            if (shape === 'ball' || shape === 'circle') {
              obj = this.physics.createBall(x, y, size, getColor(color));
            } else if (shape === 'triangle') {
              obj = this.physics.createPolygon(x, y, 3, size, getColor(color));
            } else if (shape === 'hexagon') {
              obj = this.physics.createPolygon(x, y, 6, size, getColor(color));
            } else if (shape === 'star') {
              obj = this.physics.createStar(x, y, 5, size, size/2, getColor(color))!;
            } else if (shape === 'rectangle' || shape === 'square') {
              obj = this.physics.createRectangle(x, y, size * 1.5, size * 1.5, getColor(color));
            } else {
              obj = this.physics.createBall(x, y, size, getColor(color));
            }
            createdIds.push(obj.id);
          }
          
          this.lastCreatedIds = [...createdIds, ...this.lastCreatedIds].slice(0, 10);
          return { success: true, message: `Created ${count} ${params.shape || 'ball'}s`, data: { ids: createdIds } };
        }

        // === MODIFICATION ===
        case 'scaleObject': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.scaleObject(objId, params.scale ?? 1.5);
            return { success: true, message: `Scaled ${objId}` };
          }
          return { success: false, message: 'No object to scale' };
        }

        case 'setColor': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectColor(objId, getColor(params.color));
            return { success: true, message: `Changed color of ${objId}` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setPosition': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectPosition(objId, getPos(params.x, true), getPos(params.y, false));
            return { success: true, message: 'Moved object' };
          }
          return { success: false, message: 'No object to move' };
        }

        case 'setVelocity': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectVelocity(objId, params.vx ?? 0, params.vy ?? 0);
            return { success: true, message: 'Set velocity' };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'makeStatic': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectStatic(objId, params.isStatic !== false);
            return { success: true, message: params.isStatic !== false ? 'Made static' : 'Made dynamic' };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'removeObject': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.removeObject(objId);
            this.lastCreatedIds = this.lastCreatedIds.filter(id => id !== objId);
            if (this.selectedObjectId === objId) this.selectedObjectId = null;
            return { success: true, message: 'Removed object' };
          }
          return { success: false, message: 'No object to remove' };
        }

        // === PHYSICS PROPERTIES ===
        case 'setMass': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectMass(objId, params.mass ?? 1);
            return { success: true, message: `Set mass to ${params.mass}` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setDensity': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectDensity(objId, params.density ?? 0.001);
            return { success: true, message: 'Set density' };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setFriction': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectFriction(objId, params.friction ?? 0.1);
            return { success: true, message: 'Set friction' };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setBounciness': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectBounciness(objId, params.bounciness ?? params.value ?? 0.8);
            return { success: true, message: 'Set bounciness' };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setAirResistance': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectAirResistance(objId, params.airResistance ?? 0.01);
            return { success: true, message: 'Set air resistance' };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setSpin': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectSpin(objId, params.angularVelocity ?? 0.1);
            return { success: true, message: 'Set spin' };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setMaterial': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.setObjectMaterial(objId, params.material || 'rubber');
            return { success: true, message: `Applied ${params.material} material` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'applyForce': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.applyForceToObject(objId, { x: params.x ?? 0, y: params.y ?? 0 });
            return { success: true, message: 'Applied force' };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'applyImpulse': {
          const objId = getObjectId(params.objectId);
          if (objId) {
            this.physics.applyImpulseToObject(objId, { x: params.x ?? 0, y: params.y ?? 0 });
            return { success: true, message: 'Applied impulse' };
          }
          return { success: false, message: 'No object to modify' };
        }

        // === BATCH OPERATIONS ===
        case 'removeAll':
        case 'clearAll': {
          if (!params.type && !params.color) {
            this.physics.clearAllObjects();
            this.lastCreatedIds = [];
            this.selectedObjectId = null;
            return { success: true, message: 'Cleared all objects' };
          }
          const objects = this.physics.getObjects();
          let count = 0;
          for (const obj of objects) {
            if (params.type && obj.type !== params.type) continue;
            if (params.color && this.getColorName(obj.color).toLowerCase() !== params.color.toLowerCase()) continue;
            this.physics.removeObject(obj.id);
            count++;
          }
          return { success: true, message: `Removed ${count} objects` };
        }

        case 'removeByType': {
          const objects = this.physics.getObjects();
          let count = 0;
          const targetType = params.type?.toLowerCase();
          for (const obj of objects) {
            if (obj.type === targetType || 
                (targetType === 'ball' && obj.type === 'circle') ||
                (targetType === 'circle' && obj.type === 'circle')) {
              this.physics.removeObject(obj.id);
              count++;
            }
          }
          return { success: true, message: `Removed ${count} ${params.type}s` };
        }

        case 'removeByColor': {
          const objects = this.physics.getObjects();
          let count = 0;
          for (const obj of objects) {
            if (this.getColorName(obj.color).toLowerCase() === params.color?.toLowerCase()) {
              this.physics.removeObject(obj.id);
              count++;
            }
          }
          return { success: true, message: `Removed ${count} ${params.color} objects` };
        }

        case 'scaleAll': {
          const objects = this.physics.getObjects();
          let count = 0;
          for (const obj of objects) {
            if (params.type && obj.type !== params.type) continue;
            if (params.color && this.getColorName(obj.color).toLowerCase() !== params.color.toLowerCase()) continue;
            this.physics.scaleObject(obj.id, params.scale ?? 1.5);
            count++;
          }
          return { success: true, message: `Scaled ${count} objects` };
        }

        case 'setColorAll': {
          const objects = this.physics.getObjects();
          let count = 0;
          for (const obj of objects) {
            if (params.type && obj.type !== params.type) continue;
            if (params.color && this.getColorName(obj.color).toLowerCase() !== params.color.toLowerCase()) continue;
            this.physics.setObjectColor(obj.id, getColor(params.newColor));
            count++;
          }
          return { success: true, message: `Changed color of ${count} objects` };
        }

        case 'setMassForAll': {
          const count = this.physics.setMassForAll({
            type: params.type,
            color: params.color,
            mass: params.mass ?? 1
          });
          return { success: true, message: `Set mass for ${count} objects` };
        }

        // === GLOBAL PHYSICS ===
        case 'setGravity': {
          let gx = params.x ?? 0;
          let gy = params.y ?? 1;
          
          if (params.direction) {
            const s = params.strength ?? 1;
            switch (params.direction.toLowerCase()) {
              case 'down': gy = s; gx = 0; break;
              case 'up': gy = -s; gx = 0; break;
              case 'left': gx = -s; gy = 0; break;
              case 'right': gx = s; gy = 0; break;
              case 'off': case 'none': case 'zero': gx = 0; gy = 0; break;
            }
          } else if (params.strength !== undefined) {
            gy = params.strength;
          }
          
          this.physics.setGravity(gx, gy);
          return { success: true, message: `Gravity set to (${gx}, ${gy})` };
        }

        case 'setAllBounciness': {
          this.physics.setAllBounciness(params.value ?? 0.8);
          return { success: true, message: `Set all bounciness to ${params.value}` };
        }

        case 'enableBoundaries': {
          if (params.enable !== false) {
            this.physics.enableBoundaries();
          } else {
            this.physics.disableBoundaries();
          }
          return { success: true, message: params.enable !== false ? 'Boundaries ON' : 'Boundaries OFF' };
        }

        case 'recallBalls': {
          this.physics.recallBalls();
          return { success: true, message: 'Recalling objects to center' };
        }

        default:
          console.warn('Unknown action:', actionName);
          return { success: false, message: `Unknown action: ${actionName}` };
      }
    } catch (error) {
      console.error(`Error in ${actionName}:`, error);
      return { success: false, message: `Error: ${error}` };
    }
  }

  private getColorName(hex: string): string {
    for (const [name, value] of Object.entries(COLORS)) {
      if (value.toLowerCase() === hex.toLowerCase()) return name;
    }
    return hex;
  }

  /**
   * Offline fallback when API is unavailable
   */
  private offlineFallback(input: string): string {
    const lower = input.toLowerCase();
    const info = this.physics.getObjectsInfo();
    
    // Basic pattern matching as last resort
    if (lower.includes('hello') || lower.includes('hi ') || lower === 'hi') {
      return 'Hello! I\'m your physics playground assistant. Try asking me to create shapes, change physics, or explain concepts!';
    }
    
    if (lower.includes('how are you')) {
      return 'I\'m great! Ready to help you explore physics. What would you like to create?';
    }
    
    // Gravity commands
    if (lower.includes('gravity')) {
      if (lower.includes('disable') || lower.includes('off') || lower.includes('zero') || lower.includes('none') || lower.includes('no gravity')) {
        this.physics.setGravity(0, 0);
        return 'Gravity disabled! Objects will now float. 🚀';
      }
      if (lower.includes('enable') || lower.includes('on') || lower.includes('normal') || lower.includes('reset')) {
        this.physics.setGravity(0, 1);
        return 'Gravity enabled! Back to normal. ⬇️';
      }
      if (lower.includes('reverse') || lower.includes('up')) {
        this.physics.setGravity(0, -1);
        return 'Gravity reversed! Objects will fall up. ⬆️';
      }
      if (lower.includes('strong') || lower.includes('high') || lower.includes('heavy') || lower.includes('increase')) {
        this.physics.setGravity(0, 3);
        return 'Heavy gravity! Objects fall faster now. 💪';
      }
      if (lower.includes('low') || lower.includes('light') || lower.includes('weak') || lower.includes('moon')) {
        this.physics.setGravity(0, 0.3);
        return 'Low gravity like the moon! 🌙';
      }
      if (lower.includes('left')) {
        this.physics.setGravity(-1, 0);
        return 'Gravity now pulls left! ⬅️';
      }
      if (lower.includes('right')) {
        this.physics.setGravity(1, 0);
        return 'Gravity now pulls right! ➡️';
      }
      // Default: disable if just "gravity" mentioned with disable intent
      this.physics.setGravity(0, 0);
      return 'Gravity disabled! 🚀';
    }
    
    // Bouncy commands
    if (lower.includes('bouncy') || lower.includes('bounce') || lower.includes('bounciness')) {
      if (lower.includes('super') || lower.includes('max') || lower.includes('very')) {
        this.physics.setAllBounciness(1.0);
        return 'Super bouncy mode! 🏀';
      }
      if (lower.includes('no') || lower.includes('off') || lower.includes('disable') || lower.includes('zero')) {
        this.physics.setAllBounciness(0);
        return 'No bounce - objects will stick on impact.';
      }
      this.physics.setAllBounciness(0.8);
      return 'Made everything bouncy! 🏀';
    }
    
    // Creation commands
    if (lower.includes('create') || lower.includes('make') || lower.includes('add') || lower.includes('spawn')) {
      const count = this.extractNumber(lower) || 1;
      const color = this.extractColorName(lower);
      
      if (lower.includes('ball') || lower.includes('circle')) {
        for (let i = 0; i < Math.min(count, 10); i++) {
          this.physics.createBall(
            Math.random() * 600 + 200,
            Math.random() * 200 + 100,
            30,
            COLORS[color] || COLORS.blue
          );
        }
        return `Created ${count} ${color || 'blue'} ball${count > 1 ? 's' : ''}! 🎱`;
      }
      
      if (lower.includes('triangle')) {
        for (let i = 0; i < Math.min(count, 10); i++) {
          this.physics.createPolygon(
            Math.random() * 600 + 200,
            Math.random() * 200 + 100,
            3, 40,
            COLORS[color] || COLORS.green
          );
        }
        return `Created ${count} ${color || 'green'} triangle${count > 1 ? 's' : ''}! 🔺`;
      }
      
      if (lower.includes('rectangle') || lower.includes('square') || lower.includes('box')) {
        for (let i = 0; i < Math.min(count, 10); i++) {
          this.physics.createRectangle(
            Math.random() * 600 + 200,
            Math.random() * 200 + 100,
            60, 60,
            COLORS[color] || COLORS.purple
          );
        }
        return `Created ${count} ${color || 'purple'} rectangle${count > 1 ? 's' : ''}! ⬛`;
      }
      
      if (lower.includes('star')) {
        for (let i = 0; i < Math.min(count, 10); i++) {
          this.physics.createStar(
            Math.random() * 600 + 200,
            Math.random() * 200 + 100,
            5, 40, 20,
            COLORS[color] || COLORS.gold
          );
        }
        return `Created ${count} ${color || 'gold'} star${count > 1 ? 's' : ''}! ⭐`;
      }
      
      if (lower.includes('hexagon')) {
        for (let i = 0; i < Math.min(count, 10); i++) {
          this.physics.createPolygon(
            Math.random() * 600 + 200,
            Math.random() * 200 + 100,
            6, 35,
            COLORS[color] || COLORS.cyan
          );
        }
        return `Created ${count} ${color || 'cyan'} hexagon${count > 1 ? 's' : ''}! ⬡`;
      }
      
      // Default to ball if shape not specified
      for (let i = 0; i < Math.min(count, 10); i++) {
        this.physics.createBall(
          Math.random() * 600 + 200,
          Math.random() * 200 + 100,
          30,
          COLORS[color] || COLORS.blue
        );
      }
      return `Created ${count} ${color || 'blue'} ball${count > 1 ? 's' : ''}! 🎱`;
    }
    
    // Deletion
    if (lower.includes('clear') || lower.includes('remove all') || lower.includes('delete all') || lower.includes('reset')) {
      this.physics.clearAllObjects();
      return 'Cleared everything! Fresh start. ✨';
    }
    
    // Remove specific type
    if (lower.includes('remove') || lower.includes('delete')) {
      if (lower.includes('ball') || lower.includes('circle')) {
        const circles = info.objects.filter(o => o.type === 'circle');
        circles.forEach(o => this.physics.removeObject(o.id));
        return `Removed ${circles.length} ball${circles.length !== 1 ? 's' : ''}!`;
      }
      if (lower.includes('triangle')) {
        const tris = info.objects.filter(o => o.type === 'triangle');
        tris.forEach(o => this.physics.removeObject(o.id));
        return `Removed ${tris.length} triangle${tris.length !== 1 ? 's' : ''}!`;
      }
      if (lower.includes('rectangle') || lower.includes('square')) {
        const rects = info.objects.filter(o => o.type === 'rectangle');
        rects.forEach(o => this.physics.removeObject(o.id));
        return `Removed ${rects.length} rectangle${rects.length !== 1 ? 's' : ''}!`;
      }
    }
    
    // Counting
    if (lower.includes('how many')) {
      if (lower.includes('ball') || lower.includes('circle')) {
        const count = info.byType['circle'] || 0;
        return `There ${count === 1 ? 'is' : 'are'} ${count} ball${count !== 1 ? 's' : ''} in the scene.`;
      }
      return `There are ${info.total} objects total in the scene.`;
    }
    
    // Recall
    if (lower.includes('recall') || lower.includes('bring back') || lower.includes('center')) {
      this.physics.recallBalls();
      return 'Bringing all objects to the center! 🎯';
    }
    
    return 'I\'m having trouble connecting to my brain right now. Try basic commands like "create a ball", "disable gravity", or "clear all"!';
  }
  
  private extractNumber(text: string): number | null {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }
  
  private extractColorName(text: string): string {
    for (const color of Object.keys(COLORS)) {
      if (text.includes(color)) return color;
    }
    return '';
  }
}
