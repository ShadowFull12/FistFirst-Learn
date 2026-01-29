/**
 * Voice Manager - Speech recognition and synthesis
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
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: any) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
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
  private onTranscript: ((text: string, isFinal: boolean) => void) | null = null;
  private onListeningChange: ((listening: boolean) => void) | null = null;
  private voiceBtn: HTMLButtonElement | null = null;
  private statusElement: HTMLElement | null = null;

  constructor() {
    this.synthesis = window.speechSynthesis;
    this.initRecognition();
  }

  private initRecognition(): void {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognitionClass) {
      console.warn('Speech recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;
      
      this.updateStatus(isFinal ? `"${transcript}"` : `Hearing: "${transcript}"...`);
      
      if (this.onTranscript) {
        this.onTranscript(transcript, isFinal);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.setListening(false);
      
      if (event.error === 'no-speech') {
        this.updateStatus('No speech detected. Try again.');
      } else if (event.error === 'not-allowed') {
        this.updateStatus('Microphone access denied.');
      } else {
        this.updateStatus(`Error: ${event.error}`);
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        // Restart if still supposed to be listening
        try {
          this.recognition?.start();
        } catch (e) {
          this.setListening(false);
        }
      } else {
        this.setListening(false);
      }
    };

    this.recognition.onstart = () => {
      this.updateStatus('Listening...');
    };
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
      this.updateStatus('Speech recognition not supported');
      return;
    }

    if (this.isListening) return;

    try {
      this.recognition.start();
      this.setListening(true);
    } catch (error) {
      console.error('Failed to start recognition:', error);
      this.updateStatus('Failed to start voice input');
    }
  }

  stopListening(): void {
    if (!this.recognition || !this.isListening) return;

    this.isListening = false;
    this.recognition.stop();
    this.setListening(false);
  }

  private setListening(listening: boolean): void {
    this.isListening = listening;
    
    if (this.voiceBtn) {
      this.voiceBtn.classList.toggle('listening', listening);
    }
    
    if (!listening) {
      setTimeout(() => this.updateStatus(''), 2000);
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
