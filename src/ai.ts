import OpenAI from 'openai';
import { PhysicsEngine } from './physics';
import { UIManager } from './uiManager';

// OpenRouter configuration for GLM 4.5 AIR (free)
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = 'z-ai/glm-4.5-air:free';

// Color palette for objects
const COLORS = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  white: '#ffffff',
  black: '#1a1a1a',
  gray: '#6b7280'
};

// Note: We use text-based action parsing with GLM 4.5 AIR instead of function calling
// The AI responds with ```action {...} ``` blocks that we parse and execute

const SYSTEM_PROMPT = `You are the AI assistant for FistFirst Learn, an interactive AR physics sandbox for hands-on learning. You help users explore physics concepts through hand tracking interactions.

IMPORTANT: When users give commands, you MUST respond with a JSON action block in this exact format, followed by a brief message:

\`\`\`action
{"function": "functionName", "params": {param1: value1, ...}}
\`\`\`

Available functions:
- createBall: params {x: 0-100, y: 0-100, radius: 10-100, color: "red"|"blue"|"green"|"yellow"|"purple"|"orange"|"pink", bounciness: 0-1}
- createRectangle: params {x: 0-100, y: 0-100, width: 20-200, height: 20-200, color: string}
- setGravity: params {strength: 0-3, direction: "down"|"up"|"left"|"right"}
- enableBoundaries: params {enable: true|false}
- enableHandCollision: params {enable: true|false}
- setBounciness: params {value: 0-1}
- setMagnetic: params {enable: true|false}  -- magnetic attraction pulls balls toward your hands
- recallBalls: params {}  -- pulls all balls toward center of screen
- createSlider: params {x: 0-100, y: 0-100, label: string, controls: "gravity"|"bounciness"|"friction"}
- createCounter: params {x: 0-100, y: 0-100, label: string, tracks: "speed"|"objectCount"|"fps"}
- createMultipleBalls: params {count: 1-20, color: "random"|color, size: "small"|"medium"|"large"|"random"}
- clearAll: params {}
- resetEverything: params {}

Examples:
User: "Create a red ball"
Response: \`\`\`action
{"function": "createBall", "params": {"color": "red"}}
\`\`\`
Done! I created a red ball for you.

User: "Add gravity"
Response: \`\`\`action
{"function": "setGravity", "params": {"strength": 1, "direction": "down"}}
\`\`\`
Gravity enabled! Objects will now fall.

User: "Bring the balls back"
Response: \`\`\`action
{"function": "recallBalls", "params": {}}
\`\`\`
Balls recalled to center!

Keep responses brief (1-2 sentences after the action block).`;

export class AIAssistant {
  private openai: OpenAI | null = null;
  private physics: PhysicsEngine;
  private uiManager: UIManager;
  private conversationHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  private onMessage: ((message: string, isUser: boolean) => void) | null = null;
  private isProcessing: boolean = false;

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
      // Use OpenRouter API with GLM 4.5 AIR model
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

  async processCommand(userMessage: string): Promise<string> {
    if (this.isProcessing) {
      return 'Please wait, still processing previous command...';
    }

    this.isProcessing = true;
    this.onMessage?.(userMessage, true);

    try {
      // If no OpenAI, use fallback command parsing
      if (!this.openai) {
        const response = this.fallbackCommandParser(userMessage);
        this.onMessage?.(response, false);
        return response;
      }

      // Add user message to history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Call OpenRouter with GLM 4.5 AIR model (using text-based action parsing)
      const response = await this.openai.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...this.conversationHistory.slice(-10) // Keep last 10 messages for context
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      const message = response.choices[0].message;
      let responseText = message.content || '';
      
      // Parse action block from response
      const actionMatch = responseText.match(/```action\s*([\s\S]*?)```/);
      
      if (actionMatch) {
        try {
          const actionJson = JSON.parse(actionMatch[1].trim());
          const functionName = actionJson.function;
          const params = actionJson.params || {};
          
          // Execute the function
          const result = this.executeFunction(functionName, params);
          console.log(`AI executed: ${functionName}`, result);
          
          // Remove the action block from displayed response
          responseText = responseText.replace(/```action\s*[\s\S]*?```\s*/g, '').trim();
          
          if (!responseText) {
            responseText = result.message;
          }
        } catch (parseError) {
          console.error('Failed to parse action JSON:', parseError);
          // Fall back to text parsing
          this.fallbackCommandParser(userMessage);
        }
      } else {
        // No action block found - try fallback parser on original user message
        const fallbackResponse = this.fallbackCommandParser(userMessage);
        if (fallbackResponse.includes('not sure')) {
          // AI didn't provide action and fallback didn't understand - use AI's text response
        } else {
          // Fallback did something - combine responses
          responseText = responseText || fallbackResponse;
        }
      }

      this.conversationHistory.push({ role: 'assistant', content: responseText });
      this.onMessage?.(responseText, false);
      
      return responseText;
    } catch (error) {
      console.error('AI processing error:', error);
      const fallbackResponse = this.fallbackCommandParser(userMessage);
      this.onMessage?.(fallbackResponse, false);
      return fallbackResponse;
    } finally {
      this.isProcessing = false;
    }
  }

