import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Player, RoundResultEntry } from '../../../core/models/game.models';

interface RankedPlayer {
  readonly player: Player;
  readonly rank: number;
  readonly delta: number;
}

@Component({
  selector: 'app-leaderboard',
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaderboardComponent {
  readonly players = input.required<readonly Player[]>();
  readonly results = input<readonly RoundResultEntry[]>([]);
  readonly highlightId = input('');
  readonly title = input('Tablero de posiciones');
  readonly caption = input('+2 1ro · +1 Acierto');

  readonly ranked = computed<RankedPlayer[]>(() => {
    const deltas = new Map(this.results().map((r) => [r.playerId, r.points]));
    return [...this.players()]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((player, index) => ({
        player,
        rank: index + 1,
        delta: deltas.get(player.id) ?? 0
      }));
  });

  medal(rank: number): string {
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
  }
}
