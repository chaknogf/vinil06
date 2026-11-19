import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { GamePhase, RoomState } from '../../core/models/game.models';
import { PreviewAudioService } from '../../core/services/preview-audio.service';
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

  readonly audio = inject(PreviewAudioService);
  readonly phase = computed<GamePhase>(() => this.state().phase);

  #lastAudioKey = '';

  constructor() {
    effect(() => {
      const state = this.state();
      const listening = state.phase === 'LISTEN_8S' || state.phase === 'KARAOKE_TURN';
      // El host publica un snapshot cada segundo: solo reaccionamos a cambios
      // reales de pista/fase para no reiniciar el audio a cada latido.
      const key = listening ? `${state.phase}|${state.audioUrl ?? ''}` : '';
      if (key === this.#lastAudioKey) return;
      this.#lastAudioKey = key;
      if (!key || !state.audioUrl) {
        this.audio.stop();
        return;
      }
      const elapsed = Date.now() - this.clockOffset() - state.phaseStartedAt;
      this.audio.play(state.audioUrl, Math.max(0, elapsed) / 1000);
    });
  }

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
