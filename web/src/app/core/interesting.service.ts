import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from './tokens';
import { InterestingItem } from './models';

/** Shape of GET /api/interesting. */
interface InterestingListResponse {
  items: InterestingItem[];
}

/** Shape of the 201 body returned by POST /api/interesting. */
interface CreateInterestingResponse {
  id: string;
  title: string;
  created: string;
}

/**
 * Stateful service for the "interesting items" REST API.
 *
 * Unlike DigestService (which is deliberately stateless), this service owns
 * the canonical client-side list so multiple components — the list view and
 * the save-selection panel — stay in sync. State lives in signals; loading and
 * error are exposed read-only for components to render.
 */
@Injectable({ providedIn: 'root' })
export class InterestingService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** Canonical list, newest-first. Mutated only through this service. */
  private readonly _items = signal<InterestingItem[]>([]);
  readonly items = this._items.asReadonly();

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  /**
   * Fetch the full list (newest-first) and replace the local cache.
   * Manages loading/error signals; never throws to the caller.
   */
  load(): void {
    this._loading.set(true);
    this._error.set(null);
    this.http.get<InterestingListResponse>(`${this.base}/interesting`).subscribe({
      next: (res) => {
        this._items.set(res.items);
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Failed to load interesting items. Please try again.');
        this._loading.set(false);
      },
    });
  }

  /**
   * Create a new item from a title + markdown body.
   *
   * On success the new item is prepended to the local list so the UI updates
   * without a refetch. The prepend seeds the signal even if load() was never
   * called. The observable is returned so callers (the save panel) can react
   * to success/error themselves.
   */
  create(
    title: string,
    markdown: string,
  ): Observable<CreateInterestingResponse> {
    return this.http
      .post<CreateInterestingResponse>(`${this.base}/interesting`, {
        title,
        markdown,
      })
      .pipe(
        tap((res) => {
          const item: InterestingItem = {
            id: res.id,
            title: res.title,
            created: res.created,
            digestSeen: null,
          };
          this._items.update((prev) => [item, ...prev]);
        }),
      );
  }

  /**
   * Delete an item optimistically: it disappears from the list immediately,
   * then the DELETE is issued. If the request fails the item is restored at
   * its original index and an error is surfaced.
   */
  remove(id: string): void {
    const items = this._items();
    const index = items.findIndex((it) => it.id === id);
    if (index === -1) {
      return;
    }
    const removed = items[index];

    this._items.update((prev) => prev.filter((it) => it.id !== id));
    this._error.set(null);

    this.http.delete<void>(`${this.base}/interesting/${id}`).subscribe({
      error: () => {
        this._items.update((prev) => {
          const next = [...prev];
          next.splice(index, 0, removed);
          return next;
        });
        this._error.set('Failed to delete item. Please try again.');
      },
    });
  }
}
