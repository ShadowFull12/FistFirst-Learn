/**
 * Voice Manager - Speech recognition and synthesis
 * Improved version with better browser compatibility and error handling
 */

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: any) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onaudioend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export class VoiceManager {
  private recognition: SpeechRecognition | null = null;
  private synthesis: SpeechSynthesis;
  private isListening: boolean = false;
  private shouldRestart: boolean = false;
  private onTranscript: ((text: string, isFinal: boolean) => void) | null = null;
  private onListeningChange: ((listening: boolean) => void) | null = null;
  private voiceBtn: HTMLButtonElement | null = null;
  private statusElement: HTMLElement | null = null;
  private restartAttempts: number = 0;
  private maxRestartAttempts: number = 3;
  private lastTranscript: string = '';

  constructor() {
    this.synthesis = window.speechSynthesis;
    this.initRecognition();
  }

  private initRecognition(): void {
    // Check for browser support
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognitionClass) {
      console.warn('❌ Speech recognition not supported in this browser');
      console.warn('Please use Chrome, Edge, or Safari for voice features');
      return;
    }

    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;  // Keep listening
      this.recognition.interimResults = true;  // Show partial results
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Get the latest result
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          
          if (result.isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        // Handle final transcript
        if (finalTranscript) {
          console.log('🎤 Final:', finalTranscript);
          this.updateStatus(`"${finalTranscript}"`);
          this.lastTranscript = finalTranscript;
          
          if (this.onTranscript) {
            this.onTranscript(finalTranscript, true);
          }
        } else if (interimTranscript) {
          // Show interim results
          console.log('🎤 Hearing:', interimTranscript);
          this.updateStatus(`Hearing: "${interimTranscript}"...`);
          
          if (this.onTranscript) {
            this.onTranscript(interimTranscript, false);
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        console.error('🎤 Speech recognition error:', event.error);
        
        switch (event.error) {
          case 'no-speech':
            this.updateStatus('No speech detected. Speak louder or closer to mic.');
            // Don't stop, keep listening
            break;
          case 'audio-capture':
            this.updateStatus('No microphone found. Check your audio settings.');
            this.stopListening();
            break;
          case 'not-allowed':
            this.updateStatus('Microphone access denied. Please allow microphone access.');
            this.stopListening();
            break;
          case 'network':
            this.updateStatus('Network error. Check your connection.');
            // Try to restart
            if (this.restartAttempts < this.maxRestartAttempts) {
              setTimeout(() => this.tryRestart(), 1000);
            }
            break;
          case 'aborted':
            // User aborted, don't show error
            break;
          default:
            this.updateStatus(`Voice error: ${event.error}`);
            if (this.restartAttempts < this.maxRestartAttempts) {
              setTimeout(() => this.tryRestart(), 1000);
            }
        }
      };

      this.recognition.onend = () => {
        console.log('🎤 Recognition ended, shouldRestart:', this.shouldRestart);
        
        if (this.shouldRestart && this.isListening) {
          // Auto-restart for continuous listening
          this.tryRestart();
        } else {
          this.setListening(false);
        }
      };

      this.recognition.onstart = () => {
        console.log('🎤 Recognition started');
        this.restartAttempts = 0;
        this.updateStatus('🎤 Listening... Speak now!');
      };

      this.recognition.onaudiostart = () => {
        console.log('🎤 Audio capture started');
      };

      console.log('✅ Speech recognition initialized');
    } catch (error) {
      console.error('Failed to initialize speech recognition:', error);
      this.recognition = null;
    }
  }

  private tryRestart(): void {
    if (!this.recognition || !this.shouldRestart) return;
    
    this.restartAttempts++;
    console.log(`🔄 Restarting recognition (attempt ${this.restartAttempts})`);
    
    try {
      setTimeout(() => {
        if (this.shouldRestart && this.recognition) {
          this.recognition.start();
        }
      }, 100);
    } catch (error) {
      console.error('Failed to restart recognition:', error);
      if (this.restartAttempts >= this.maxRestartAttempts) {
        this.updateStatus('Voice recognition stopped. Click mic to restart.');
        this.setListening(false);
      }
    }
  }

  setElements(voiceBtn: HTMLButtonElement, statusElement: HTMLElement): void {
    this.voiceBtn = voiceBtn;
    this.statusElement = statusElement;
  }

  setOnTranscript(callback: (text: string, isFinal: boolean) => void): void {
    this.onTranscript = callback;
  }

  setOnListeningChange(callback: (listening: boolean) => void): void {
    this.onListeningChange = callback;
  }

  toggleListening(): void {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  startListening(): void {
    if (!this.recognition) {
      this.updateStatus('⚠️ Speech not supported. Use Chrome or Edge.');
      console.error('Speech recognition not available');
      return;
    }

    if (this.isListening) {
      console.log('Already listening');
      return;
    }

    // Request microphone permission explicitly
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        console.log('🎤 Microphone access granted');
        this.shouldRestart = true;
        this.restartAttempts = 0;
        
        try {
          this.recognition!.start();
          this.setListening(true);
          console.log('🎤 Started listening');
        } catch (error: any) {
          // If already started, that's okay
          if (error.name === 'InvalidStateError') {
            console.log('Recognition already active');
            this.setListening(true);
          } else {
            console.error('Failed to start recognition:', error);
            this.updateStatus('Failed to start voice input. Try again.');
          }
        }
      })
      .catch((error) => {
        console.error('Microphone access denied:', error);
        this.updateStatus('🎤 Please allow microphone access');
      });
  }

  stopListening(): void {
    console.log('🎤 Stopping listening');
    this.shouldRestart = false;
    this.isListening = false;
    
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore errors when stopping
      }
    }
    
    this.setListening(false);
    this.updateStatus('');
  }

  private setListening(listening: boolean): void {
    this.isListening = listening;
    this.shouldRestart = listening;
    
    if (this.voiceBtn) {
      this.voiceBtn.classList.toggle('listening', listening);
      // Update button visual feedback
      if (listening) {
        this.voiceBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        this.voiceBtn.style.animation = 'pulse 1s ease-in-out infinite';
      } else {
        this.voiceBtn.style.background = '';
        this.voiceBtn.style.animation = '';
      }
    }
    
    if (!listening) {
      setTimeout(() => {
        if (!this.isListening) {
          this.updateStatus('');
        }
      }, 3000);
    }
    
    this.onListeningChange?.(listening);
  }

  private updateStatus(text: string): void {
    if (this.statusElement) {
      this.statusElement.textContent = text;
    }
  }

  speak(text: string, onEnd?: () => void): void {
    // Cancel any ongoing speech
    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;

    // Try to use a natural-sounding voice
    const voices = this.synthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Neural'))
    ) || voices.find(v => v.lang.startsWith('en'));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => {
      onEnd?.();
    };

    this.synthesis.speak(utterance);
  }

  stopSpeaking(): void {
    this.synthesis.cancel();
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }

  isSpeaking(): boolean {
    return this.synthesis.speaking;
  }

  destroy(): void {
    this.stopListening();
    this.stopSpeaking();
  }
}
