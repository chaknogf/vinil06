import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Player, RoundResultEntry } from '../../../core/models/game.models';

interface RankedPlayer {
  readonly player: Player;
  readonly rank: number;
  readonly delta: number;
}

/** Tablero de posiciones en vivo y podio final de las 12 rondas. */
@Component({
  selector: 'app-leaderboard-panel',
  standalone: true,
  templateUrl: './leaderboard-panel.component.html',
  styleUrl: './leaderboard-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaderboardPanelComponent {
  readonly players = input.required<readonly Player[]>();
  readonly results = input<readonly RoundResultEntry[]>([]);
  readonly highlightId = input('');
  readonly title = input('Tablero de posiciones');
  readonly caption = input('+2 1ro · +1 Acierto');
  readonly final = input(false);

  readonly ranked = computed<RankedPlayer[]>(() => {
    const deltas = new Map(this.results().map((result) => [result.playerId, result.points]));
    return [...this.players()]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((player, index) => ({
        player,
        rank: index + 1,
        delta: deltas.get(player.id) ?? 0
      }));
  });

  readonly podium = computed(() => this.ranked().slice(0, 3));

  medal(rank: number): string {
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
  }
}
