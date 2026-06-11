import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './tokens';
import { Digest, DigestListResponse } from './models';

/**
 * Stateless service for the digest REST API.
 *
 * Deliberately thin — it maps HTTP calls to typed observables and lets
 * components own all loading/error state via signals.
 */
@Injectable({ providedIn: 'root' })
export class DigestService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /**
   * Fetch a page of digest summaries (newest-first).
   * @param cursor Optional pagination cursor returned by the previous page.
   */
  list(cursor?: string): Observable<DigestListResponse> {
    let params = new HttpParams();
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    return this.http.get<DigestListResponse>(`${this.base}/digests`, { params });
  }

  /**
   * Fetch the full markdown for a single digest by date string (YYYY-MM-DD).
   * The caller is responsible for handling 404 (HttpErrorResponse with status 404).
   */
  get(date: string): Observable<Digest> {
    return this.http.get<Digest>(`${this.base}/digests/${date}`);
  }
}
