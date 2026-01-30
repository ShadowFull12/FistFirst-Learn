import { WebcamManager } from './webcam';
import { CanvasRenderer } from './renderer';
import { HandTracker, HandData } from './handTracking';
import { PhysicsEngine } from './physics';
import { AIAssistant } from './ai';
import { VoiceManager } from './voice';
import { UIManager } from './uiManager';
import { PlayingField } from './playingField';

/**
 * FistFirst Learn - AR Physics Sandbox
 * 
 * Interactive learning through hands-on physics:
 * - Webcam-based AR background
 * - Hand tracking for physical interactions
 * - AI assistant for natural language commands
 * - Dynamic physics simulation
 * - Real-time UI element creation
 * - Moveable playing field (palm gesture to move)
 */
class ARPlayground {
  // Core components
  private webcam: WebcamManager;
  private renderer: CanvasRenderer;
  private handTracker: HandTracker;
  private physics: PhysicsEngine;
  private ai: AIAssistant;
  private voice: VoiceManager;
  private uiManager: UIManager;
  private playingField: PlayingField;

  // DOM Elements
  private videoElement: HTMLVideoElement;
  private physicsCanvas: HTMLCanvasElement;
  private handCanvas: HTMLCanvasElement;
  private uiLayer: HTMLElement;
  private chatMessages: HTMLElement;
  private chatInput: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private voiceBtn: HTMLButtonElement;
  private voiceStatus: HTMLElement;
  private startOverlay: HTMLElement;
  private startBtn: HTMLButtonElement;
  private recallBtn: HTMLButtonElement;

  // Game loop
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private animationFrameId: number = 0;
  private lastHands: HandData[] = [];

