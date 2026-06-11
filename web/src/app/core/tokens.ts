import { InjectionToken } from '@angular/core';

/**
 * Base URL for all API requests. Override this token in providers
 * (e.g., in tests or micro-frontend shells) to redirect traffic without
 * touching service code.
 *
 * Default: '/api' — works in development with the proxy config and in
 * production where the Worker is mounted at the same origin under /api.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});
