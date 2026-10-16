import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** One entry of the main menu. */
interface MenuItem {
  readonly label: string;
  readonly path: string;
}

/**
 * Shared application shell (UC-001). Renders the clinic logo in the header and
 * the main navigation menu (Home, Find Owners, Veterinarians, Error) in the
 * drawer; every page renders inside it.
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  /** Whether the drawer with the main menu is shown. */
  protected readonly drawerOpen = signal(true);

  /** Accessible name of the drawer's navigation landmark. */
  protected readonly navLabel = 'Main menu';

  protected readonly menu: readonly MenuItem[] = [
    { label: 'Home', path: '/' },
    { label: 'Find Owners', path: '/owners/find' },
    { label: 'Veterinarians', path: '/vets' },
    { label: 'Error', path: '/oups' },
  ];
}