  constructor() {
    // Get DOM elements
    this.videoElement = document.getElementById('webcam') as HTMLVideoElement;
    this.physicsCanvas = document.getElementById('physics-canvas') as HTMLCanvasElement;
    this.handCanvas = document.getElementById('hand-canvas') as HTMLCanvasElement;
    this.uiLayer = document.getElementById('ui-layer') as HTMLElement;
    this.chatMessages = document.getElementById('chat-messages') as HTMLElement;
    this.chatInput = document.getElementById('chat-input') as HTMLInputElement;
    this.sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
    this.voiceBtn = document.getElementById('voice-btn') as HTMLButtonElement;
    this.voiceStatus = document.getElementById('voice-status') as HTMLElement;
    this.startOverlay = document.getElementById('start-overlay') as HTMLElement;
    this.startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    this.recallBtn = document.getElementById('recall-btn') as HTMLButtonElement;

    // Initialize components
    this.webcam = new WebcamManager(this.videoElement);
    this.renderer = new CanvasRenderer(this.physicsCanvas, this.handCanvas);
    this.handTracker = new HandTracker(this.renderer);
    this.physics = new PhysicsEngine(this.renderer);
    this.uiManager = new UIManager(this.uiLayer, this.physics);
    this.ai = new AIAssistant(this.physics, this.uiManager);
    this.voice = new VoiceManager();
    this.playingField = new PlayingField(window.innerWidth, window.innerHeight);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Start button
    this.startBtn.addEventListener('click', () => this.start());

    // Chat input
    this.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && this.chatInput.value.trim()) {
        this.handleUserInput(this.chatInput.value.trim());
        this.chatInput.value = '';
      }
    });

    this.sendBtn.addEventListener('click', () => {
      if (this.chatInput.value.trim()) {
        this.handleUserInput(this.chatInput.value.trim());
        this.chatInput.value = '';
      }
    });

    // Voice button
    this.voiceBtn.addEventListener('click', () => {
      this.voice.toggleListening();
    });

    // Recall button - brings all balls back to center
    this.recallBtn.addEventListener('click', () => {
      this.physics.recallBalls();
    });

    // Voice callbacks
    this.voice.setElements(this.voiceBtn, this.voiceStatus);
    this.voice.setOnTranscript((text, isFinal) => {
      if (isFinal && text.trim()) {
        this.handleUserInput(text.trim());
      }
    });

    // AI message callback
    this.ai.setOnMessage((message, isUser) => {
      this.addChatMessage(message, isUser);
      if (!isUser) {
        // Optionally speak AI responses
        // this.voice.speak(message);
      }
    });

    // Instructions panel toggle
    const toggleBtn = document.getElementById('toggle-instructions');
    const instructionsContent = document.getElementById('instructions-content');
    toggleBtn?.addEventListener('click', () => {
      instructionsContent?.classList.toggle('hidden');
    });

    // Window resize
    window.addEventListener('resize', () => this.handleResize());

    // Hand detection callback for physics
    this.handTracker.setOnHandsDetected((hands: HandData[]) => {
      this.physics.updateHandBodies(hands);
    });

    // Playing field bounds change callback
    this.playingField.setOnBoundsChanged((bounds) => {
      this.physics.setPlayingFieldBounds(bounds);
    });

    // Boundaries change callback - show/hide playing field visual
    this.physics.setOnBoundariesChanged((enabled) => {
      this.playingField.setVisible(enabled);
      console.log(`Playing field ${enabled ? 'shown' : 'hidden'} (boundaries ${enabled ? 'enabled' : 'disabled'})`);
    });
  }

  async start(): Promise<void> {
    try {
      // Initialize AI with OpenRouter API key from environment variable
      const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || '';
      if (!apiKey) {
        console.warn('⚠️ No API key found. Set VITE_OPENROUTER_API_KEY in .env file');
        console.warn('AI will use offline fallback mode');
      }
      this.ai.initialize(apiKey);

      // Start webcam
      this.startBtn.textContent = 'Starting webcam...';
      await this.webcam.start();

      // Resize canvases to match video
      this.handleResize();

      // Initialize playing field at 80% of screen (sets physics boundaries)
      this.playingField.resetToDefault();
      this.physics.setPlayingFieldBounds(this.playingField.getBounds());

      // Initialize hand tracking
      this.startBtn.textContent = 'Loading hand tracking...';
      await this.handTracker.initialize();

      // Hide start overlay
      this.startOverlay.classList.add('hidden');

      // Create initial demo ball in center of playing field
      const fieldBounds = this.playingField.getBounds();
      const centerX = fieldBounds.x + fieldBounds.width / 2;
      const centerY = fieldBounds.y + fieldBounds.height / 3;
      this.physics.createBall(centerX, centerY, 35, '#3b82f6');

      // Start game loop
      this.isRunning = true;
      this.lastTime = performance.now();
      this.gameLoop(this.lastTime);

      // Show welcome message
      this.addChatMessage(
        '✊ FistFirst Learn Ready! Try: "Create 5 rainbow triangles", "How many balls?", or point and say "Put a star here!"',
        false
      );

      console.log('FistFirst Learn started!');
    } catch (error) {
      console.error('Failed to start:', error);
      this.startBtn.textContent = 'Start Experience';
      alert('Failed to start: ' + (error as Error).message);
    }
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.resize(width, height);
    // Resize playing field and update physics boundaries
    this.playingField.resize(width, height);
    this.physics.setPlayingFieldBounds(this.playingField.getBounds());
  }

  private gameLoop(currentTime: number): void {
    if (!this.isRunning) return;

    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Limit delta time to prevent physics explosions
    const clampedDelta = Math.min(deltaTime, 50);

    // Update hand tracking
    if (this.webcam.isReady()) {
      const hands = this.handTracker.detect(
        this.webcam.getVideoElement(),
        currentTime
      );
      this.lastHands = hands;
      this.handTracker.render(hands);
      
      // Update magnetic attraction with hand positions
      this.physics.updateHandPositionsForMagnet(hands);
      
      // Update AI with hand data for pointing detection
      this.ai.updateHands(hands);
      
      // Update playing field with hand gestures
      this.playingField.update(hands, currentTime);
    }

    // Update physics
    this.physics.update(clampedDelta);
    this.physics.render();
    
    // Render playing field (on physics canvas)
    const ctx = this.physicsCanvas.getContext('2d');
    if (ctx) {
      this.playingField.render(ctx);
    }

    // Update UI counters
    this.uiManager.update();

    // Request next frame
    this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  private async handleUserInput(input: string): Promise<void> {
    // First, add the user's message to chat
    this.addChatMessage(input, true);
    
    // Then show thinking animation (appears after user message)
    const thinkingEl = this.showThinkingAnimation();
    
    try {
      await this.ai.processCommand(input);
    } finally {
      // Remove thinking animation
      this.removeThinkingAnimation(thinkingEl);
    }
  }

  private showThinkingAnimation(): HTMLElement {
    const thinkingEl = document.createElement('div');
    thinkingEl.className = 'chat-message assistant thinking';
    thinkingEl.innerHTML = `
      <span class="thinking-text">Thinking</span>
      <span class="thinking-dots">
        <span class="dot">.</span>
        <span class="dot">.</span>
        <span class="dot">.</span>
      </span>
    `;
    // Append at the end (after the user's message)
    this.chatMessages.appendChild(thinkingEl);
    // Scroll to show the thinking animation
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    return thinkingEl;
  }

  private removeThinkingAnimation(thinkingEl: HTMLElement): void {
    if (thinkingEl && thinkingEl.parentNode) {
      thinkingEl.parentNode.removeChild(thinkingEl);
    }
  }

  private addChatMessage(message: string, isUser: boolean): void {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${isUser ? 'user' : 'assistant'}`;
    messageEl.textContent = message;
    this.chatMessages.appendChild(messageEl);
    
    // Scroll to bottom
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

    // Remove old messages if too many
    while (this.chatMessages.children.length > 20) {
      this.chatMessages.removeChild(this.chatMessages.firstChild!);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.webcam.stop();
    this.handTracker.destroy();
    this.physics.destroy();
    this.voice.destroy();
  }
}

// Initialize the application
const app = new ARPlayground();

// Expose for debugging
(window as any).arPlayground = app;
