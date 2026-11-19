import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal
} from '@angular/core';
import { AudioService } from '../../../core/services/audio.service';
import { HapticsService } from '../../../core/services/haptics.service';

export type TimerVariant = 'listen' | 'flip' | 'karaoke';

/**
 * Cronómetro de ronda (8.0s de escucha / 6.0s de respuesta / turno karaoke).
 * requestAnimationFrame + performance.now(), anclado al reloj del host para
 * que todas las pestañas vean el mismo tiempo. La urgencia aparece en los 2s finales.
 */
@Component({
  selector: 'app-round-timer-bar',
  standalone: true,
  templateUrl: './round-timer-bar.component.html',
  styleUrl: './round-timer-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoundTimerBarComponent {
  readonly durationMs = input(6000);
  readonly startedAt = input(0);
  readonly clockOffset = input(0);
  readonly variant = input<TimerVariant>('listen');
  readonly label = input('ESCUCHA ACTIVA · CARTAS BLOQUEADAS');
  readonly active = input(true);
  readonly announceUrgent = input(true);

  readonly #audio = inject(AudioService);
  readonly #haptics = inject(HapticsService);

  readonly remainingMs = signal(0);
  readonly progress = signal(0);

  readonly seconds = computed(() => (this.remainingMs() / 1000).toFixed(1));
  readonly percent = computed(() => Math.round(this.progress() * 100));
  readonly urgent = computed(() => this.remainingMs() > 0 && this.remainingMs() <= 2000);

  #raf = 0;
  #lastUrgentSecond = -1;

  constructor() {
    effect(() => {
      const started = this.startedAt();
      const duration = this.durationMs();
      const offset = this.clockOffset();
      const active = this.active();
      this.#restart(started, duration, offset, active);
    });

    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.#raf));
  }

  #restart(started: number, duration: number, offset: number, active: boolean): void {
    cancelAnimationFrame(this.#raf);
    this.#lastUrgentSecond = -1;

    if (!started || !active || duration <= 0) {
      this.remainingMs.set(0);
      this.progress.set(0);
      return;
    }

    // `started` viene del reloj del host: compensamos el desfase una vez y
    // avanzamos con un reloj monotónico de alta resolución.
    const hostAtStart = Date.now() + offset;
    const perfAtStart = performance.now();

    const tick = (): void => {
      const hostNow = hostAtStart + (performance.now() - perfAtStart);
      const remaining = Math.max(0, Math.min(duration, duration - (hostNow - started)));
      this.remainingMs.set(remaining);
      this.progress.set(remaining / duration);

      if (remaining > 0 && remaining <= 2000 && this.announceUrgent()) {
        const second = Math.ceil(remaining / 1000);
        if (second !== this.#lastUrgentSecond) {
          this.#lastUrgentSecond = second;
          this.#audio.urgentTick();
          this.#haptics.urgent();
        }
      }

      if (remaining > 0) this.#raf = requestAnimationFrame(tick);
    };

    tick();
  }
}
