import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
  OnChanges,
  signal,
  SimpleChanges,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MarkdownComponent } from 'ngx-markdown';
import { DigestService } from '../../../core/digest.service';
import { Digest } from '../../../core/models';

/**
 * Shows the full markdown body for a single digest date.
 *
 * The `date` input is bound from the route parameter via withComponentInputBinding.
 * When the date changes (e.g. user navigates between detail pages) ngOnChanges
 * re-fetches automatically.
 *
 * NOTE for Phase 5: the #markdownContainer ref on the content div is the anchor
 * point for selection capture — do not remove it.
 */
@Component({
  selector: 'app-digest-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MarkdownComponent],
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
      <div #markdownContainer class="markdown-body">
        <markdown [data]="digest()!.markdown" />
      </div>
    }
  `,
})
export class DigestDetailComponent implements OnChanges {
  /** Populated from the :date route parameter via withComponentInputBinding. */
  @Input() date!: string;

  private readonly digestService = inject(DigestService);

  readonly digest = signal<Digest | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notFound = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['date'] && this.date) {
      this.load(this.date);
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
