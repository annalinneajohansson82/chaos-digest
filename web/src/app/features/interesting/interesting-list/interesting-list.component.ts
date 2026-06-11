import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { InterestingService } from '../../../core/interesting.service';

/**
 * Lists the curated "interesting" items (newest-first) with their save/seen
 * dates and a per-row Delete control.
 *
 * State is owned by InterestingService (a stateful, root-provided service) so
 * the save-selection panel and this list stay in sync. The component just
 * reflects the service's signals and triggers load()/remove().
 */
@Component({
  selector: 'app-interesting-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; }
    h2 { margin-bottom: 0.75rem; }
    ul { list-style: none; padding: 0; margin: 0; }
    li {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .title { font-weight: 500; }
    .meta { color: #6b7280; font-size: 0.85rem; }
    .error-msg { color: #dc2626; margin-bottom: 0.5rem; }
    button.delete {
      border: 1px solid #d1d5db;
      background: #fff;
      border-radius: 4px;
      padding: 0.2rem 0.6rem;
      cursor: pointer;
    }
  `],
  template: `
    <h2>Interesting</h2>

    @if (svc.error()) {
      <p class="error-msg">{{ svc.error() }}</p>
      <button (click)="svc.load()">Retry</button>
    }

    @if (svc.loading()) {
      <p>Loading…</p>
    }

    @if (!svc.loading() && !svc.error() && svc.items().length === 0) {
      <p>Nothing saved yet.</p>
    }

    <ul>
      @for (item of svc.items(); track item.id) {
        <li>
          <span>
            <span class="title">{{ item.title }}</span>
            <br />
            <span class="meta">{{ meta(item.created, item.digestSeen) }}</span>
          </span>
          <button class="delete" (click)="svc.remove(item.id)">Delete</button>
        </li>
      }
    </ul>
  `,
})
export class InterestingListComponent implements OnInit {
  protected readonly svc = inject(InterestingService);

  ngOnInit(): void {
    this.svc.load();
  }

  /**
   * Builds a human-readable meta line from whichever dates are present,
   * e.g. "saved 2026-06-11 · seen 2026-06-12". Returns '' if both are null.
   */
  protected meta(created: string | null, digestSeen: string | null): string {
    const parts: string[] = [];
    if (created) {
      parts.push(`saved ${created}`);
    }
    if (digestSeen) {
      parts.push(`seen ${digestSeen}`);
    }
    return parts.join(' · ');
  }
}
