import { Component, ChangeDetectionStrategy, ViewChild, ElementRef, AfterViewInit, inject, OnDestroy, effect, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WhiteboardService } from '../../services/whiteboard.service';

interface Point {
  x: number;
  y: number;
}
interface DrawAction {
  id: string;
  color: string;
  size: number;
  points: Point[];
}
type WhiteboardNetworkAction = 
    | { type: 'stroke'; payload: DrawAction }
    | { type: 'undo' }
    | { type: 'redo' }
    | { type: 'clear' };


@Component({
  selector: 'app-whiteboard',
  standalone: true,
  imports: [CommonModule],
  template: `<canvas #whiteboardCanvas class="touch-none cursor-crosshair"></canvas>`,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    canvas {
      width: 100%;
      height: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhiteboardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('whiteboardCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  
  color = input.required<string>();
  size = input.required<number>();

  private whiteboardService = inject(WhiteboardService);
  private ctx!: CanvasRenderingContext2D;
  private isDrawing = false;
  
  private history: DrawAction[] = [];
  private redoStack: DrawAction[] = [];
  private currentStroke: DrawAction | null = null;


  constructor() {
    // Effect for handling incoming network data
    effect(() => {
        const data = this.whiteboardService.incomingDrawData();
        if(data) {
            this.handleIncomingData(data);
        }
    });
    
    // Effects for handling local UI commands
    effect(() => {
        // This effect runs when the command signal changes.
        // We check if the value is > 0 to ensure it's a command,
        // and not the initial state.
        if (this.whiteboardService.clearCommand() > 0) {
            this.handleClear();
        }
    });
    effect(() => {
        if (this.whiteboardService.undoCommand() > 0) {
            this.handleUndo();
        }
    });
    effect(() => {
        if (this.whiteboardService.redoCommand() > 0) {
            this.handleRedo();
        }
    });
  }

  ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.resizeCanvas();
    
    window.addEventListener('resize', this.resizeCanvas);
    
    const canvas = this.canvasRef.nativeElement;
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onMouseUp);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeCanvas);
    const canvas = this.canvasRef.nativeElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchend', this.onMouseUp);
  }

  public getHistoryState(): string {
    return JSON.stringify(this.history);
  }

  public loadHistoryState(state: string) {
    try {
      const history = JSON.parse(state) as DrawAction[];
      if (Array.isArray(history)) {
        this.history = history;
        this.redoStack = [];
        this.redrawCanvas();
        this.updateServiceState();
      }
    } catch (e) {
      console.error('Failed to load whiteboard history state.', e);
    }
  }

  private handleIncomingData(data: string) {
    if (data === "reset") { // For backward compatibility if needed
      this.clearHistoryAndCanvas();
      return;
    }
    try {
      const action = JSON.parse(data) as WhiteboardNetworkAction;
      switch(action.type) {
        case 'stroke':
          this.history.push(action.payload);
          this.redoStack = []; // New action clears redo stack
          this.redrawCanvas();
          break;
        case 'undo':
          if (this.history.length > 0) {
            this.redoStack.push(this.history.pop()!);
            this.redrawCanvas();
          }
          break;
        case 'redo':
          if (this.redoStack.length > 0) {
            this.history.push(this.redoStack.pop()!);
            this.redrawCanvas();
          }
          break;
        case 'clear':
          this.clearHistoryAndCanvas();
          break;
      }
      this.updateServiceState();
    } catch(e) {
      console.error("Could not parse whiteboard data", e);
    }
  }

  private onMouseDown = (e: MouseEvent) => {
    this.isDrawing = true;
    this.redoStack = [];
    this.currentStroke = {
        id: `${Date.now()}-${Math.random()}`,
        color: this.color(),
        size: this.size(),
        points: []
    };
    this.onMouseMove(e);
  };

  private onMouseUp = () => {
    if (!this.isDrawing || !this.currentStroke || this.currentStroke.points.length === 0) {
        this.isDrawing = false;
        return;
    };
    this.isDrawing = false;

    // Add to local history and send to network
    this.history.push(this.currentStroke);
    this.sendAction({ type: 'stroke', payload: this.currentStroke });
    this.currentStroke = null;
    this.updateServiceState();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.isDrawing) {
      const pos = this.getMousePos(e, this.canvasRef.nativeElement);
      if (pos && this.currentStroke) {
        const point = { x: pos[0], y: pos[1] };
        this.currentStroke.points.push(point);
        this.redrawCanvas();
      }
    }
  };
  
  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    this.isDrawing = true;
     this.redoStack = [];
    this.currentStroke = {
        id: `${Date.now()}-${Math.random()}`,
        color: this.color(),
        size: this.size(),
        points: []
    };
    this.onTouchMove(e);
  };
  
  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (this.isDrawing) {
      const pos = this.getTouchPos(e, this.canvasRef.nativeElement);
      if(pos && this.currentStroke) {
        const point = { x: pos[0], y: pos[1] };
        this.currentStroke.points.push(point);
        this.redrawCanvas(); // Redraw everything to show current stroke
      }
    }
  };

  private handleUndo() {
    if (this.history.length > 0) {
        this.redoStack.push(this.history.pop()!);
        this.redrawCanvas();
        this.sendAction({ type: 'undo' });
        this.updateServiceState();
    }
  }

  private handleRedo() {
      if (this.redoStack.length > 0) {
          this.history.push(this.redoStack.pop()!);
          this.redrawCanvas();
          this.sendAction({ type: 'redo' });
          this.updateServiceState();
      }
  }

  private handleClear() {
      this.clearHistoryAndCanvas();
      this.sendAction({ type: 'clear' });
  }

  private sendAction(action: WhiteboardNetworkAction) {
    this.whiteboardService.sendDrawData(JSON.stringify(action));
  }

  private updateServiceState() {
    this.whiteboardService.canUndo.set(this.history.length > 0);
    this.whiteboardService.canRedo.set(this.redoStack.length > 0);
  }
  
  private redrawCanvas() {
    const canvas = this.canvasRef.nativeElement;
    // Get the coordinate system size, not the CSS size.
    const { width, height } = canvas; 
    const dpr = window.devicePixelRatio || 1;
    // Clear using device pixels, not CSS pixels
    this.ctx.clearRect(0, 0, width, height);

    this.history.forEach(stroke => this.drawStroke(stroke));
    if (this.isDrawing && this.currentStroke) {
        this.drawStroke(this.currentStroke);
    }
  }
  
  private drawStroke(stroke: DrawAction) {
    if (!this.ctx || stroke.points.length === 0) return;
    this.ctx.strokeStyle = stroke.color;
    this.ctx.fillStyle = stroke.color;
    this.ctx.lineWidth = stroke.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    this.ctx.stroke();
  }

  private clearHistoryAndCanvas = () => {
    this.ctx.clearRect(0, 0, this.canvasRef.nativeElement.width, this.canvasRef.nativeElement.height);
    this.history = [];
    this.redoStack = [];
    this.updateServiceState();
  };

  private resizeCanvas = () => {
    const canvas = this.canvasRef.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Set the canvas size based on its display size and device pixel ratio
    // to ensure the drawing buffer is sharp on high-DPI screens.
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      // When canvas size is set, the context is reset.
      // We need to scale the context for high-DPI displays so we can
      // continue to use CSS pixels for our coordinates.
      this.ctx.scale(dpr, dpr);
    }
    
    // Always redraw after a resize to apply the new dimensions.
    this.redrawCanvas();
  };

  private getMousePos(e: MouseEvent, canvas: HTMLCanvasElement): [number, number] | null {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private getTouchPos(e: TouchEvent, canvas: HTMLCanvasElement): [number, number] | null {
    if (!e.touches || e.touches.length !== 1) return null;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    return [touch.clientX - rect.left, touch.clientY - rect.top];
  }
}