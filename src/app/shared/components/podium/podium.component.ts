import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { comparePlayersByRank, Player } from '../../../core/models/game.models';

@Component({
  selector: 'app-podium',
  templateUrl: './podium.component.html',
  styleUrl: './podium.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PodiumComponent {
  readonly players = input.required<readonly Player[]>();
  readonly title = input('¡Resultados finales!');
  readonly subtitle = input('Así quedó el marcador tras las 12 rondas.');
  readonly actionLabel = input('Jugar otra partida (limpiar memoria)');
  readonly showAction = input(false);
  readonly highlightId = input('');

  readonly newGame = output<void>();

  readonly ranked = computed(() => [...this.players()].sort(comparePlayersByRank));

  readonly winner = computed(() => this.ranked()[0]);

  medal(rank: number): string {
    return rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
  }
}
