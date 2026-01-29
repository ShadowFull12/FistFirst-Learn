/**
 * Canvas Renderer - Manages physics and hand visualization canvases
 */
export class CanvasRenderer {
  private physicsCanvas: HTMLCanvasElement;
  private handCanvas: HTMLCanvasElement;
  private physicsCtx: CanvasRenderingContext2D;
  private handCtx: CanvasRenderingContext2D;
  public width: number = 1280;
  public height: number = 720;

  constructor(physicsCanvas: HTMLCanvasElement, handCanvas: HTMLCanvasElement) {
    this.physicsCanvas = physicsCanvas;
    this.handCanvas = handCanvas;
    
    const pCtx = physicsCanvas.getContext('2d');
    const hCtx = handCanvas.getContext('2d');
    
    if (!pCtx || !hCtx) {
      throw new Error('Failed to get canvas contexts');
    }
    
    this.physicsCtx = pCtx;
    this.handCtx = hCtx;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    
    // Set canvas dimensions
    this.physicsCanvas.width = width;
    this.physicsCanvas.height = height;
    this.handCanvas.width = width;
    this.handCanvas.height = height;
    
    // Mirror the canvases to match webcam
    this.physicsCtx.setTransform(-1, 0, 0, 1, width, 0);
    this.handCtx.setTransform(-1, 0, 0, 1, width, 0);
  }

  clearPhysics(): void {
    this.physicsCtx.save();
    this.physicsCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.physicsCtx.clearRect(0, 0, this.width, this.height);
    this.physicsCtx.restore();
  }

  clearHands(): void {
    this.handCtx.save();
    this.handCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.handCtx.clearRect(0, 0, this.width, this.height);
    this.handCtx.restore();
  }

  getPhysicsContext(): CanvasRenderingContext2D {
    return this.physicsCtx;
  }

  getHandContext(): CanvasRenderingContext2D {
    return this.handCtx;
  }

  // Draw a 3D-looking sphere (for physics objects)
  drawCircle(x: number, y: number, radius: number, color: string, strokeColor?: string): void {
    // Create 3D sphere effect with radial gradient
    const gradient = this.physicsCtx.createRadialGradient(
      x - radius * 0.3, y - radius * 0.3, radius * 0.1,
      x, y, radius
    );
    
    // Parse color to create highlights and shadows
    const lighterColor = this.lightenColor(color, 60);
    const darkerColor = this.darkenColor(color, 40);
    
    gradient.addColorStop(0, lighterColor);
    gradient.addColorStop(0.4, color);
    gradient.addColorStop(1, darkerColor);
    
    // Draw main sphere
    this.physicsCtx.beginPath();
    this.physicsCtx.arc(x, y, radius, 0, Math.PI * 2);
    this.physicsCtx.fillStyle = gradient;
    this.physicsCtx.fill();
    
    // Add specular highlight
    const highlightGradient = this.physicsCtx.createRadialGradient(
      x - radius * 0.4, y - radius * 0.4, 0,
      x - radius * 0.4, y - radius * 0.4, radius * 0.4
    );
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    this.physicsCtx.beginPath();
    this.physicsCtx.arc(x, y, radius, 0, Math.PI * 2);
    this.physicsCtx.fillStyle = highlightGradient;
    this.physicsCtx.fill();
    
    // Draw stroke
    if (strokeColor) {
      this.physicsCtx.strokeStyle = strokeColor;
      this.physicsCtx.lineWidth = 2;
      this.physicsCtx.stroke();
    }
    
    // Add shadow beneath
    this.physicsCtx.beginPath();
    this.physicsCtx.ellipse(x, y + radius + 5, radius * 0.8, radius * 0.2, 0, 0, Math.PI * 2);
    this.physicsCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    this.physicsCtx.fill();
  }

