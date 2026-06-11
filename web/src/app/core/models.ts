/**
 * A single entry in the digest list — just the date key.
 * The full markdown is fetched separately via DigestService.get().
 */
export interface DigestSummary {
  date: string;
}

/** Paginated response from GET /api/digests */
export interface DigestListResponse {
  items: DigestSummary[];
  nextCursor: string | null;
}

/** Full digest object returned by GET /api/digests/:date */
export interface Digest {
  date: string;
  markdown: string;
}

/**
 * A curated "interesting" item — used by Phase 5 (InterestingListComponent).
 * Defined here so services and types are consistent across phases.
 */
export interface InterestingItem {
  id: string;
  title: string;
  /** ISO-8601 creation timestamp, null if not yet set */
  created: string | null;
  /** The digest date on which this item was first seen, null if not yet linked */
  digestSeen: string | null;
}