  private executeFunction(name: string, args: any): { success: boolean; message: string; data?: any } {
    console.log(`Executing function: ${name}`, args);

    try {
      switch (name) {
        case 'createBall': {
          const x = ((args.x ?? 50) / 100) * this.physics['renderer'].width;
          const y = ((args.y ?? 30) / 100) * this.physics['renderer'].height;
          const radius = Math.max(10, Math.min(100, args.radius ?? 30));
          const color = COLORS[args.color as keyof typeof COLORS] || COLORS.blue;
          
          const ball = this.physics.createBall(x, y, radius, color, {
            restitution: args.bounciness ?? 0.8
          });
          
          return { success: true, message: `Created a ${args.color || 'blue'} ball`, data: { id: ball.id } };
        }

        case 'createRectangle': {
          const x = ((args.x ?? 50) / 100) * this.physics['renderer'].width;
          const y = ((args.y ?? 50) / 100) * this.physics['renderer'].height;
          const width = Math.max(20, Math.min(200, args.width ?? 60));
          const height = Math.max(20, Math.min(200, args.height ?? 60));
          const color = COLORS[args.color as keyof typeof COLORS] || COLORS.green;
          
          this.physics.createRectangle(x, y, width, height, color);
          return { success: true, message: 'Created a rectangle' };
        }

        case 'setGravity': {
          const strength = Math.max(0, Math.min(3, args.strength ?? 1));
          let x = 0, y = 0;
          
          switch (args.direction) {
            case 'up': y = -strength; break;
            case 'left': x = -strength; break;
            case 'right': x = strength; break;
            default: y = strength; // down
          }
          
          this.physics.setGravity(x, y);
          return { success: true, message: `Gravity set to ${strength} ${args.direction || 'down'}` };
        }

        case 'enableBoundaries': {
          if (args.enable) {
            this.physics.enableBoundaries();
            return { success: true, message: 'Screen boundaries enabled' };
          } else {
            this.physics.disableBoundaries();
            return { success: true, message: 'Screen boundaries disabled' };
          }
        }

        case 'enableHandCollision': {
          if (args.enable) {
            this.physics.enableHandCollision();
            return { success: true, message: 'Hand collision enabled - you can now interact with objects!' };
          } else {
            this.physics.disableHandCollision();
            return { success: true, message: 'Hand collision disabled' };
          }
        }

        case 'setBounciness': {
          const value = Math.max(0, Math.min(1, args.value));
          this.physics.setAllBounciness(value);
          return { success: true, message: `Bounciness set to ${value}` };
        }

        case 'setMagnetic': {
          this.physics.setMagneticAttraction(args.enable !== false);
          return { success: true, message: args.enable !== false ? 'Magnetic attraction enabled - balls are drawn to your hands!' : 'Magnetic attraction disabled' };
        }

        case 'recallBalls': {
          this.physics.recallBalls();
          return { success: true, message: 'Recalled all balls to center!' };
        }

        case 'createSlider': {
          const x = ((args.x ?? 10) / 100) * window.innerWidth;
          const y = ((args.y ?? 10) / 100) * window.innerHeight;
          
          this.uiManager.createSlider(
            x, y,
            args.label,
            args.controls,
            args.min ?? 0,
            args.max ?? 1
          );
          return { success: true, message: `Created ${args.label} slider` };
        }

        case 'createCounter': {
          const x = ((args.x ?? 80) / 100) * window.innerWidth;
          const y = ((args.y ?? 10) / 100) * window.innerHeight;
          
          this.uiManager.createCounter(x, y, args.label, args.tracks);
          return { success: true, message: `Created ${args.label} tracker` };
        }

        case 'clearAll': {
          this.physics.clearAllObjects();
          return { success: true, message: 'All objects cleared' };
        }

        case 'clearUI': {
          this.uiManager.clearAll();
          return { success: true, message: 'UI elements cleared' };
        }

        case 'resetEverything': {
          this.physics.clearAllObjects();
          this.physics.disableGravity();
          this.physics.disableBoundaries();
          this.physics.disableHandCollision();
          this.uiManager.clearAll();
          return { success: true, message: 'Everything reset to default' };
        }

        case 'createMultipleBalls': {
          const count = Math.max(1, Math.min(20, args.count));
          const colorKeys = Object.keys(COLORS);
          const sizes = { small: 15, medium: 30, large: 50, random: 0 };
          
          for (let i = 0; i < count; i++) {
            const x = Math.random() * this.physics['renderer'].width * 0.8 + this.physics['renderer'].width * 0.1;
            const y = Math.random() * this.physics['renderer'].height * 0.5 + this.physics['renderer'].height * 0.1;
            
            let color: string;
            if (args.color === 'random' || !args.color) {
              color = COLORS[colorKeys[Math.floor(Math.random() * colorKeys.length)] as keyof typeof COLORS];
            } else {
              color = COLORS[args.color as keyof typeof COLORS] || COLORS.blue;
            }
            
            let radius: number;
            if (args.size === 'random' || !args.size) {
              radius = Math.random() * 30 + 15;
            } else {
              radius = sizes[args.size as keyof typeof sizes] || 30;
            }
            
            this.physics.createBall(x, y, radius, color);
          }
          
          return { success: true, message: `Created ${count} balls` };
        }

        default:
          return { success: false, message: `Unknown function: ${name}` };
      }
    } catch (error) {
      console.error(`Error executing ${name}:`, error);
      return { success: false, message: `Failed to execute ${name}` };
    }
  }

