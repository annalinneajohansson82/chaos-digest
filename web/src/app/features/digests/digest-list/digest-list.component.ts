import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DigestService } from '../../../core/digest.service';
import { DigestSummary } from '../../../core/models';

/**
 * Paginated list of digest dates.
 * Loads the first page on init; subsequent pages are appended via "Load more".
 */
@Component({
  selector: 'app-digest-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styles: [`
    :host { display: block; }
    ul { list-style: none; padding: 0; margin: 0 0 1rem; }
    li { margin: 0.4rem 0; }
    a { color: #1d4ed8; }
    .load-more { margin-top: 0.5rem; }
    .error-msg { color: #dc2626; margin-bottom: 0.5rem; }
  `],
  template: `
    <h2>Digests</h2>

    @if (error()) {
      <p class="error-msg">{{ error() }}</p>
      <button (click)="retry()">Retry</button>
    }

    @if (dates().length === 0 && !loading() && !error()) {
      <p>No digests yet.</p>
    }

    <ul>
      @for (d of dates(); track d.date) {
        <li>
          <!-- Relative link: from /digests → /digests/:date -->
          <a [routerLink]="[d.date]">{{ d.date }}</a>
        </li>
      }
    </ul>

    @if (loading()) {
      <p>Loading…</p>
    }

    @if (nextCursor() !== null && !loading()) {
      <button class="load-more" (click)="loadMore()">Load more</button>
    }
  `,
})
export class DigestListComponent implements OnInit {
  private readonly digestService = inject(DigestService);

  readonly dates = signal<DigestSummary[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private lastCursor?: string;

  ngOnInit(): void {
    this.load();
  }

  loadMore(): void {
    this.load(this.nextCursor() ?? undefined);
  }

  retry(): void {
    this.load(this.lastCursor);
  }

  private load(cursor?: string): void {
    this.lastCursor = cursor;
    this.error.set(null);
    this.loading.set(true);
    this.digestService.list(cursor).subscribe({
      next: (res) => {
        this.dates.update((prev) => [...prev, ...res.items]);
        this.nextCursor.set(res.nextCursor);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load digests. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
