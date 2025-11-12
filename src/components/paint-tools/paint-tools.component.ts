import { Component, ChangeDetectionStrategy, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-paint-tools',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col sm:flex-row items-center justify-between gap-2 p-2 bg-zinc-900/50 rounded-md border border-black/30">
      <!-- Colors -->
      <div class="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
        @for (c of colors; track c) {
          <button
            (click)="selectColor(c)"
            class="w-8 h-8 rounded-md transition-all ring-offset-2 ring-offset-zinc-800 active:scale-90 border-2 border-transparent"
            [style.background-color]="c"
            [class.ring-2]="color() === c"
            [class.ring-amber-400]="color() === c">
          </button>
        }
      </div>

      <!-- Brush Sizes -->
      <div class="flex items-center gap-2 flex-shrink-0 bg-black/30 p-1 rounded-md">
        @for (s of brushSizes; track s) {
          <button
            (click)="selectSize(s)"
            class="w-9 h-9 rounded-md flex items-center justify-center font-bold text-lg transition-all active:scale-90"
            [class.bg-amber-500]="size() === s"
            [class.text-zinc-900]="size() === s"
            [class.bg-zinc-700]="size() !== s"
            [class.text-amber-100]="size() !== s"
            [class.hover:bg-zinc-600]="size() !== s">
            {{ s }}
          </button>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaintToolsComponent {
  color = input<string>('#FFFFFF');
  size = input<number>(4);

  colorChange = output<string>();
  sizeChange = output<number>();

  colors = ['#FFFFFF', '#ff453a', '#ff9f0a', '#ffd60a', '#32d74b', '#0a84ff', '#5e5ce6', '#bf5af2'];
  brushSizes = [2, 4, 8];

  selectColor(color: string) {
    this.colorChange.emit(color);
  }

  selectSize(size: number) {
    this.sizeChange.emit(size);
  }
}
