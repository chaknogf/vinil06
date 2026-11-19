import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal
} from '@angular/core';
import { GameMode, RouletteDraw } from '../../../core/models/game.models';

@Component({
  selector: 'app-roulette',
  templateUrl: './roulette.component.html',
  styleUrl: './roulette.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RouletteComponent {
  readonly spinning = input(false);
  readonly draw = input<RouletteDraw | null>(null);
  readonly mode = input<GameMode>('CARDS_12');
  readonly title = input('Ruleta del sorteo');

  readonly rotation = signal(0);
  readonly isKaraoke = computed(() => this.mode() === 'KARAOKE' || this.mode() === 'MIXED');
  readonly showKaraokeDetails = computed(() => this.isKaraoke() && !!this.draw()?.song);

  constructor() {
    effect(() => {
      const draw = this.draw();
      const spinning = this.spinning();
      if (!draw) return;
      const seed = [...`${draw.genre}${draw.decade}${draw.song ?? ''}`].reduce(
        (acc, char) => acc + char.charCodeAt(0),
        0
      );
      this.rotation.update((current) =>
        spinning ? current + 1440 + (seed % 360) : current
      );
    });
  }
}
