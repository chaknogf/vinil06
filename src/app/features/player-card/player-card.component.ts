import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GamePhase, RoomState } from '../../core/models/game.models';
import { LeaderboardPanelComponent } from '../../shared/components/leaderboard-panel/leaderboard-panel.component';
import { PodiumComponent } from '../../shared/components/podium/podium.component';
import { VinylDeckArenaComponent } from './vinyl-deck-arena.component';

/** Vista del jugador: arena de cartas + tablero en vivo + podio final. */
@Component({
  selector: 'app-player-card',
  standalone: true,
  imports: [VinylDeckArenaComponent, LeaderboardPanelComponent, PodiumComponent],
  templateUrl: './player-card.component.html',
  styleUrl: './player-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerCardComponent {
  readonly state = input.required<RoomState>();
  readonly clientId = input('');
  readonly clockOffset = input(0);
  readonly canInteract = input(true);

  readonly phase = computed<GamePhase>(() => this.state().phase);

  readonly podiumTitle = computed(() => {
    const sorted = [...this.state().players].sort((a, b) => b.score - a.score);
    const index = sorted.findIndex((player) => player.id === this.clientId());
    if (index === 0) return '¡Ganaste la partida!';
    if (index >= 0) return `¡${sorted[0]?.name ?? 'La sala'} lidera el podio!`;
    return '¡Resultados finales!';
  });

  readonly podiumSubtitle = computed(() => {
    const sorted = [...this.state().players].sort((a, b) => b.score - a.score);
    const index = sorted.findIndex((player) => player.id === this.clientId());
    const me = sorted[index];
    if (!me) return 'Así quedó el marcador tras las 12 rondas.';
    return `Terminaste en el puesto #${index + 1} con ${me.score} puntos en 12 rondas.`;
  });
}