  private fallbackCommandParser(input: string): string {
    const lower = input.toLowerCase();

    // Ball creation
    if (lower.includes('ball') || lower.includes('circle') || lower.includes('sphere')) {
      const color = this.extractColor(lower);
      const count = this.extractNumber(lower) || 1;
      
      if (count > 1) {
        this.executeFunction('createMultipleBalls', { count, color: color || 'random' });
        return `Created ${count} ${color || 'colorful'} balls!`;
      } else {
        this.executeFunction('createBall', { color: color || 'blue' });
        return `Created a ${color || 'blue'} ball! Try saying "add gravity" next.`;
      }
    }

    // Rectangle creation
    if (lower.includes('rectangle') || lower.includes('box') || lower.includes('square')) {
      const color = this.extractColor(lower);
      this.executeFunction('createRectangle', { color: color || 'green' });
      return `Created a ${color || 'green'} rectangle!`;
    }

    // Gravity
    if (lower.includes('gravity')) {
      if (lower.includes('off') || lower.includes('disable') || lower.includes('remove') || lower.includes('no')) {
        this.executeFunction('setGravity', { strength: 0 });
        return 'Gravity disabled - objects now float freely!';
      } else {
        const strength = this.extractNumber(lower) || 1;
        this.executeFunction('setGravity', { strength, direction: 'down' });
        return `Gravity enabled! Objects will now fall ${strength > 1 ? 'faster' : 'naturally'}.`;
      }
    }

    // Boundaries
    if (lower.includes('boundar') || lower.includes('wall') || lower.includes('edge')) {
      if (lower.includes('off') || lower.includes('disable') || lower.includes('remove')) {
        this.executeFunction('enableBoundaries', { enable: false });
        return 'Boundaries removed - objects can now leave the screen.';
      } else {
        this.executeFunction('enableBoundaries', { enable: true });
        return 'Boundaries enabled! Objects will bounce off the screen edges.';
      }
    }

    // Hand collision
    if (lower.includes('hand') && (lower.includes('collid') || lower.includes('interact') || lower.includes('touch'))) {
      if (lower.includes('off') || lower.includes('disable')) {
        this.executeFunction('enableHandCollision', { enable: false });
        return 'Hand collision disabled.';
      } else {
        this.executeFunction('enableHandCollision', { enable: true });
        return 'Your hands can now push and grab objects! Try pinching to grab.';
      }
    }

    // Sliders
    if (lower.includes('slider')) {
      if (lower.includes('gravity')) {
        this.executeFunction('createSlider', { label: 'Gravity', controls: 'gravity', min: 0, max: 2 });
        return 'Added a gravity slider!';
      } else if (lower.includes('bounc')) {
        this.executeFunction('createSlider', { label: 'Bounciness', controls: 'bounciness', min: 0, max: 1 });
        return 'Added a bounciness slider!';
      } else if (lower.includes('friction')) {
        this.executeFunction('createSlider', { label: 'Friction', controls: 'friction', min: 0, max: 1 });
        return 'Added a friction slider!';
      } else {
        this.executeFunction('createSlider', { label: 'Gravity', controls: 'gravity', min: 0, max: 2 });
        return 'Added a gravity slider. Try dragging it!';
      }
    }

    // Counters/trackers
    if (lower.includes('speed') || lower.includes('velocity') || lower.includes('tracker')) {
      this.executeFunction('createCounter', { label: 'Speed', tracks: 'speed' });
      return 'Added a speed tracker!';
    }

    if (lower.includes('fps') || lower.includes('frame')) {
      this.executeFunction('createCounter', { label: 'FPS', tracks: 'fps' });
      return 'Added an FPS counter!';
    }

    if (lower.includes('count') && lower.includes('object')) {
      this.executeFunction('createCounter', { label: 'Objects', tracks: 'objectCount' });
      return 'Added an object counter!';
    }

    // Clear/reset
    if (lower.includes('clear') || lower.includes('reset') || lower.includes('remove all')) {
      if (lower.includes('ui') || lower.includes('slider') || lower.includes('counter')) {
        this.executeFunction('clearUI', {});
        return 'UI elements cleared!';
      } else if (lower.includes('everything') || lower.includes('all')) {
        this.executeFunction('resetEverything', {});
        return 'Everything reset! Fresh start.';
      } else {
        this.executeFunction('clearAll', {});
        return 'All objects cleared!';
      }
    }

    // Bounciness
    if (lower.includes('bounc')) {
      const value = this.extractNumber(lower);
      if (value !== null) {
        this.executeFunction('setBounciness', { value: value > 1 ? value / 100 : value });
        return `Bounciness set to ${value > 1 ? value + '%' : value}!`;
      } else if (lower.includes('more') || lower.includes('increase')) {
        this.executeFunction('setBounciness', { value: 0.95 });
        return 'Objects are now super bouncy!';
      }
    }

    // Help
    if (lower.includes('help') || lower.includes('what can')) {
      return 'Try: "create a ball", "add gravity", "recall balls", "turn on magnetic", or "make my hand collidable"!';
    }

    // Recall balls
    if (lower.includes('recall') || lower.includes('bring back') || lower.includes('get balls') || lower.includes('come here')) {
      this.executeFunction('recallBalls', {});
      return 'Recalling all balls to center! They should float back up now.';
    }

    // Magnetic attraction
    if (lower.includes('magnet')) {
      if (lower.includes('off') || lower.includes('disable')) {
        this.executeFunction('setMagnetic', { enable: false });
        return 'Magnetic attraction disabled.';
      } else {
        this.executeFunction('setMagnetic', { enable: true });
        return 'Magnetic attraction enabled! Balls will be drawn toward your hands.';
      }
    }

    // Default response
    return `I'm not sure how to do that. Try commands like "create a ball", "add gravity", "recall balls", or "turn on magnetic". Say "help" for more options!`;
  }

  private extractColor(text: string): string | null {
    const colors = Object.keys(COLORS);
    for (const color of colors) {
      if (text.includes(color)) return color;
    }
    return null;
  }

  private extractNumber(text: string): number | null {
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

  isReady(): boolean {
    return this.openai !== null;
  }
}
