import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { InterestingService } from '../../../core/interesting.service';

/** Viewport-relative rectangle of the captured selection. */
export interface AnchorRect {
  top: number;
  left: number;
  bottom: number;
}

/** Approximate panel width — used to clamp the left edge to the viewport. */
const PANEL_WIDTH = 280;

/** How long the "Saved ✓" confirmation lingers before the panel closes. */
const SAVED_LINGER_MS = 1000;

/**
 * Floating panel for saving a piece of selected digest text as an
 * "interesting" item.
 *
 * It is positioned (position: fixed) just below the selection rectangle and
 * clamped to the viewport. The title input is prefilled with the first line of
 * the selection; Save delegates to InterestingService.create() and shows
 * pending / saved / error states inline. It emits `closed` on Cancel, after a
 * successful save, or when the host clears it.
 */
@Component({
  selector: 'app-save-selection',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  styles: [`
    :host { position: fixed; z-index: 1000; }
    .panel {
      width: ${PANEL_WIDTH}px;
      box-sizing: border-box;
      background: #fff;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 0.6rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      font-size: 0.9rem;
    }
    input.title {
      width: 100%;
      box-sizing: border-box;
      padding: 0.3rem 0.4rem;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      margin-bottom: 0.5rem;
    }
    .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
    button {
      border: 1px solid #d1d5db;
      background: #fff;
      border-radius: 4px;
      padding: 0.25rem 0.7rem;
      cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: default; }
    .saved { color: #047857; }
    .error-msg { color: #dc2626; margin-bottom: 0.4rem; }
  `],
  template: `
    <div
      class="panel"
      [style.top.px]="panelTop()"
      [style.left.px]="panelLeft()"
    >
      @if (saved()) {
        <p class="saved">Saved ✓</p>
      } @else {
        @if (error()) {
          <p class="error-msg">{{ error() }}</p>
        }
        <input
          class="title"
          type="text"
          [(ngModel)]="title"
          [disabled]="pending()"
          placeholder="Title"
        />
        <div class="actions">
          <button type="button" (click)="cancel()" [disabled]="pending()">
            Cancel
          </button>
          <button type="button" (click)="save()" [disabled]="pending()">
            Save
          </button>
        </div>
      }
    </div>
  `,
})
export class SaveSelectionComponent {
  readonly selectedText = input.required<string>();
  readonly digestDate = input.required<string>();
  readonly anchorRect = input.required<AnchorRect | null>();
  readonly closed = output<void>();

  private readonly svc = inject(InterestingService);
  private readonly destroyRef = inject(DestroyRef);

  /** Editable title, prefilled from the first line of the selection. */
  title = '';

  protected readonly pending = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const firstLine = this.selectedText().split('\n')[0] ?? '';
      if (untracked(this.pending) || untracked(this.saved)) return;
      this.title = firstLine.trim().slice(0, 80);
      this.error.set(null);
    }, { allowSignalWrites: true });

    this.destroyRef.onDestroy(() => {
      if (this.closeTimer !== null) {
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
      }
    });
  }

  /** Fixed-position top: just under the selection's bottom edge. */
  protected panelTop(): number {
    const rect = this.anchorRect();
    return rect ? rect.bottom + 6 : 0;
  }

  /** Fixed-position left, clamped so the panel stays within the viewport. */
  protected panelLeft(): number {
    const rect = this.anchorRect();
    const left = rect ? rect.left : 0;
    const maxLeft =
      typeof window !== 'undefined'
        ? Math.max(0, window.innerWidth - PANEL_WIDTH - 8)
        : left;
    return Math.max(0, Math.min(left, maxLeft));
  }

  protected save(): void {
    const title = this.title.trim();
    if (title === '' || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);

    this.svc.create(title, this.selectedText()).subscribe({
      next: () => {
        this.pending.set(false);
        this.saved.set(true);
        this.closeTimer = setTimeout(() => {
          this.closeTimer = null;
          this.closed.emit();
        }, SAVED_LINGER_MS);
      },
      error: (err: HttpErrorResponse) => {
        this.pending.set(false);
        const message =
          err?.error?.error?.message ?? 'Failed to save. Please try again.';
        this.error.set(message);
      },
    });
  }

  protected cancel(): void {
    this.closed.emit();
  }
}