  private lightenColor(hex: string, amount: number): string {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private darkenColor(hex: string, amount: number): string {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Draw a 3D-looking rectangle (for physics objects)
  drawRect(x: number, y: number, width: number, height: number, angle: number, color: string): void {
    this.physicsCtx.save();
    this.physicsCtx.translate(x, y);
    this.physicsCtx.rotate(angle);
    
    // Create 3D effect with gradient
    const gradient = this.physicsCtx.createLinearGradient(-width/2, -height/2, width/2, height/2);
    gradient.addColorStop(0, this.lightenColor(color, 30));
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, this.darkenColor(color, 30));
    
    // Draw main rectangle
    this.physicsCtx.fillStyle = gradient;
    this.physicsCtx.fillRect(-width / 2, -height / 2, width, height);
    
    // Add highlight edge
    this.physicsCtx.strokeStyle = this.lightenColor(color, 50);
    this.physicsCtx.lineWidth = 2;
    this.physicsCtx.beginPath();
    this.physicsCtx.moveTo(-width/2, height/2);
    this.physicsCtx.lineTo(-width/2, -height/2);
    this.physicsCtx.lineTo(width/2, -height/2);
    this.physicsCtx.stroke();
    
    // Add shadow edge
    this.physicsCtx.strokeStyle = this.darkenColor(color, 50);
    this.physicsCtx.beginPath();
    this.physicsCtx.moveTo(width/2, -height/2);
    this.physicsCtx.lineTo(width/2, height/2);
    this.physicsCtx.lineTo(-width/2, height/2);
    this.physicsCtx.stroke();
    
    this.physicsCtx.restore();
  }

  // Draw hand landmarks
  drawHandLandmark(x: number, y: number, radius: number, color: string): void {
    this.handCtx.beginPath();
    this.handCtx.arc(x, y, radius, 0, Math.PI * 2);
    this.handCtx.fillStyle = color;
    this.handCtx.fill();
  }

  // Draw connection between hand landmarks
  drawHandConnection(x1: number, y1: number, x2: number, y2: number, color: string): void {
    this.handCtx.beginPath();
    this.handCtx.moveTo(x1, y1);
    this.handCtx.lineTo(x2, y2);
    this.handCtx.strokeStyle = color;
    this.handCtx.lineWidth = 3;
    this.handCtx.stroke();
  }

  // Draw boundary walls (visible AR frame)
  drawBoundaries(color: string = 'rgba(59, 130, 246, 0.8)'): void {
    const thickness = 8;
    const cornerSize = 40;
    
    this.physicsCtx.save();
    this.physicsCtx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Draw glowing edges
    this.physicsCtx.shadowColor = 'rgba(59, 130, 246, 0.8)';
    this.physicsCtx.shadowBlur = 15;
    this.physicsCtx.strokeStyle = color;
    this.physicsCtx.lineWidth = thickness;
    
    // Draw full rectangle border
    this.physicsCtx.strokeRect(thickness / 2, thickness / 2, this.width - thickness, this.height - thickness);
    
    // Draw corner brackets for AR feel
    this.physicsCtx.shadowBlur = 0;
    this.physicsCtx.strokeStyle = '#fff';
    this.physicsCtx.lineWidth = 4;
    
    // Top-left corner
    this.physicsCtx.beginPath();
    this.physicsCtx.moveTo(4, cornerSize);
    this.physicsCtx.lineTo(4, 4);
    this.physicsCtx.lineTo(cornerSize, 4);
    this.physicsCtx.stroke();
    
    // Top-right corner
    this.physicsCtx.beginPath();
    this.physicsCtx.moveTo(this.width - cornerSize, 4);
    this.physicsCtx.lineTo(this.width - 4, 4);
    this.physicsCtx.lineTo(this.width - 4, cornerSize);
    this.physicsCtx.stroke();
    
    // Bottom-left corner
    this.physicsCtx.beginPath();
    this.physicsCtx.moveTo(4, this.height - cornerSize);
    this.physicsCtx.lineTo(4, this.height - 4);
    this.physicsCtx.lineTo(cornerSize, this.height - 4);
    this.physicsCtx.stroke();
    
    // Bottom-right corner
    this.physicsCtx.beginPath();
    this.physicsCtx.moveTo(this.width - cornerSize, this.height - 4);
    this.physicsCtx.lineTo(this.width - 4, this.height - 4);
    this.physicsCtx.lineTo(this.width - 4, this.height - cornerSize);
    this.physicsCtx.stroke();
    
    // Add AR frame label
    this.physicsCtx.font = 'bold 12px monospace';
    this.physicsCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.physicsCtx.textAlign = 'left';
    this.physicsCtx.fillText('AR BOUNDARY', 15, 25);
    
    this.physicsCtx.restore();
  }
}
