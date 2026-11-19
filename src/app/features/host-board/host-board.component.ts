import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal
} from '@angular/core';
import { RoomState } from '../../core/models/game.models';
import { AudioService } from '../../core/services/audio.service';
import { GameSessionService } from '../../core/services/game-session.service';
import { LOCAL_PLAYER_ID } from '../../core/services/game-engine.service';
import { HostAudioPanelComponent } from '../../shared/components/host-audio-panel/host-audio-panel.component';
import { KaraokeRouletteCardComponent } from '../../shared/components/karaoke-roulette-card/karaoke-roulette-card.component';
import { LeaderboardPanelComponent } from '../../shared/components/leaderboard-panel/leaderboard-panel.component';
import { PodiumComponent } from '../../shared/components/podium/podium.component';
import { RouletteComponent } from '../../shared/components/roulette/roulette.component';
import { PlayerCardComponent } from '../player-card/player-card.component';

@Component({
  selector: 'app-host-board',
  imports: [
    RouletteComponent,
    LeaderboardPanelComponent,
    PodiumComponent,
    PlayerCardComponent,
    KaraokeRouletteCardComponent,
    HostAudioPanelComponent
  ],
  templateUrl: './host-board.component.html',
  styleUrl: './host-board.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HostBoardComponent {
  readonly state = input.required<RoomState>();
  readonly session = inject(GameSessionService);
  readonly audio = inject(AudioService);

  readonly view = signal<'control' | 'cards'>('control');
  readonly copied = signal(false);

  readonly phase = computed(() => this.state().phase);
  readonly localPlayerId = computed(() => {
    const id = this.session.localPlayerId();
    return id === LOCAL_PLAYER_ID && this.state().players.some((p) => p.id === id) ? id : '';
  });
  readonly isLastRound = computed(
    () => this.state().roundIndex >= this.state().totalRounds - 1
  );

  /** Canción que debe sonar en esta ronda, visible solo en el tablero del host. */
  readonly spotifyTrack = computed(() => this.session.hostTrack());

  readonly actionLabel = computed(() => {
    switch (this.phase()) {
      case 'LOBBY':
        return 'Girar ruleta · Ronda 1';
      case 'ROUND_RESULT':
        return this.isLastRound() ? 'Ver podio final' : 'Siguiente ronda';
      case 'PODIUM':
        return 'Jugar otra partida';
      default:
        return 'Ronda en curso…';
    }
  });

  readonly canAdvance = computed(
    () => this.phase() === 'LOBBY' || this.phase() === 'ROUND_RESULT' || this.phase() === 'PODIUM'
  );

  modeLabel(): string {
    switch (this.state().mode) {
      case 'KARAOKE':
        return 'Karaoke Ruleta Rusa';
      case 'MIXED':
        return 'Mixto · Cartas + Karaoke';
      default:
        return '12 Rondas · Cartas Tocadiscos';
    }
  }

  /** Etiqueta de escucha con el tiempo exacto elegido por el host (8–15s). */
  readonly listenLabel = computed(() => {
    const sec = this.state().listenDurationMs / 1000;
    return `${Number.isInteger(sec) ? sec : sec.toFixed(1)}s`;
  });

  phaseLabel(): string {
    const labels: Record<string, string> = {
      LOBBY: 'Sala abierta',
      SPINNING: 'Sorteando',
      LISTEN_8S: `Fase 1 · Escucha (${this.listenLabel()})`,
      FLIP_6S: 'Fase 2 · Responde (6s)',
      ROUND_RESULT: 'Resultado',
      KARAOKE_TURN: 'Karaoke en curso',
      PODIUM: 'Podio final'
    };
    return labels[this.phase()] ?? this.phase();
  }

  mainAction(): void {
    this.session.advance();
  }

  async copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.session.copyInviteLink());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      this.copied.set(false);
    }
  }

  exit(): void {
    this.session.leave();
  }

  showPrivacy(): void {
    // El modal es el mismo; sin setup pendiente sus acciones solo lo cierran.
    this.session.privacyVisible.set(true);
  }
}
