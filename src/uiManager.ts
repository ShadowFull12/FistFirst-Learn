import { PhysicsEngine } from './physics';

export interface UIElement {
  id: string;
  type: 'slider' | 'counter';
  element: HTMLElement;
  tracks?: string;
  controls?: string;
}

/**
 * UI Manager - Dynamic UI element creation and management
 */
export class UIManager {
  private container: HTMLElement;
  private physics: PhysicsEngine;
  private elements: Map<string, UIElement> = new Map();
  private elementIdCounter: number = 0;
  private lastFPS: number = 60;
  private frameCount: number = 0;
  private lastFPSUpdate: number = 0;

  constructor(container: HTMLElement, physics: PhysicsEngine) {
    this.container = container;
    this.physics = physics;
  }

  createSlider(
    x: number,
    y: number,
    label: string,
    controls: string,
    min: number = 0,
    max: number = 1
  ): UIElement {
    const id = `slider_${++this.elementIdCounter}`;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'ar-slider-container';
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;
    wrapper.dataset.id = id;

    const labelEl = document.createElement('label');
    labelEl.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min.toString();
    input.max = max.toString();
    input.step = ((max - min) / 100).toString();
    input.value = this.getControlValue(controls).toString();

    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'value-display';
    valueDisplay.textContent = input.value;

    input.addEventListener('input', () => {
      const value = parseFloat(input.value);
      valueDisplay.textContent = value.toFixed(2);
      this.applyControl(controls, value);
    });

    // Make draggable
    this.makeDraggable(wrapper, labelEl);

    wrapper.appendChild(labelEl);
    wrapper.appendChild(input);
    wrapper.appendChild(valueDisplay);
    this.container.appendChild(wrapper);

    const uiElement: UIElement = {
      id,
      type: 'slider',
      element: wrapper,
      controls
    };

    this.elements.set(id, uiElement);
    return uiElement;
  }

  createCounter(
    x: number,
    y: number,
    label: string,
    tracks: string
  ): UIElement {
    const id = `counter_${++this.elementIdCounter}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'ar-counter';
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;
    wrapper.dataset.id = id;

    const labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'value';
    valueEl.textContent = '0';
    valueEl.dataset.tracks = tracks;

    // Make draggable
    this.makeDraggable(wrapper, wrapper);

    wrapper.appendChild(labelEl);
    wrapper.appendChild(valueEl);
    this.container.appendChild(wrapper);

    const uiElement: UIElement = {
      id,
      type: 'counter',
      element: wrapper,
      tracks
    };

    this.elements.set(id, uiElement);
    return uiElement;
  }

  private makeDraggable(element: HTMLElement, handle: HTMLElement): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    handle.style.cursor = 'grab';

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = element.offsetLeft;
      initialTop = element.offsetTop;
      handle.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      element.style.left = `${initialLeft + dx}px`;
      element.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        handle.style.cursor = 'grab';
      }
    });
  }

  private getControlValue(controls: string): number {
    switch (controls) {
      case 'gravity':
        return this.physics.getGravity().y;
      case 'bounciness':
        return 0.8;
      case 'friction':
        return 0.1;
      case 'airResistance':
        return 0.01;
      default:
        return 0.5;
    }
  }

  private applyControl(controls: string, value: number): void {
    switch (controls) {
      case 'gravity':
        this.physics.setGravity(0, value);
        break;
      case 'bounciness':
        this.physics.setAllBounciness(value);
        break;
      case 'friction':
        this.physics.setAllFriction(value);
        break;
      case 'airResistance':
        // Would need to add this to physics engine
        break;
    }
  }

  update(): void {
    // Update FPS calculation
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFPSUpdate >= 1000) {
      this.lastFPS = this.frameCount;
      this.frameCount = 0;
      this.lastFPSUpdate = now;
    }

    // Update counters
    this.elements.forEach((el) => {
      if (el.type === 'counter' && el.tracks) {
        const valueEl = el.element.querySelector('.value');
        if (valueEl) {
          valueEl.textContent = this.getTrackedValue(el.tracks);
        }
      }
    });
  }

  private getTrackedValue(tracks: string): string {
    switch (tracks) {
      case 'speed': {
        const objects = this.physics.getObjects();
        if (objects.length === 0) return '0';
        
        // Average speed of all objects
        let totalSpeed = 0;
        for (const obj of objects) {
          const vx = obj.body.velocity.x;
          const vy = obj.body.velocity.y;
          totalSpeed += Math.sqrt(vx * vx + vy * vy);
        }
        return (totalSpeed / objects.length).toFixed(1);
      }
      
      case 'objectCount':
        return this.physics.getObjects().length.toString();
      
      case 'fps':
        return this.lastFPS.toString();
      
      case 'position': {
        const objects = this.physics.getObjects();
        if (objects.length === 0) return '(0, 0)';
        const first = objects[0];
        return `(${first.body.position.x.toFixed(0)}, ${first.body.position.y.toFixed(0)})`;
      }
      
      default:
        return '0';
    }
  }

  removeElement(id: string): boolean {
    const el = this.elements.get(id);
    if (el) {
      el.element.remove();
      this.elements.delete(id);
      return true;
    }
    return false;
  }

  clearAll(): void {
    this.elements.forEach((el) => {
      el.element.remove();
    });
    this.elements.clear();
    this.elementIdCounter = 0;
  }

  getElements(): UIElement[] {
    return Array.from(this.elements.values());
  }
}
