import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WhiteboardService {
  
  // Data from network to be drawn on canvas
  incomingDrawData = signal<string | null>(null);
  
  // Data from canvas to be sent to network
  outgoingDrawData = signal<string | null>(null);

  // Command signals for actions - use a number to represent an event trigger
  clearCommand = signal<number>(0);
  undoCommand = signal<number>(0);
  redoCommand = signal<number>(0);

  // State signals for UI
  canUndo = signal<boolean>(false);
  canRedo = signal<boolean>(false);


  processIncomingData(data: string) {
    this.incomingDrawData.set(data);
    this.incomingDrawData.set(null);
  }
  
  sendDrawData(data: string) {
    this.outgoingDrawData.set(data);
    this.outgoingDrawData.set(null);
  }

  clear() {
    this.clearCommand.update(c => c + 1);
  }

  undo() {
    this.undoCommand.update(c => c + 1);
  }

  redo() {
    this.redoCommand.update(c => c + 1);
  }
}