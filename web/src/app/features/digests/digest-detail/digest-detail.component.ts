import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  Input,
  OnChanges,
  signal,
  SimpleChanges,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MarkdownComponent } from 'ngx-markdown';
import { DigestService } from '../../../core/digest.service';
import { Digest } from '../../../core/models';
import {
  AnchorRect,
  SaveSelectionComponent,
} from '../save-selection/save-selection.component';

/**
 * Shows the full markdown body for a single digest date.
 *
 * The `date` input is bound from the route parameter via withComponentInputBinding.
 * When the date changes (e.g. user navigates between detail pages) ngOnChanges
 * re-fetches automatically.
 *
 * Phase 5: selecting text inside #markdownContainer pops a floating
 * <app-save-selection> panel anchored to the selection. Selection state lives
 * in signals; document-level dismissal (outside click) is wired through host
 * listeners so nothing leaks. The #markdownContainer ref is the capture anchor
 * — do not remove it.
 */
@Component({
  selector: 'app-digest-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MarkdownComponent, SaveSelectionComponent],
  styles: [`
    :host { display: block; }
    .back { display: inline-block; margin-bottom: 1rem; color: #1d4ed8; }
    .error-msg { color: #dc2626; }
  `],
  template: `
    <!-- Relative back-link: from /digests/:date → /digests -->
    <a class="back" routerLink="..">← Back to list</a>

    @if (loading()) {
      <p>Loading…</p>
    }

    @if (notFound()) {
      <p class="error-msg">No digest for {{ date }}.</p>
    } @else if (error()) {
      <p class="error-msg">{{ error() }}</p>
    }

    @if (digest()) {
      <!-- #markdownContainer: Phase 5 selection capture anchor -->
      <div
        #markdownContainer
        class="markdown-body"
        (mouseup)="captureSelection()"
        (keyup)="captureSelection()"
      >
        <markdown [data]="digest()!.markdown" />
      </div>
    }

    @if (selectedText() && anchorRect()) {
      <app-save-selection
        [selectedText]="selectedText()!"
        [digestDate]="date"
        [anchorRect]="anchorRect()"
        (closed)="clearSelection()"
      />
    }
  `,
})
export class DigestDetailComponent implements OnChanges {
  /** Populated from the :date route parameter via withComponentInputBinding. */
  @Input() date!: string;

  private readonly digestService = inject(DigestService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** The selection-capture anchor div (only present once a digest loads). */
  private readonly markdownContainer =
    viewChild<ElementRef<HTMLElement>>('markdownContainer');

  readonly digest = signal<Digest | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notFound = signal(false);

  /** Captured selection text — non-null only while the save panel is shown. */
  readonly selectedText = signal<string | null>(null);
  readonly anchorRect = signal<AnchorRect | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['date'] && this.date) {
      this.clearSelection();
      this.load(this.date);
    }
  }

  /**
   * Read the current window selection; if it is a non-empty range fully
   * contained inside #markdownContainer, store its text + viewport rect so the
   * save panel appears. Runs only inside the (mouseup)/(keyup) handlers, so
   * `window` is safe to touch here.
   */
  protected captureSelection(): void {
    const container = this.markdownContainer()?.nativeElement;
    if (!container || typeof window === 'undefined') {
      return;
    }

    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0 ||
      !selection.anchorNode ||
      !selection.focusNode ||
      !container.contains(selection.anchorNode) ||
      !container.contains(selection.focusNode)
    ) {
      return;
    }

    const text = selection.toString();
    if (text.trim() === '') {
      return;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    this.selectedText.set(text);
    this.anchorRect.set({
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
    });
  }

  /** Hide the save panel and forget the captured selection. */
  protected clearSelection(): void {
    this.selectedText.set(null);
    this.anchorRect.set(null);
  }

  /** Escape dismisses the panel. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.selectedText() !== null) {
      this.clearSelection();
    }
  }

  /**
   * A click anywhere outside both the save panel and the capture container
   * dismisses the panel. Bound at the document level via @HostListener so
   * Angular adds/removes the listener with the component lifecycle (no leak).
   */
  @HostListener('document:mousedown', ['$event'])
  protected onDocumentMouseDown(event: MouseEvent): void {
    if (this.selectedText() === null) {
      return;
    }
    const target = event.target as Node | null;
    if (!target) {
      return;
    }

    const container = this.markdownContainer()?.nativeElement;
    const panel = this.host.nativeElement.querySelector('app-save-selection');

    const insideContainer = !!container && container.contains(target);
    const insidePanel = !!panel && panel.contains(target);

    if (!insideContainer && !insidePanel) {
      this.clearSelection();
    }
  }

  private load(date: string): void {
    this.loading.set(true);
    this.digest.set(null);
    this.error.set(null);
    this.notFound.set(false);

    this.digestService.get(date).subscribe({
      next: (d) => {
        this.digest.set(d);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status === 404) {
          this.notFound.set(true);
        } else {
          this.error.set('Failed to load digest. Please try again.');
        }
      },
    });
  }
}
