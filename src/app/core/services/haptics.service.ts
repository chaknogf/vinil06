import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Feedback háptico discreto y opcional. */
@Injectable({ providedIn: 'root' })
export class HapticsService {
  readonly enabled = signal(environment.features.haptics && 'vibrate' in navigator);

  vibrate(pattern: number | number[]): void {
    if (!this.enabled()) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Algunos navegadores móviles lo bloquean: se ignora.
    }
  }

  flip(): void {
    this.vibrate([18, 35, 12]);
  }

  tap(): void {
    this.vibrate(12);
  }

  urgent(): void {
    this.vibrate(25);
  }
}
