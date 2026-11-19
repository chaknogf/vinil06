import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { KaraokeTurn } from '../../../core/models/game.models';
import { AlbumArtComponent } from '../album-art/album-art.component';
import { RoundTimerBarComponent } from '../round-timer-bar/round-timer-bar.component';

/**
 * Tarjeta de turno de Karaoke Ruleta Rusa: género, año, canción, jugador,
 * reto corto de canto y el comodín único por partida.
 */
@Component({
  selector: 'app-karaoke-roulette-card',
  standalone: true,
  imports: [AlbumArtComponent, RoundTimerBarComponent],
  templateUrl: './karaoke-roulette-card.component.html',
  styleUrl: './karaoke-roulette-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KaraokeRouletteCardComponent {
  readonly turn = input.required<KaraokeTurn>();
  readonly genre = input('');
  readonly year = input<string | number | null>(null);
  readonly startedAt = input(0);
  readonly clockOffset = input(0);
  readonly canInteract = input(false);
  readonly active = input(true);

  readonly wildcard = output<void>();
  readonly done = output<void>();

  readonly canUseWildcard = computed(
    () => this.canInteract() && !this.turn().wildcardUsed && this.turn().wildcardsLeft > 0
  );
}
