import OpenAI from 'openai';
import { PhysicsEngine, PhysicsObject } from './physics';
import { UIManager } from './uiManager';
import { HandData } from './handTracking';

// OpenRouter configuration
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = 'z-ai/glm-4.5-air:free';

// Color palette
const COLORS: Record<string, string> = {
  red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e',
  blue: '#3b82f6', purple: '#a855f7', pink: '#ec4899', white: '#ffffff',
  black: '#1a1a1a', gray: '#6b7280', cyan: '#06b6d4', teal: '#14b8a6',
  amber: '#f59e0b', violet: '#8b5cf6', emerald: '#10b981', lime: '#84cc16',
  indigo: '#6366f1', rose: '#f43f5e', gold: '#fbbf24', silver: '#9ca3af'
};

/**
 * Intelligent AI Agent for FistFirst Learn
 * 
 * This AI actually THINKS before acting:
 * - Analyzes user intent from context
 * - Understands references like "it", "that", "the circle"
 * - Modifies existing objects when user means modification
 * - Creates new objects only when user wants creation
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
  private lastMentionedObjects: string[] = [];
  private lastAction: string = '';

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
      console.log('✓ AI initialized with GLM 4.5');
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

  private getDetailedSceneContext(): string {
    const info = this.physics.getObjectsInfo();
    const stats = this.physics.getStats();
    const bounds = this.physics.getPlayingFieldBounds();
    
    let context = `=== CURRENT SCENE STATE ===\n`;
    context += `Total objects: ${info.total}\n`;
    
    if (info.total > 0) {
      context += `\nObjects by type:\n`;
      for (const [type, count] of Object.entries(info.byType)) {
        context += `  - ${type}: ${count}\n`;
      }
      
      context += `\nObjects by color:\n`;
      for (const [color, count] of Object.entries(info.byColor)) {
        context += `  - ${color}: ${count}\n`;
      }
      
      context += `\nDetailed object list:\n`;
      for (const obj of info.objects) {
        context += `  [${obj.id}] ${obj.type} (${obj.color}) at (${obj.x}, ${obj.y}) - mass: ${obj.mass}, bounce: ${obj.bounciness}, friction: ${obj.friction}${obj.isStatic ? ' [STATIC]' : ''}\n`;
      }
    }
    
    context += `\nPhysics settings:\n`;
    context += `  - Gravity: (${stats.gravity.x.toFixed(2)}, ${stats.gravity.y.toFixed(2)})\n`;
    context += `  - Boundaries: ${stats.boundariesEnabled ? 'ON' : 'OFF'}\n`;
    context += `  - Hand collision: ${stats.handsCollidable ? 'ON' : 'OFF'}\n`;
    
    if (bounds) {
      context += `  - Play area: ${Math.round(bounds.width)}x${Math.round(bounds.height)}\n`;
    }
    
    // User context - MAKE POINTING VERY PROMINENT
    if (this.selectedObjectId) {
      const obj = this.physics.getObjectById(this.selectedObjectId);
      if (obj) {
        const physicsInfo = this.physics.getObjectPhysicsInfo(this.selectedObjectId);
        context += `\n*** USER IS POINTING AT: [${obj.id}] ${obj.type} (${this.getColorName(obj.color)}) ***\n`;
        context += `    This is the "this"/"that"/"it" object!\n`;
        if (physicsInfo) {
          context += `    Physics: mass=${physicsInfo.mass.toFixed(3)}, bounce=${physicsInfo.bounciness.toFixed(2)}\n`;
        }
      }
    } else if (this.lastMentionedObjects.length > 0) {
      context += `\nNo object pointed at. Last mentioned: ${this.lastMentionedObjects.join(', ')}\n`;
    }
    
    if (this.lastPointingPosition) {
      context += `Pointing position: (${Math.round(this.lastPointingPosition.x)}, ${Math.round(this.lastPointingPosition.y)})\n`;
    }
    
    if (this.lastMentionedObjects.length > 0) {
      context += `Recently mentioned objects: ${this.lastMentionedObjects.join(', ')}\n`;
    }
    
    if (this.lastAction) {
      context += `Last action: ${this.lastAction}\n`;
    }
    
    return context;
  }

  private getColorName(hex: string): string {
    for (const [name, value] of Object.entries(COLORS)) {
      if (value.toLowerCase() === hex.toLowerCase()) return name;
    }
    return hex;
  }

  private buildIntelligentPrompt(): string {
    return `You are an intelligent AI assistant for FistFirst Learn, an AR physics sandbox. You must THINK about what the user actually wants before acting.

## ABSOLUTE RULES - NEVER BREAK THESE:

1. **QUESTIONS ARE NOT COMMANDS**: 
   - "What color is this?" = ANSWER the question, do NOT create anything
   - "What is this?" = DESCRIBE the object, do NOT create anything
   - "How many balls?" = COUNT and answer, do NOT create anything
   - ANY sentence with "what", "how", "which", "where", "is this", "is it" = QUERY, NOT creation

2. **"THIS" and "THAT" ALWAYS REFER TO EXISTING OBJECTS**:
   - "Make THIS ball red" = Change the pointed/selected object's color
   - "What is THIS?" = Describe the pointed/selected object
   - "THIS" NEVER means "create a new one"
   - If user says "this ball" and is pointing at something, USE the pointed object ID

3. **MODIFICATION vs CREATION**: 
   - "Make it bigger" = MODIFY existing object, NOT create new
   - "Make the circle red" = Find THE circle and change its color
   - "can you make this ball red" = MODIFY the existing ball to red, NOT create
   - "Create a circle" or "Add a ball" = Actually CREATE a new object
   - Only CREATE when user explicitly says: "create", "add", "spawn", "make me a new"

4. **POINTING CONTEXT IS CRITICAL**:
   - If "User is pointing at: [ball_1]" appears in context, then "this", "it", "that" = ball_1
   - The selected object takes priority over last mentioned

## RESPONSE FORMAT:

You MUST respond with a JSON block containing your REASONING and ACTIONS:

\`\`\`json
{
  "thinking": "My analysis of what the user wants...",
  "intent": "modify" | "create" | "query" | "physics" | "delete" | "conversation",
  "targetObjects": ["object_ids to act on"] | "all" | "new",
  "actions": [
    {"action": "actionName", "params": {...}}
  ],
  "response": "What to say to the user"
}
\`\`\`

## AVAILABLE ACTIONS:

### Object Creation (only when user wants NEW objects):
- createBall: {x?, y?, radius?, color?}
- createRectangle: {x?, y?, width?, height?, color?}
- createTriangle: {x?, y?, size?, color?}
- createHexagon: {x?, y?, size?, color?}
- createPolygon: {x?, y?, sides?, size?, color?}
- createStar: {x?, y?, points?, size?, color?}
- createMultiple: {count, shape, color?, pattern?}

### Object Modification (when user refers to EXISTING objects):
- scaleObject: {objectId, scale} - make bigger (1.5) or smaller (0.7)
- setColor: {objectId, color}
- setPosition: {objectId, x, y}
- setVelocity: {objectId, vx, vy}
- makeStatic: {objectId, isStatic}
- removeObject: {objectId}

### Physics Properties (CRITICAL - use these for mass/weight/material changes):
- setMass: {objectId, mass} - heavier objects (5-10), lighter objects (0.1-0.5), normal (1)
- setDensity: {objectId, density} - affects mass based on size (0.0001=foam, 0.001=normal, 0.01=heavy)
- setFriction: {objectId, friction} - 0=slippery like ice, 1=grippy like rubber
- setAirResistance: {objectId, airResistance} - 0=no drag, 0.1=floaty, 0.01=normal
- setBounciness: {objectId, bounciness} - 0=no bounce, 1=super bouncy
- setSpin: {objectId, angularVelocity} - make object spin (positive=clockwise)
- setMaterial: {objectId, material} - preset materials: "metal", "wood", "rubber", "foam", "ice", "stone"
- applyForce: {objectId, x, y} - push an object (use small values like 0.01)
- applyImpulse: {objectId, x, y} - instant velocity change

### Batch Physics Operations:
- setMassForAll: {type?, color?, mass} - e.g., make all red balls heavier
- setDensityForAll: {type?, color?, density}

### Batch Operations:
- scaleAll: {type?, color?, scale}
- setColorAll: {type?, color, newColor}
- removeAll: {type?, color?}
- removeByType: {type} - remove all objects of a type (circle, triangle, rectangle, star, hexagon)
- removeByColor: {color} - remove all objects of a color

### Physics:
- setGravity: {x?, y?, direction?, strength?}
- setBounciness: {value} or {objectId, value}
- enableBoundaries: {enable}
- enableMagnetic: {enable}
- recallBalls: {}

### Query (for questions - NEVER create when querying):
- queryScene: {} - get overall scene info
- getObjectInfo: {objectId} - get details about specific object
- countByType: {type} - count objects of specific type
- countByColor: {color} - count objects of specific color

## EXAMPLES:

User: "Remove the triangle"
Scene: 1 triangle exists with id "poly_1"
\`\`\`json
{
  "thinking": "User wants to REMOVE the triangle. There is 1 triangle (poly_1). I should delete it.",
  "intent": "delete",
  "targetObjects": ["poly_1"],
  "actions": [{"action": "removeObject", "params": {"objectId": "poly_1"}}],
  "response": "Removed the triangle!"
}
\`\`\`

User: "How many triangles are there?"
Scene: 2 triangles exist
\`\`\`json
{
  "thinking": "User is asking a QUESTION about counting triangles. I should count triangles in the scene, NOT create anything.",
  "intent": "query",
  "targetObjects": [],
  "actions": [{"action": "countByType", "params": {"type": "triangle"}}],
  "response": "There are 2 triangles."
}
\`\`\`

User: "Delete all the red objects"
Scene: 3 red objects exist
\`\`\`json
{
  "thinking": "User wants to DELETE all red objects. This is a batch delete operation.",
  "intent": "delete",
  "targetObjects": "all",
  "actions": [{"action": "removeByColor", "params": {"color": "red"}}],
  "response": "Removed all red objects!"
}
\`\`\`

User: "Make the circle bigger"
Scene: 1 circle exists with id "ball_1"
\`\`\`json
{
  "thinking": "User said 'the circle' which refers to an existing circle. There is 1 circle (ball_1). They want to make it bigger, which means scaling it up.",
  "intent": "modify",
  "targetObjects": ["ball_1"],
  "actions": [{"action": "scaleObject", "params": {"objectId": "ball_1", "scale": 1.5}}],
  "response": "I made the circle bigger!"
}
\`\`\`

User: "Make it red"
Context: User just created ball_2
\`\`\`json
{
  "thinking": "User says 'it' referring to the last created object (ball_2). They want to change its color to red.",
  "intent": "modify",
  "targetObjects": ["ball_2"],
  "actions": [{"action": "setColor", "params": {"objectId": "ball_2", "color": "red"}}],
  "response": "Changed it to red!"
}
\`\`\`

User: "Create 5 balls"
\`\`\`json
{
  "thinking": "User explicitly said 'create' - they want NEW objects, 5 balls.",
  "intent": "create",
  "targetObjects": "new",
  "actions": [{"action": "createMultiple", "params": {"count": 5, "shape": "ball", "color": "random"}}],
  "response": "Created 5 colorful balls!"
}
\`\`\`

User: "How many red objects?"
\`\`\`json
{
  "thinking": "User is asking a question about the scene, not requesting an action.",
  "intent": "query",
  "targetObjects": [],
  "actions": [{"action": "queryScene", "params": {}}],
  "response": "There are X red objects on screen."
}
\`\`\`

User: "What is the color of this ball?"
Context: User pointing at ball_1 which is blue
\`\`\`json
{
  "thinking": "User is asking a QUESTION about 'this ball'. 'This' refers to the pointed object (ball_1). I should ANSWER the question, NOT create anything.",
  "intent": "query",
  "targetObjects": ["ball_1"],
  "actions": [{"action": "getObjectInfo", "params": {"objectId": "ball_1"}}],
  "response": "This ball is blue!"
}
\`\`\`

User: "Can you make this ball red?"
Context: User pointing at ball_2 which is currently green
\`\`\`json
{
  "thinking": "User says 'this ball' and is pointing at ball_2. They want to CHANGE it to red, not create a new ball. This is a modification request.",
  "intent": "modify",
  "targetObjects": ["ball_2"],
  "actions": [{"action": "setColor", "params": {"objectId": "ball_2", "color": "red"}}],
  "response": "Done! I changed this ball to red."
}
\`\`\`

User: "Make the red ball heavier than the blue ball"
Scene: red ball (ball_1) and blue ball (ball_2) exist
\`\`\`json
{
  "thinking": "User wants to change the relative mass of two objects. I need to make ball_1 (red) heavier and ball_2 (blue) lighter. I'll set red to mass 5 and blue to mass 0.5, making red 10x heavier.",
  "intent": "modify",
  "targetObjects": ["ball_1", "ball_2"],
  "actions": [
    {"action": "setMass", "params": {"objectId": "ball_1", "mass": 5}},
    {"action": "setMass", "params": {"objectId": "ball_2", "mass": 0.5}}
  ],
  "response": "Done! The red ball is now 10 times heavier than the blue ball. Try colliding them to see the difference!"
}
\`\`\`

User: "Make it bouncy like rubber"
Context: User pointing at ball_3
\`\`\`json
{
  "thinking": "User says 'it' referring to pointed object (ball_3). They want rubber-like properties which means high bounciness and friction. I'll use the rubber material preset.",
  "intent": "modify",
  "targetObjects": ["ball_3"],
  "actions": [{"action": "setMaterial", "params": {"objectId": "ball_3", "material": "rubber"}}],
  "response": "Made it bouncy like rubber! It will bounce high and grip surfaces."
}
\`\`\`

ALWAYS think through the user's actual intent. Never assume "create" when they mean "modify".`;
  }

  async processCommand(userMessage: string): Promise<string> {
    if (this.isProcessing) {
      return 'Please wait...';
    }

    this.isProcessing = true;
    this.onMessage?.(userMessage, true);

    try {
      if (!this.openai) {
        const response = this.smartFallback(userMessage);
        this.onMessage?.(response, false);
        return response;
      }

      // Build full context
      const sceneContext = this.getDetailedSceneContext();
      const systemPrompt = this.buildIntelligentPrompt();
      
      // Add conversation history for context
      const recentHistory = this.conversationHistory.slice(-6).map(h => 
        `${h.role === 'user' ? 'User' : 'AI'}: ${h.content}`
      ).join('\n');
      
      const fullUserMessage = `${sceneContext}\n\nRecent conversation:\n${recentHistory}\n\nCurrent user message: "${userMessage}"`;
      
      console.log('Sending to AI with context:', fullUserMessage.substring(0, 500) + '...');

      const response = await this.openai.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fullUserMessage }
        ],
        max_tokens: 1000,
        temperature: 0.3 // Lower temperature for more consistent reasoning
      });

      const aiResponse = response.choices[0].message.content || '';
      console.log('AI response:', aiResponse);
      
      // Parse the JSON response
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)```/);
      
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          console.log('AI thinking:', parsed.thinking);
          console.log('AI intent:', parsed.intent);
          console.log('AI target:', parsed.targetObjects);
          
          // Execute actions
          if (parsed.actions && Array.isArray(parsed.actions)) {
            for (const actionItem of parsed.actions) {
              const result = this.executeAction(actionItem.action, actionItem.params || {});
              console.log(`Executed ${actionItem.action}:`, result);
              
              // Track for context
              if (result.data?.id) {
                this.lastMentionedObjects = [result.data.id];
              }
            }
          }
          
          this.lastAction = parsed.intent;
          
          // Update conversation history
          this.conversationHistory.push({ role: 'user', content: userMessage });
          this.conversationHistory.push({ role: 'assistant', content: parsed.response });
          
          this.onMessage?.(parsed.response, false);
          return parsed.response;
          
        } catch (parseError) {
          console.error('Failed to parse AI JSON:', parseError);
          // Try to extract just the response text
          const responseMatch = aiResponse.match(/"response"\s*:\s*"([^"]+)"/);
          if (responseMatch) {
            this.onMessage?.(responseMatch[1], false);
            return responseMatch[1];
          }
        }
      }
      
      // If no JSON, use the raw response
      const cleanResponse = aiResponse.replace(/```[\s\S]*?```/g, '').trim() || 'Done!';
      this.onMessage?.(cleanResponse, false);
      return cleanResponse;
      
    } catch (error) {
      console.error('AI error:', error);
      const fallback = this.smartFallback(userMessage);
      this.onMessage?.(fallback, false);
      return fallback;
    } finally {
      this.isProcessing = false;
    }
  }

  private executeAction(actionName: string, params: any): { success: boolean; message: string; data?: any } {
    const renderer = (this.physics as any).renderer;
    const width = renderer?.width || window.innerWidth;
    const height = renderer?.height || window.innerHeight;
    
    const getPos = (val: any, isX: boolean): number => {
      if (val === 'pointing' && this.lastPointingPosition) {
        return isX ? this.lastPointingPosition.x : this.lastPointingPosition.y;
      }
      if (val === 'center') return isX ? width / 2 : height / 2;
      if (val === 'random') return isX ? Math.random() * width * 0.6 + width * 0.2 : Math.random() * height * 0.5 + height * 0.2;
      if (typeof val === 'number') {
        // If it looks like a percentage (0-100), convert it
        if (val <= 100) return (val / 100) * (isX ? width : height);
        return val; // Otherwise use as absolute position
      }
      return isX ? width / 2 : height / 3;
    };

    const getColor = (c: string | undefined): string => {
      if (!c) return COLORS.blue;
      if (c === 'random') {
        const keys = Object.keys(COLORS);
        return COLORS[keys[Math.floor(Math.random() * keys.length)]];
      }
      return COLORS[c.toLowerCase()] || c;
    };

    try {
      switch (actionName) {
        // === CREATION ===
        case 'createBall': {
          const x = getPos(params.x, true);
          const y = getPos(params.y, false);
          const obj = this.physics.createBall(x, y, params.radius ?? 30, getColor(params.color));
          this.lastMentionedObjects = [obj.id];
          return { success: true, message: 'Created ball', data: { id: obj.id } };
        }

        case 'createRectangle': {
          const x = getPos(params.x, true);
          const y = getPos(params.y, false);
          const obj = this.physics.createRectangle(x, y, params.width ?? 60, params.height ?? 60, getColor(params.color));
          this.lastMentionedObjects = [obj.id];
          return { success: true, message: 'Created rectangle', data: { id: obj.id } };
        }

        case 'createTriangle': {
          const x = getPos(params.x, true);
          const y = getPos(params.y, false);
          const obj = this.physics.createPolygon(x, y, 3, params.size ?? 40, getColor(params.color));
          this.lastMentionedObjects = [obj.id];
          return { success: true, message: 'Created triangle', data: { id: obj.id } };
        }

        case 'createHexagon': {
          const x = getPos(params.x, true);
          const y = getPos(params.y, false);
          const obj = this.physics.createPolygon(x, y, 6, params.size ?? 40, getColor(params.color));
          this.lastMentionedObjects = [obj.id];
          return { success: true, message: 'Created hexagon', data: { id: obj.id } };
        }

        case 'createPolygon': {
          const x = getPos(params.x, true);
          const y = getPos(params.y, false);
          const obj = this.physics.createPolygon(x, y, params.sides ?? 5, params.size ?? 40, getColor(params.color));
          this.lastMentionedObjects = [obj.id];
          return { success: true, message: 'Created polygon', data: { id: obj.id } };
        }

        case 'createStar': {
          const x = getPos(params.x, true);
          const y = getPos(params.y, false);
          const size = params.size ?? 50;
          const obj = this.physics.createStar(x, y, params.points ?? 5, size, size / 2, getColor(params.color));
          this.lastMentionedObjects = [obj.id];
          return { success: true, message: 'Created star', data: { id: obj.id } };
        }

        case 'createMultiple': {
          const count = Math.min(params.count ?? 5, 30);
          const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
          const createdIds: string[] = [];
          
          for (let i = 0; i < count; i++) {
            const x = Math.random() * width * 0.6 + width * 0.2;
            const y = Math.random() * height * 0.4 + height * 0.2;
            const color = params.color === 'rainbow' || params.color === 'random' 
              ? colors[i % colors.length] 
              : (params.color || colors[Math.floor(Math.random() * colors.length)]);
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
            } else {
              obj = this.physics.createRectangle(x, y, size * 1.5, size * 1.5, getColor(color));
            }
            createdIds.push(obj.id);
          }
          
          this.lastMentionedObjects = createdIds;
          return { success: true, message: `Created ${count} ${params.shape || 'ball'}s` };
        }

        // === MODIFICATION ===
        case 'scaleObject': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.scaleObject(objId, params.scale ?? 1.5);
            return { success: true, message: `Scaled ${objId}` };
          }
          return { success: false, message: 'No object to scale' };
        }

        case 'setColor': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.setObjectColor(objId, getColor(params.color));
            return { success: true, message: `Changed color of ${objId}` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setPosition': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.setObjectPosition(objId, getPos(params.x, true), getPos(params.y, false));
            return { success: true, message: 'Moved object' };
          }
          return { success: false, message: 'No object to move' };
        }

        case 'setVelocity': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.setObjectVelocity(objId, params.vx ?? 0, params.vy ?? 0);
            return { success: true, message: 'Set velocity' };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'makeStatic': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.setObjectStatic(objId, params.isStatic !== false);
            return { success: true, message: params.isStatic ? 'Made static' : 'Made dynamic' };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'removeObject': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.removeObject(objId);
            this.lastMentionedObjects = [];
            return { success: true, message: 'Removed object' };
          }
          return { success: false, message: 'No object to remove' };
        }

        // === BATCH OPERATIONS ===
        case 'scaleAll': {
          const objects = this.physics.getObjects();
          let count = 0;
          for (const obj of objects) {
            if (params.type && obj.type !== params.type) continue;
            if (params.color && this.getColorName(obj.color) !== params.color) continue;
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
            if (params.color && this.getColorName(obj.color) !== params.color) continue;
            this.physics.setObjectColor(obj.id, getColor(params.newColor));
            count++;
          }
          return { success: true, message: `Changed color of ${count} objects` };
        }

        case 'removeAll': {
          if (!params.type && !params.color) {
            this.physics.clearAllObjects();
            return { success: true, message: 'Cleared all objects' };
          }
          const objects = this.physics.getObjects();
          let count = 0;
          for (const obj of objects) {
            if (params.type && obj.type !== params.type) continue;
            if (params.color && this.getColorName(obj.color) !== params.color) continue;
            this.physics.removeObject(obj.id);
            count++;
          }
          return { success: true, message: `Removed ${count} objects` };
        }

        // === PHYSICS ===
        case 'setGravity': {
          let gx = params.x ?? 0;
          let gy = params.y ?? 0;
          if (params.direction) {
            const s = params.strength ?? 1;
            switch (params.direction) {
              case 'down': gy = s; break;
              case 'up': gy = -s; break;
              case 'left': gx = -s; break;
              case 'right': gx = s; break;
            }
          } else if (params.strength !== undefined) {
            gy = params.strength;
          }
          this.physics.setGravity(gx, gy);
          return { success: true, message: `Gravity set to (${gx}, ${gy})` };
        }

        case 'setBounciness': {
          if (params.objectId) {
            this.physics.setObjectBounciness(params.objectId, params.value ?? 0.8);
          } else {
            this.physics.setAllBounciness(params.value ?? 0.8);
          }
          return { success: true, message: `Bounciness set to ${params.value}` };
        }

        case 'enableBoundaries': {
          if (params.enable !== false) {
            this.physics.enableBoundaries();
          } else {
            this.physics.disableBoundaries();
          }
          return { success: true, message: params.enable ? 'Boundaries on' : 'Boundaries off' };
        }

        case 'enableMagnetic': {
          this.physics.setMagneticAttraction(params.enable !== false);
          return { success: true, message: params.enable ? 'Magnetic on' : 'Magnetic off' };
        }

        case 'recallBalls': {
          this.physics.recallBalls();
          return { success: true, message: 'Recalling objects' };
        }

        case 'queryScene': {
          return { success: true, message: 'Scene queried', data: this.physics.getObjectsInfo() };
        }

        case 'getObjectInfo': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            const obj = this.physics.getObjectById(objId);
            const physicsInfo = this.physics.getObjectPhysicsInfo(objId);
            if (obj && physicsInfo) {
              return { 
                success: true, 
                message: `Object info retrieved`,
                data: {
                  id: objId,
                  type: obj.type,
                  color: this.getColorName(obj.color),
                  ...physicsInfo
                }
              };
            }
          }
          return { success: false, message: 'No object found' };
        }

        case 'countByType': {
          const info = this.physics.getObjectsInfo();
          const count = info.byType[params.type] || 0;
          return { success: true, message: `Count: ${count}`, data: { type: params.type, count } };
        }

        case 'countByColor': {
          const info = this.physics.getObjectsInfo();
          const count = info.byColor[params.color] || 0;
          return { success: true, message: `Count: ${count}`, data: { color: params.color, count } };
        }

        case 'removeByType': {
          const objects = this.physics.getObjects();
          let count = 0;
          for (const obj of objects) {
            if (obj.type === params.type) {
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
            if (this.getColorName(obj.color) === params.color) {
              this.physics.removeObject(obj.id);
              count++;
            }
          }
          return { success: true, message: `Removed ${count} ${params.color} objects` };
        }

        // === ADVANCED PHYSICS PROPERTIES ===
        case 'setMass': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.setObjectMass(objId, params.mass ?? 1);
            return { success: true, message: `Set mass of ${objId} to ${params.mass}` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setDensity': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.setObjectDensity(objId, params.density ?? 0.001);
            return { success: true, message: `Set density of ${objId}` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setFriction': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.setObjectFriction(objId, params.friction ?? 0.1);
            return { success: true, message: `Set friction of ${objId}` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setAirResistance': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.setObjectAirResistance(objId, params.airResistance ?? 0.01);
            return { success: true, message: `Set air resistance of ${objId}` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setSpin': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.setObjectSpin(objId, params.angularVelocity ?? 0.1);
            return { success: true, message: `Set spin of ${objId}` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setMaterial': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            const material = params.material || 'rubber';
            this.physics.setObjectMaterial(objId, material);
            return { success: true, message: `Set ${objId} to ${material} material` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'applyForce': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.applyForceToObject(objId, { x: params.x ?? 0, y: params.y ?? 0 });
            return { success: true, message: `Applied force to ${objId}` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'applyImpulse': {
          const objId = params.objectId || this.selectedObjectId || this.lastMentionedObjects[0];
          if (objId) {
            this.physics.applyImpulseToObject(objId, { x: params.x ?? 0, y: params.y ?? 0 });
            return { success: true, message: `Applied impulse to ${objId}` };
          }
          return { success: false, message: 'No object to modify' };
        }

        case 'setMassForAll': {
          const count = this.physics.setMassForAll({
            type: params.type,
            color: params.color,
            mass: params.mass ?? 1
          });
          return { success: true, message: `Set mass for ${count} objects` };
        }

        case 'setDensityForAll': {
          const count = this.physics.setDensityForAll({
            type: params.type,
            color: params.color,
            density: params.density ?? 0.001
          });
          return { success: true, message: `Set density for ${count} objects` };
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

  // Smart fallback when AI fails or is unavailable
  private smartFallback(input: string): string {
    const lower = input.toLowerCase();
    const info = this.physics.getObjectsInfo();
    
    // FIRST: Check for DELETE/REMOVE commands (high priority)
    const isDelete = lower.includes('delete') || lower.includes('remove') || 
                     lower.includes('destroy') || lower.includes('get rid of') ||
                     lower.includes('clear');
    
    if (isDelete) {
      // Check if removing all
      if (lower.includes('all') || lower.includes('everything') || lower.includes('clear')) {
        // Check for specific type
        if (lower.includes('triangle')) {
          const triangles = info.objects.filter(o => o.type === 'triangle');
          triangles.forEach(o => this.physics.removeObject(o.id));
          return `Removed ${triangles.length} triangle${triangles.length === 1 ? '' : 's'}!`;
        }
        if (lower.includes('circle') || lower.includes('ball')) {
          const circles = info.objects.filter(o => o.type === 'circle');
          circles.forEach(o => this.physics.removeObject(o.id));
          return `Removed ${circles.length} ball${circles.length === 1 ? '' : 's'}!`;
        }
        if (lower.includes('rectangle') || lower.includes('square')) {
          const rects = info.objects.filter(o => o.type === 'rectangle');
          rects.forEach(o => this.physics.removeObject(o.id));
          return `Removed ${rects.length} rectangle${rects.length === 1 ? '' : 's'}!`;
        }
        if (lower.includes('star')) {
          const stars = info.objects.filter(o => o.type === 'star');
          stars.forEach(o => this.physics.removeObject(o.id));
          return `Removed ${stars.length} star${stars.length === 1 ? '' : 's'}!`;
        }
        if (lower.includes('hexagon')) {
          const hexs = info.objects.filter(o => o.type === 'hexagon');
          hexs.forEach(o => this.physics.removeObject(o.id));
          return `Removed ${hexs.length} hexagon${hexs.length === 1 ? '' : 's'}!`;
        }
        // Remove by color
        const color = this.extractColor(lower);
        if (color) {
          const colored = info.objects.filter(o => o.color === color);
          colored.forEach(o => this.physics.removeObject(o.id));
          return `Removed ${colored.length} ${color} object${colored.length === 1 ? '' : 's'}!`;
        }
        // Remove everything
        this.physics.clearAllObjects();
        return 'Cleared all objects!';
      }
      
      // Remove specific type (the triangle, a triangle)
      if (lower.includes('triangle')) {
        const triangle = info.objects.find(o => o.type === 'triangle');
        if (triangle) {
          this.physics.removeObject(triangle.id);
          return 'Removed the triangle!';
        }
        return 'No triangle found to remove.';
      }
      if (lower.includes('circle') || lower.includes('ball')) {
        const circle = info.objects.find(o => o.type === 'circle');
        if (circle) {
          this.physics.removeObject(circle.id);
          return 'Removed the ball!';
        }
        return 'No ball found to remove.';
      }
      if (lower.includes('rectangle') || lower.includes('square')) {
        const rect = info.objects.find(o => o.type === 'rectangle');
        if (rect) {
          this.physics.removeObject(rect.id);
          return 'Removed the rectangle!';
        }
        return 'No rectangle found to remove.';
      }
      if (lower.includes('star')) {
        const star = info.objects.find(o => o.type === 'star');
        if (star) {
          this.physics.removeObject(star.id);
          return 'Removed the star!';
        }
        return 'No star found to remove.';
      }
      if (lower.includes('hexagon')) {
        const hex = info.objects.find(o => o.type === 'hexagon');
        if (hex) {
          this.physics.removeObject(hex.id);
          return 'Removed the hexagon!';
        }
        return 'No hexagon found to remove.';
      }
      
      // Remove by color
      const color = this.extractColor(lower);
      if (color) {
        const colored = info.objects.find(o => o.color === color);
        if (colored) {
          this.physics.removeObject(colored.id);
          return `Removed the ${color} object!`;
        }
        return `No ${color} object found.`;
      }
      
      // Remove pointed object
      if (this.selectedObjectId) {
        this.physics.removeObject(this.selectedObjectId);
        this.selectedObjectId = null;
        return 'Removed it!';
      }
      
      // Remove last mentioned
      if (this.lastMentionedObjects.length > 0) {
        const id = this.lastMentionedObjects[0];
        this.physics.removeObject(id);
        this.lastMentionedObjects = [];
        return 'Removed it!';
      }
      
      return 'I don\'t know which object to remove. Try saying "remove the triangle" or point at one!';
    }
    
    // SECOND: Check if this is a QUESTION (never create for questions!)
    const isQuestion = lower.includes('what') || lower.includes('how many') || 
                       lower.includes('which') || lower.includes('where') ||
                       lower.includes('is this') || lower.includes('is it') ||
                       lower.includes('is the') || lower.includes('color of') ||
                       lower.includes('count') || lower.endsWith('?');
    
    if (isQuestion) {
      // Find target object for questions about "this"
      let targetId = this.selectedObjectId || this.lastMentionedObjects[0];
      
      // If asking about "this ball/circle" etc, find it
      if (!targetId) {
        if (lower.includes('ball') || lower.includes('circle')) {
          const obj = info.objects.find(o => o.type === 'circle');
          if (obj) targetId = obj.id;
        }
      }
      
      if (lower.includes('color')) {
        if (targetId) {
          const obj = info.objects.find(o => o.id === targetId);
          if (obj) return `This ${obj.type} is ${obj.color}!`;
        }
        return 'I can\'t see which object you mean. Try pointing at it!';
      }
      
      if (lower.includes('how many') || lower.includes('count')) {
        // Check for specific type first
        if (lower.includes('triangle')) {
          const count = info.byType['triangle'] || 0;
          return `There ${count === 1 ? 'is' : 'are'} ${count} triangle${count === 1 ? '' : 's'}.`;
        }
        if (lower.includes('circle') || lower.includes('ball')) {
          const count = info.byType['circle'] || 0;
          return `There ${count === 1 ? 'is' : 'are'} ${count} ball${count === 1 ? '' : 's'}.`;
        }
        if (lower.includes('rectangle') || lower.includes('square')) {
          const count = info.byType['rectangle'] || 0;
          return `There ${count === 1 ? 'is' : 'are'} ${count} rectangle${count === 1 ? '' : 's'}.`;
        }
        if (lower.includes('star')) {
          const count = info.byType['star'] || 0;
          return `There ${count === 1 ? 'is' : 'are'} ${count} star${count === 1 ? '' : 's'}.`;
        }
        if (lower.includes('hexagon')) {
          const count = info.byType['hexagon'] || 0;
          return `There ${count === 1 ? 'is' : 'are'} ${count} hexagon${count === 1 ? '' : 's'}.`;
        }
        
        // Check for color
        const color = this.extractColor(lower);
        if (color && info.byColor[color] !== undefined) {
          const count = info.byColor[color];
          return `There ${count === 1 ? 'is' : 'are'} ${count} ${color} object${count === 1 ? '' : 's'}.`;
        }
        
        // General count
        return `There ${info.total === 1 ? 'is' : 'are'} ${info.total} object${info.total === 1 ? '' : 's'} on screen.`;
      }
      
      if (lower.includes('what is this') || lower.includes('what\'s this')) {
        if (targetId) {
          const obj = info.objects.find(o => o.id === targetId);
          if (obj) return `This is a ${obj.color} ${obj.type}.`;
        }
        return 'I can\'t see what you\'re pointing at. Try pointing at an object!';
      }
      
      return 'I\'m not sure what you\'re asking about. Try pointing at an object!';
    }
    
    // THIRD: Detect modification intent (including "make this ball red")
    const isModification = lower.includes('make it') || lower.includes('make the') || 
                          lower.includes('make this') || lower.includes('change') || 
                          lower.includes('bigger') || lower.includes('smaller') || 
                          lower.includes('larger') || lower.includes('can you make') ||
                          (lower.includes('this') && !lower.includes('create'));
    
    if (isModification) {
      // Find target object
      let targetId = this.selectedObjectId || this.lastMentionedObjects[0];
      
      // Try to find by type if mentioned
      if (!targetId) {
        if (lower.includes('circle') || lower.includes('ball')) {
          const obj = info.objects.find(o => o.type === 'circle');
          if (obj) targetId = obj.id;
        } else if (lower.includes('triangle')) {
          const obj = info.objects.find(o => o.type === 'triangle');
          if (obj) targetId = obj.id;
        } else if (lower.includes('rectangle') || lower.includes('square')) {
          const obj = info.objects.find(o => o.type === 'rectangle');
          if (obj) targetId = obj.id;
        }
      }
      
      // If still no target but only 1 object, use it
      if (!targetId && info.total === 1) {
        targetId = info.objects[0].id;
      }
      
      if (targetId) {
        if (lower.includes('bigger') || lower.includes('larger')) {
          this.executeAction('scaleObject', { objectId: targetId, scale: 1.5 });
          return 'Made it bigger!';
        }
        if (lower.includes('smaller')) {
          this.executeAction('scaleObject', { objectId: targetId, scale: 0.7 });
          return 'Made it smaller!';
        }
        
        // Mass/weight changes
        if (lower.includes('heavier') || lower.includes('heavy')) {
          this.executeAction('setMass', { objectId: targetId, mass: 5 });
          return 'Made it heavier! It will push lighter objects around.';
        }
        if (lower.includes('lighter') || lower.includes('light')) {
          this.executeAction('setMass', { objectId: targetId, mass: 0.2 });
          return 'Made it lighter! It will be pushed around by heavier objects.';
        }
        
        // Material changes
        if (lower.includes('rubber') || lower.includes('bouncy')) {
          this.executeAction('setMaterial', { objectId: targetId, material: 'rubber' });
          return 'Made it bouncy like rubber!';
        }
        if (lower.includes('metal') || lower.includes('iron') || lower.includes('steel')) {
          this.executeAction('setMaterial', { objectId: targetId, material: 'metal' });
          return 'Made it heavy like metal!';
        }
        if (lower.includes('ice') || lower.includes('slippery')) {
          this.executeAction('setMaterial', { objectId: targetId, material: 'ice' });
          return 'Made it slippery like ice!';
        }
        if (lower.includes('foam') || lower.includes('floaty')) {
          this.executeAction('setMaterial', { objectId: targetId, material: 'foam' });
          return 'Made it light like foam!';
        }
        if (lower.includes('wood') || lower.includes('wooden')) {
          this.executeAction('setMaterial', { objectId: targetId, material: 'wood' });
          return 'Made it feel like wood!';
        }
        if (lower.includes('stone') || lower.includes('rock')) {
          this.executeAction('setMaterial', { objectId: targetId, material: 'stone' });
          return 'Made it solid like stone!';
        }
        
        // Color change
        for (const color of Object.keys(COLORS)) {
          if (lower.includes(color)) {
            this.executeAction('setColor', { objectId: targetId, color });
            return `Changed it to ${color}!`;
          }
        }
        
        if (lower.includes('delete') || lower.includes('remove')) {
          this.executeAction('removeObject', { objectId: targetId });
          return 'Removed it!';
        }
      } else {
        return 'I don\'t see an object to modify. Try pointing at one or create something first!';
      }
    }
    
    // Only consider creation if user explicitly wants to create (not "this ball", "the ball", etc.)
    const wantsCreation = lower.includes('create') || lower.includes('add') || 
                          lower.includes('spawn') || lower.includes('make a') ||
                          lower.includes('make me a') || lower.includes('give me');
    
    // Check for shape words but ONLY if not referring to existing object
    const refersToExisting = lower.includes('this') || lower.includes('that') || 
                             lower.includes('the ') || lower.includes('it');
    
    if (!refersToExisting || wantsCreation) {
      // Creation intent
      const shapes = ['ball', 'circle', 'triangle', 'hexagon', 'star', 'rectangle', 'square'];
      for (const shape of shapes) {
        if (lower.includes(shape) && (wantsCreation || (!refersToExisting && !isQuestion))) {
          const count = this.extractNumber(lower);
          const color = this.extractColor(lower);
          
          if (count && count > 1) {
            this.executeAction('createMultiple', { count, shape, color: color || 'random' });
            return `Created ${count} ${color || 'colorful'} ${shape}s!`;
          } else {
            const actionName = shape === 'ball' || shape === 'circle' ? 'createBall' :
                              shape === 'triangle' ? 'createTriangle' :
                              shape === 'hexagon' ? 'createHexagon' :
                              shape === 'star' ? 'createStar' : 'createRectangle';
            this.executeAction(actionName, { color: color || 'blue' });
            return `Created a ${color || 'blue'} ${shape}!`;
          }
        }
      }
    }
    
    // Queries
    if (lower.includes('how many') || lower.includes('count')) {
      const color = this.extractColor(lower);
      if (color && info.byColor[color]) {
        return `There ${info.byColor[color] === 1 ? 'is' : 'are'} ${info.byColor[color]} ${color} object${info.byColor[color] === 1 ? '' : 's'}.`;
      }
      return `There ${info.total === 1 ? 'is' : 'are'} ${info.total} object${info.total === 1 ? '' : 's'} on screen.`;
    }
    
    // Physics
    if (lower.includes('gravity')) {
      if (lower.includes('off') || lower.includes('disable') || lower.includes('no')) {
        this.executeAction('setGravity', { strength: 0 });
        return 'Gravity disabled!';
      }
      this.executeAction('setGravity', { direction: 'down', strength: 1 });
      return 'Gravity enabled!';
    }
    
    if (lower.includes('clear') || lower.includes('reset')) {
      this.executeAction('removeAll', {});
      return 'Cleared everything!';
    }
    
    return 'I\'m not sure what you mean. Try "create a ball", "make it bigger", or "how many objects?"';
  }

  private extractNumber(text: string): number | null {
    const words: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10
    };
    for (const [word, num] of Object.entries(words)) {
      if (text.includes(word)) return num;
    }
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

  private extractColor(text: string): string | null {
    for (const color of Object.keys(COLORS)) {
      if (text.includes(color)) return color;
    }
    return null;
  }

  isReady(): boolean {
    return this.openai !== null;
  }
}
