/**
 * Webcam Manager - Handles webcam access and video streaming
 */
export class WebcamManager {
  private videoElement: HTMLVideoElement;
  private stream: MediaStream | null = null;
  public width: number = 1280;
  public height: number = 720;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  async start(): Promise<void> {
    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support webcam access. Please use Chrome or Edge.');
    }

    try {
      console.log('Requesting webcam access...');
      // Use simple constraints first (works better across browsers)
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });

      console.log('Webcam access granted, setting up video element...');
      this.videoElement.srcObject = this.stream;
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Webcam took too long to initialize'));
        }, 10000);
        
        this.videoElement.onloadedmetadata = () => {
          clearTimeout(timeout);
          this.width = this.videoElement.videoWidth;
          this.height = this.videoElement.videoHeight;
          resolve();
        };
        
        this.videoElement.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed to load webcam video'));
        };
      });

      await this.videoElement.play();
      console.log(`Webcam started: ${this.width}x${this.height}`);
    } catch (error: any) {
      console.error('Failed to access webcam:', error);
      
      // Provide specific error messages based on error type
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error('Camera permission denied. Please allow camera access in your browser settings and reload the page.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        throw new Error('No camera found. Please connect a webcam and reload.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        throw new Error('Camera is in use by another application. Please close other apps using the camera and reload.');
      } else if (error.name === 'OverconstrainedError') {
        // Try again with less constraints
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          this.videoElement.srcObject = this.stream;
          await this.videoElement.play();
          this.width = this.videoElement.videoWidth || 640;
          this.height = this.videoElement.videoHeight || 480;
          console.log(`Webcam started with fallback: ${this.width}x${this.height}`);
          return;
        } catch (fallbackError) {
          throw new Error('Camera does not support required resolution.');
        }
      } else {
        throw new Error(`Camera error: ${error.message || 'Unknown error'}. Please check your camera and reload.`);
      }
    }
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  isReady(): boolean {
    return this.videoElement.readyState >= 2;
  }
}
