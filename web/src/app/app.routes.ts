import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'digests' },
  {
    path: 'digests',
    loadComponent: () =>
      import('./features/digests/digest-list/digest-list.component').then(
        (m) => m.DigestListComponent,
      ),
  },
  {
    path: 'digests/:date',
    loadComponent: () =>
      import('./features/digests/digest-detail/digest-detail.component').then(
        (m) => m.DigestDetailComponent,
      ),
  },
  {
    path: 'interesting',
    loadComponent: () =>
      import('./features/interesting/interesting-list/interesting-list.component').then(
        (m) => m.InterestingListComponent,
      ),
  },
];
