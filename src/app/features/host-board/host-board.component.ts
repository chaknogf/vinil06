import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal
} from '@angular/core';
import { ANSWER_DURATION_MS, GamePhase, RoomState } from '../../core/models/game.models';
import { AudioService } from '../../core/services/audio.service';
import { GameSessionService } from '../../core/services/game-session.service';
import { HostAudioControllerService } from '../../core/services/host-audio-controller.service';
import { LOCAL_PLAYER_ID } from '../../core/services/game-engine.service';
import { HostAudioPanelComponent } from '../../shared/components/host-audio-panel/host-audio-panel.component';
import { KaraokeRouletteCardComponent } from '../../shared/components/karaoke-roulette-card/karaoke-roulette-card.component';
import { LeaderboardPanelComponent } from '../../shared/components/leaderboard-panel/leaderboard-panel.component';
import { PodiumComponent } from '../../shared/components/podium/podium.component';
import { RoundTimerBarComponent } from '../../shared/components/round-timer-bar/round-timer-bar.component';
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
    HostAudioPanelComponent,
    RoundTimerBarComponent
  ],
  templateUrl: './host-board.component.html',
  styleUrl: './host-board.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HostBoardComponent {
  readonly state = input.required<RoomState>();
  readonly session = inject(GameSessionService);
  readonly audio = inject(AudioService);
  readonly hostAudio = inject(HostAudioControllerService);

  readonly view = signal<'control' | 'cards'>('control');
  readonly copied = signal(false);
  readonly copyError = signal(false);
  readonly presenceOpen = signal(false);
  readonly exitConfirm = signal(false);

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
        return `Ronda en curso · ${this.phaseLabel()}`;
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
      LOBBY:
        this.session.connection() === 'connected' ? 'Sala abierta' : 'Preparando sala…',
      SPINNING: this.state().audioWaiting
        ? this.hostAudio.mode() === 'SPOTIFY_PREMIUM'
          ? 'Esperando a Spotify…'
          : 'Preparando audio…'
        : 'Sorteando',
      LISTEN_8S: `Fase 1 · Escucha (${this.listenLabel()})`,
      FLIP_6S: 'Fase 2 · Responde (6s)',
      ROUND_RESULT: 'Resultado',
      KARAOKE_TURN: 'Karaoke en curso',
      PODIUM: 'Podio final'
    };
    return labels[this.phase()] ?? this.phase();
  }

  /** Cronómetro del anfitrión: antes no había cuenta atrás en escucha/respuesta. */
  readonly showHostTimer = computed(
    () => this.phase() === 'LISTEN_8S' || this.phase() === 'FLIP_6S'
  );
  readonly hostTimerDuration = computed(() =>
    this.phase() === 'LISTEN_8S'
      ? this.state().listenDurationMs
      : ANSWER_DURATION_MS
  );
  readonly hostTimerVariant = computed<'listen' | 'flip'>(() =>
    this.phase() === 'LISTEN_8S' ? 'listen' : 'flip'
  );
  readonly hostTimerLabel = computed(() =>
    this.phase() === 'LISTEN_8S'
      ? `ESCUCHA (${this.listenLabel()}) · CARTAS BLOQUEADAS`
      : 'RESPONDE AHORA · 6s'
  );

  /** La pista correcta y quién puntúa, también para lectores de pantalla. */
  readonly resultSummary = computed(() => {
    const state = this.state();
    const correct = state.options.find((option) => option.id === state.correctId);
    const winners = state.results
      .filter((result) => result.points > 0)
      .map((result) => {
        const name = state.players.find((player) => player.id === result.playerId)?.name ?? 'Alguien';
        return `${name} +${result.points}`;
      });
    return { correct: correct?.title ?? '', artist: correct?.artist ?? '', winners };
  });

  /** Anuncio único por cambio de fase (los timers siguen con aria-live="off"). */
  readonly phaseAnnouncement = computed(() => {
    switch (this.phase() as GamePhase) {
      case 'LISTEN_8S': return `Escucha activa · ${this.listenLabel()}`;
      case 'FLIP_6S': return 'Responde ahora · 6 segundos';
      case 'ROUND_RESULT': {
        const summary = this.resultSummary();
        return `Ronda cerrada. Correcta: ${summary.correct || 'sin datos'}. ${
          summary.winners.length ? `Puntos: ${summary.winners.join(', ')}` : 'Nadie acertó'
        }`;
      }
      case 'KARAOKE_TURN': return 'Turno de karaoke en curso';
      case 'PODIUM': return 'Podio final';
      default: return this.phaseLabel();
    }
  });

  mainAction(): void {
    // En la última ronda el botón dice "Ver podio final": debe terminar la
    // partida, no girar una ronda 13. showPodium() ya existe en el motor.
    if (this.phase() === 'ROUND_RESULT' && this.isLastRound()) {
      this.session.showPodium();
      return;
    }
    this.session.advance();
  }

  async copyCode(): Promise<void> {
    this.copyError.set(false);
    try {
      await navigator.clipboard.writeText(this.session.copyInviteLink());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      // Antes fallaba en silencio: el host creía que ya compartió el enlace.
      this.copyError.set(true);
    }
  }

  exit(): void {
    this.exitConfirm.set(false);
    this.session.leave();
  }

  /** Cierra la sala efímera (o solo desconecta si el proveedor no la conserva). */
  closeRoom(): void {
    this.exitConfirm.set(false);
    this.session.closeRoom();
  }

  showPrivacy(): void {
    // El modal es el mismo; sin setup pendiente sus acciones solo lo cierran.
    this.session.privacyVisible.set(true);
  }
}
