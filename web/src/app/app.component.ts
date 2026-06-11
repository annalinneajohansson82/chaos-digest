import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Root shell component — minimal nav + outlet.
 * No global styles; all styling is scoped here via :host.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styles: [`
    :host {
      display: block;
      font-family: system-ui, sans-serif;
    }
    nav {
      display: flex;
      gap: 1rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #e5e7eb;
    }
    nav a {
      text-decoration: none;
      color: #6b7280;
      font-weight: 500;
    }
    nav a.active {
      color: #111827;
    }
    main {
      padding: 1rem;
    }
  `],
  template: `
    <nav>
      <a routerLink="digests" routerLinkActive="active">Digests</a>
      <a routerLink="interesting" routerLinkActive="active">Interesting</a>
    </nav>
    <main>
      <router-outlet />
    </main>
  `,
})
export class AppComponent {
  readonly title = 'chaos digest';
}
