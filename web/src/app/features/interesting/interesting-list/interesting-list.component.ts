import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Placeholder for Phase 5's interesting-items feature.
 * Phase 5 will replace this component body with the real implementation.
 */
@Component({
  selector: 'app-interesting-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host { display: block; }`],
  template: `<p>Interesting items — coming soon</p>`,
})
export class InterestingListComponent {}
