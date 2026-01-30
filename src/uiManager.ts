import { PhysicsEngine } from './physics';

export interface UIElement {
  id: string;
  type: 'slider' | 'counter' | 'button' | 'timer' | 'score' | 'progress' | 'toggle';
  element: HTMLElement;
  tracks?: string;
  controls?: string;
  callback?: () => void;
  intervalId?: number;
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
  private score: number = 0;
  private collisionCount: number = 0;

  constructor(container: HTMLElement, physics: PhysicsEngine) {
    this.container = container;
    this.physics = physics;
  }

  // Score management
  addScore(points: number = 1): void {
    this.score += points;
    this.updateScoreDisplays();
  }

  resetScore(): void {
    this.score = 0;
    this.updateScoreDisplays();
  }

  getScore(): number {
    return this.score;
  }

  private updateScoreDisplays(): void {
    this.elements.forEach((el) => {
      if (el.type === 'score') {
        const valueEl = el.element.querySelector('.value');
        if (valueEl) valueEl.textContent = this.score.toString();
      }
    });
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

  createButton(
    x: number,
    y: number,
    label: string,
    action: string,
    callback: () => void
  ): UIElement {
    const id = `button_${++this.elementIdCounter}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'ar-button';
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;
    wrapper.dataset.id = id;

    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', callback);

    wrapper.appendChild(btn);
    this.container.appendChild(wrapper);

    const uiElement: UIElement = {
      id,
      type: 'button',
      element: wrapper,
      callback
    };

    this.elements.set(id, uiElement);
    return uiElement;
  }

  createTimer(
    x: number,
    y: number,
    label: string,
    countDown: boolean = false,
    startValue: number = 0
  ): UIElement {
    const id = `timer_${++this.elementIdCounter}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'ar-timer';
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;
    wrapper.dataset.id = id;

    const labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'value';
    let currentValue = startValue;
    valueEl.textContent = this.formatTime(currentValue);

    // Start/Stop button
    const controlBtn = document.createElement('button');
    controlBtn.className = 'timer-control';
    controlBtn.textContent = '▶';
    let isRunning = false;
    let intervalId: number | undefined;

    controlBtn.addEventListener('click', () => {
      if (isRunning) {
        isRunning = false;
        controlBtn.textContent = '▶';
        if (intervalId) clearInterval(intervalId);
      } else {
        isRunning = true;
        controlBtn.textContent = '⏸';
        intervalId = window.setInterval(() => {
          if (countDown) {
            currentValue = Math.max(0, currentValue - 1);
            if (currentValue === 0) {
              isRunning = false;
              controlBtn.textContent = '▶';
              clearInterval(intervalId);
            }
          } else {
            currentValue++;
          }
          valueEl.textContent = this.formatTime(currentValue);
        }, 1000);
      }
    });

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'timer-reset';
    resetBtn.textContent = '↺';
    resetBtn.addEventListener('click', () => {
      currentValue = startValue;
      valueEl.textContent = this.formatTime(currentValue);
    });

    // Make draggable
    this.makeDraggable(wrapper, labelEl);

    wrapper.appendChild(labelEl);
    wrapper.appendChild(valueEl);
    wrapper.appendChild(controlBtn);
    wrapper.appendChild(resetBtn);
    this.container.appendChild(wrapper);

    const uiElement: UIElement = {
      id,
      type: 'timer',
      element: wrapper,
      intervalId
    };

    this.elements.set(id, uiElement);
    return uiElement;
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  createScoreTracker(
    x: number,
    y: number,
    label: string
  ): UIElement {
    const id = `score_${++this.elementIdCounter}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'ar-score';
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;
    wrapper.dataset.id = id;

    const labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'value';
    valueEl.textContent = this.score.toString();

    // +1 button for manual scoring
    const addBtn = document.createElement('button');
    addBtn.className = 'score-add';
    addBtn.textContent = '+1';
    addBtn.addEventListener('click', () => {
      this.addScore(1);
    });

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'score-reset';
    resetBtn.textContent = '↺';
    resetBtn.addEventListener('click', () => {
      this.resetScore();
    });

    // Make draggable
    this.makeDraggable(wrapper, labelEl);

    wrapper.appendChild(labelEl);
    wrapper.appendChild(valueEl);
    wrapper.appendChild(addBtn);
    wrapper.appendChild(resetBtn);
    this.container.appendChild(wrapper);

    const uiElement: UIElement = {
      id,
      type: 'score',
      element: wrapper
    };

    this.elements.set(id, uiElement);
    return uiElement;
  }

  createProgressBar(
    x: number,
    y: number,
    label: string,
    tracks: string,
    max: number = 20
  ): UIElement {
    const id = `progress_${++this.elementIdCounter}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'ar-progress';
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;
    wrapper.dataset.id = id;

    const labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.textContent = label;

    const barContainer = document.createElement('div');
    barContainer.className = 'progress-container';

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.dataset.tracks = tracks;
    bar.dataset.max = max.toString();
    bar.style.width = '0%';

    const valueEl = document.createElement('span');
    valueEl.className = 'progress-value';
    valueEl.textContent = '0/' + max;

    barContainer.appendChild(bar);
    barContainer.appendChild(valueEl);

    // Make draggable
    this.makeDraggable(wrapper, labelEl);

    wrapper.appendChild(labelEl);
    wrapper.appendChild(barContainer);
    this.container.appendChild(wrapper);

    const uiElement: UIElement = {
      id,
      type: 'progress',
      element: wrapper,
      tracks
    };

    this.elements.set(id, uiElement);
    return uiElement;
  }

  createToggle(
    x: number,
    y: number,
    label: string,
    controls: string,
    callback: (enabled: boolean) => void
  ): UIElement {
    const id = `toggle_${++this.elementIdCounter}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'ar-toggle';
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;
    wrapper.dataset.id = id;

    const labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.textContent = label;

    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.addEventListener('change', () => {
      callback(input.checked);
      slider.className = input.checked ? 'toggle-slider on' : 'toggle-slider off';
    });

    const slider = document.createElement('span');
    slider.className = 'toggle-slider on';

    toggleSwitch.appendChild(input);
    toggleSwitch.appendChild(slider);

    // Make draggable
    this.makeDraggable(wrapper, labelEl);

    wrapper.appendChild(labelEl);
    wrapper.appendChild(toggleSwitch);
    this.container.appendChild(wrapper);

    const uiElement: UIElement = {
      id,
      type: 'toggle',
      element: wrapper,
      controls
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

    // Update counters and progress bars
    this.elements.forEach((el) => {
      if (el.type === 'counter' && el.tracks) {
        const valueEl = el.element.querySelector('.value');
        if (valueEl) {
          valueEl.textContent = this.getTrackedValue(el.tracks);
        }
      }
      
      if (el.type === 'progress' && el.tracks) {
        const bar = el.element.querySelector('.progress-bar') as HTMLElement;
        const valueEl = el.element.querySelector('.progress-value');
        if (bar && valueEl) {
          const currentVal = parseFloat(this.getTrackedValue(el.tracks));
          const max = parseFloat(bar.dataset.max || '20');
          const percent = Math.min(100, (currentVal / max) * 100);
          bar.style.width = `${percent}%`;
          valueEl.textContent = `${Math.round(currentVal)}/${max}`;
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
      
      case 'score':
        return this.score.toString();
      
      case 'collisions':
        return this.collisionCount.toString();
      
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

  // Track collisions (call this from physics engine)
  incrementCollisions(): void {
    this.collisionCount++;
  }

  resetCollisions(): void {
    this.collisionCount = 0;
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
