import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal
} from '@angular/core';
import { svgCover, VINIL06_CATALOG } from '../../core/data/vinil06-catalog';
import {
  ANSWER_DURATION_MS,
  GamePhase,
  LISTEN_DURATION_MS,
  PublicOption,
  ShuffledOption
} from '../../core/models/game.models';
import { AudioService } from '../../core/services/audio.service';
import { GameSessionService } from '../../core/services/game-session.service';
import { shuffleArray } from '../../core/utils/random';
import { youtubeThumbnailUrl } from '../../core/utils/youtube';
import { KaraokeRouletteCardComponent } from '../../shared/components/karaoke-roulette-card/karaoke-roulette-card.component';
import { RoundTimerBarComponent, TimerVariant } from '../../shared/components/round-timer-bar/round-timer-bar.component';
import { VinylDeckGridComponent } from '../../shared/components/vinyl-deck-grid/vinyl-deck-grid.component';

type FeedbackStatus = 'IDLE' | 'CORRECT_FIRST' | 'CORRECT_OTHER' | 'WRONG' | 'TIMEOUT';

interface RoundFeedback {
  readonly status: FeedbackStatus;
  readonly pointsEarned: number;
}

/**
 * Arena del jugador: HUD compacto, cronómetro de 8.0s/6.0s, las 4 cartas
 * tocadiscos con giro 3D, feedback de ronda y transición al turno de karaoke.
 * Conectado a GameEngineService a través de GameSessionService (Signals + OnPush).
 */
@Component({
  selector: 'app-vinyl-deck-arena',
  standalone: true,
  imports: [RoundTimerBarComponent, VinylDeckGridComponent, KaraokeRouletteCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (roomState(); as state) {
      <section class="deck-shell" [attr.data-phase]="phase()">
        <span class="sr-only" role="status" aria-live="assertive">{{ phaseAnnouncement() }}</span>

        <!-- Cabecera compacta de sala y progreso -->
        <header class="hud-top">
          <div class="round-meta">
            <span class="badge-room"><span class="live-dot"></span> #{{ state.roomCode }}</span>
            <span class="badge-round">RONDA {{ roundNumber() }}/{{ state.totalRounds }}</span>
            @if (drawLabel()) {
              <span class="badge-draw">{{ drawLabel() }}</span>
            }
          </div>

          <div class="hud-actions">
            <button
              type="button"
              class="icon-mini"
              [attr.aria-label]="audio.enabled() ? 'Silenciar sonido' : 'Activar sonido'"
              (click)="toggleSound()"
            >
              @if (audio.enabled()) {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
                </svg>
              } @else {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
                </svg>
              }
            </button>
            <button type="button" class="privacy-mini" (click)="openPrivacy()">Sesión efímera</button>
            <div class="score-pill">
              <span>PTS</span>
              <strong class="tabular">{{ localPlayerScore() }}</strong>
            </div>
            @if (selectionFeedback(); as feedbackText) {
              <span class="answered-chip" role="status">{{ feedbackText }}</span>
            }
          </div>
        </header>

        <!-- Cronómetro configurable 8–15s (escucha) / 6.0s (respuesta) / karaoke -->
        @if (showTimer()) {
          <app-round-timer-bar
            [durationMs]="timerDuration()"
            [startedAt]="state.phaseStartedAt"
            [clockOffset]="session.clockOffset()"
            [variant]="timerVariant()"
            [label]="timerLabel()"
          />
        }

        <!-- Estados de espera y sorteo -->
        @if (phase() === 'SPINNING') {
          <div class="status-banner is-spinning">
            <span class="mini-disc" aria-hidden="true"></span>
            <p>Girando ruleta de género y año…</p>
          </div>
        }

        @if (phase() === 'LOBBY') {
          <div class="status-banner is-lobby">
            <span class="mini-disc" aria-hidden="true"></span>
            <p>Sala abierta · esperando a que el anfitrión gire la ruleta</p>
          </div>
        }

        <!-- Resolución de ronda y puntaje -->
        @if (phase() === 'ROUND_RESULT' && state.karaoke; as karaokeTurn) {
          <div class="status-banner is-result result-pop" [class.is-win]="feedback().pointsEarned > 0">
            @if (karaokeTurn.singerId === session.localPlayerId()) {
              <strong>
                Tu turno de karaoke ·
                {{ feedback().pointsEarned > 0 ? '¡Bien cantado! +' + feedback().pointsEarned + ' puntos' : 'pasaste · +0 puntos' }}
              </strong>
            } @else {
              <strong>Turno de {{ karaokeTurn.singerName }} · esperando la siguiente ronda</strong>
            }
          </div>
        } @else if (phase() === 'ROUND_RESULT') {
          <div
            class="status-banner is-result result-pop"
            [class.is-win]="feedback().pointsEarned > 0"
          >
            @switch (feedback().status) {
              @case ('CORRECT_FIRST') {
                <strong>¡Primero en acertar! +2 puntos</strong>
              }
              @case ('CORRECT_OTHER') {
                <strong>¡Acierto a tiempo! +1 punto</strong>
              }
              @case ('WRONG') {
                <strong>Esa no era · +0 puntos</strong>
              }
              @case ('TIMEOUT') {
                <strong>Se agotaron los 6 segundos · +0 puntos</strong>
              }
              @default {
                <strong>Ronda cerrada</strong>
              }
            }
          </div>
        }

        <!-- Turno de Karaoke Ruleta Rusa (modo puro o mixto) -->
        @if (phase() === 'KARAOKE_TURN' && state.karaoke; as turn) {
          <app-karaoke-roulette-card
            [turn]="turn"
            [genre]="state.draw?.genre ?? ''"
            [year]="state.draw?.decade ?? null"
            [startedAt]="state.phaseStartedAt"
            [clockOffset]="session.clockOffset()"
            [canInteract]="isSinger()"
            (wildcard)="session.useWildcard()"
            (done)="session.karaokeDone(true)"
          />
        } @else if (showCards()) {
          <!-- Cuadrícula de 4 cartas tipo naipe + tocadiscos -->
          <app-vinyl-deck-grid
            [options]="options()"
            [phase]="phase()"
            [flipped]="areCardsFlipped()"
            [locked]="cardsLocked()"
            [canAnswer]="canAnswer()"
            [selectedId]="selectedTrackId()"
            [correctId]="state.correctId"
            [spinning]="phase() === 'LISTEN_8S'"
            [status]="feedback().status"
            (select)="onSelectCard($event)"
          />
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .deck-shell {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      padding: 0.9rem;
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(19, 24, 38, 0.94), rgba(11, 13, 20, 0.98));
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #f8fafc;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
    }

    .hud-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .round-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .badge-room,
    .badge-round,
    .badge-draw {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.28rem 0.6rem;
      border-radius: 999px;
      white-space: nowrap;
    }

    .badge-room {
      background: rgba(16, 185, 129, 0.15);
      color: #6ee7b7;
      border: 1px solid rgba(52, 211, 153, 0.3);
    }

    .live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #34d399;
      box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.16);
      animation: dotPulse 1.6s ease-in-out infinite;
    }

    .badge-round {
      background: rgba(124, 58, 237, 0.22);
      color: #ddd6fe;
      border: 1px solid rgba(167, 139, 250, 0.35);
    }

    .badge-draw {
      background: rgba(15, 23, 42, 0.85);
      color: #cbd5e1;
      border: 1px solid rgba(148, 163, 184, 0.2);
      text-transform: none;
      max-width: 190px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .hud-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .answered-chip {
      align-self: center;
      padding: 0.3rem 0.6rem;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 800;
      color: #6ee7b7;
      background: rgba(52, 211, 153, 0.14);
      border: 1px solid rgba(52, 211, 153, 0.35);
    }

    .icon-mini {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #6ee7b7;
    }

    .icon-mini svg {
      width: 16px;
      height: 16px;
    }

    .privacy-mini {
      min-height: 44px;
      padding: 0 0.6rem;
      border-radius: 10px;
      font-size: 0.68rem;
      font-weight: 700;
      color: #cbd5e1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .score-pill {
      display: inline-flex;
      align-items: baseline;
      gap: 0.35rem;
      padding: 0.28rem 0.7rem;
      border-radius: 999px;
      background: rgba(251, 191, 36, 0.12);
      border: 1px solid rgba(251, 191, 36, 0.3);
    }

    .score-pill span {
      font-size: 0.65rem;
      font-weight: 800;
      color: #fcd34d;
    }

    .score-pill strong {
      font-size: 0.95rem;
      color: #f8fafc;
    }

    .status-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      padding: 0.65rem 0.85rem;
      border-radius: 14px;
      font-size: 0.84rem;
      text-align: center;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(148, 163, 184, 0.22);
    }

    .status-banner.is-win {
      background: rgba(16, 185, 129, 0.16);
      border-color: rgba(52, 211, 153, 0.45);
      color: #a7f3d0;
    }

    .mini-disc {
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      border-radius: 50%;
      border: 2px solid #a855f7;
      border-top-color: transparent;
      animation: spinVinyl 700ms linear infinite;
    }

    @media (min-width: 480px) {
      .deck-shell {
        padding: 1.1rem;
      }
    }

    @media (min-width: 900px) {
      .deck-shell {
        padding: 1.4rem;
        gap: 1.1rem;
        border-radius: 26px;
      }

      .badge-room,
      .badge-round,
      .badge-draw {
        font-size: 0.78rem;
        padding: 0.35rem 0.7rem;
      }

      .hud-actions {
        gap: 0.6rem;
      }

      .score-pill strong {
        font-size: 1.1rem;
      }

      .status-banner {
        font-size: 0.95rem;
        padding: 0.8rem 1rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .mini-disc,
      .live-dot {
        animation: none;
      }
    }
  `
})
export class VinylDeckArenaComponent {
  readonly session = inject(GameSessionService);
  readonly audio = inject(AudioService);
  readonly #host = inject(ElementRef<HTMLElement>);

  readonly roomState = this.session.viewState;
  readonly phase = computed<GamePhase>(() => this.roomState()?.phase ?? 'LOBBY');
  readonly roundNumber = computed(() => (this.roomState()?.roundIndex ?? 0) + 1);
  readonly drawLabel = computed(() => this.roomState()?.draw?.label ?? '');

  /** Opciones ya enriquecidas y barajadas en este dispositivo. */
  readonly options = signal<ShuffledOption[]>([]);
  readonly selectedTrackId = signal<string | null>(null);

  readonly cardsLocked = computed(() => this.phase() === 'LISTEN_8S');
  readonly canAnswer = computed(
    () => this.phase() === 'FLIP_6S' && this.selectedTrackId() === null
  );

  readonly areCardsFlipped = computed(() => {
    const currentPhase = this.phase();
    return currentPhase === 'FLIP_6S' || currentPhase === 'ROUND_RESULT';
  });

  /** El turno de karaoke ya lleva su propia barra en la tarjeta: evitar doble timer y doble vibración. */
  readonly showTimer = computed(() => {
    const currentPhase = this.phase();
    return currentPhase === 'LISTEN_8S' || currentPhase === 'FLIP_6S';
  });

  /** Tras un karaoke las cartas de la ronda anterior ya no aplican. */
  readonly showCards = computed(() => {
    const currentPhase = this.phase();
    if (currentPhase === 'ROUND_RESULT' && this.roomState()?.karaoke) return false;
    return (
      (currentPhase === 'LISTEN_8S' ||
        currentPhase === 'FLIP_6S' ||
        currentPhase === 'ROUND_RESULT') &&
      this.options().length > 0
    );
  });

  readonly isSinger = computed(
    () => this.roomState()?.karaoke?.singerId === this.session.localPlayerId()
  );

  readonly timerVariant = computed<TimerVariant>(() => {
    const currentPhase = this.phase();
    if (currentPhase === 'LISTEN_8S') return 'listen';
    if (currentPhase === 'KARAOKE_TURN') return 'karaoke';
    return 'flip';
  });

  readonly timerDuration = computed(() => {
    const currentPhase = this.phase();
    if (currentPhase === 'LISTEN_8S') {
      return this.roomState()?.listenDurationMs ?? LISTEN_DURATION_MS;
    }
    if (currentPhase === 'KARAOKE_TURN') return this.roomState()?.karaoke?.durationMs ?? 18000;
    return ANSWER_DURATION_MS;
  });

  readonly timerLabel = computed(() => {
    switch (this.phase()) {
      case 'LISTEN_8S':
        return 'ESCUCHA ACTIVA · CARTAS BLOQUEADAS';
      case 'KARAOKE_TURN':
        return 'TURNO KARAOKE · CANTA YA';
      default:
        return '¡RESPONDE AHORA! · ORDEN ALEATORIO';
    }
  });

  /** Un solo anuncio por cambio de fase, sin chatter por frame de los timers. */
  readonly phaseAnnouncement = computed(() => {
    switch (this.phase()) {
      case 'LISTEN_8S': return 'Escucha activa · cartas bloqueadas';
      case 'FLIP_6S': return 'Responde ahora · 6 segundos';
      case 'ROUND_RESULT': return 'Ronda cerrada';
      case 'KARAOKE_TURN': return 'Turno de karaoke';
      case 'PODIUM': return 'Podio final';
      default: return 'Sala abierta';
    }
  });

  /** Confirmación inmediata del toque: el envío no tiene ACK y 6s son pocos. */
  readonly selectionFeedback = computed(() => {
    if (this.selectedTrackId() === null) return '';
    if (this.session.connection() !== 'connected') return 'Sin conexión · reintentar';
    return '✓ Respondido · esperando confirmación';
  });

  readonly feedback = computed<RoundFeedback>(() => {
    const state = this.roomState();
    if (!state || state.phase !== 'ROUND_RESULT') return { status: 'IDLE', pointsEarned: 0 };

    const localId = this.session.localPlayerId();
    const result = state.results.find((entry) => entry.playerId === localId);
    const pointsEarned = result?.points ?? 0;

    let status: FeedbackStatus = 'TIMEOUT';
    if (pointsEarned === 2) status = 'CORRECT_FIRST';
    else if (pointsEarned === 1) status = 'CORRECT_OTHER';
    else if (result?.correct === false && result.timeMs !== null) status = 'WRONG';
    else if (result?.correct === false && this.selectedTrackId() !== null) status = 'WRONG';

    return { status, pointsEarned };
  });

  readonly localPlayerScore = computed(() => {
    const state = this.roomState();
    if (!state || state.players.length === 0) return 0;
    const localId = this.session.localPlayerId();
    if (localId) return state.players.find((player) => player.id === localId)?.score ?? 0;
    return state.players.reduce((max, player) => Math.max(max, player.score), 0);
  });

  #shuffleKey = '';

  constructor() {
    effect(() => {
      const state = this.roomState();
      if (!state) {
        this.options.set([]);
        this.#shuffleKey = '';
        return;
      }

      // Fisher-Yates independiente por dispositivo, UNA SOLA VEZ por ronda en
      // cuanto llegan las opciones. Rebarajar al revelar movía las cartas justo
      // cuando empiezan los 6 segundos y la 4ª tardaba ~755 ms en ser legible.
      // El orden ya es distinto en cada pantalla, así que se sigue sin copiar.
      const optionIds = state.options.map((option) => option.id).join(',');
      const key = `${state.roomCode}:${state.roundIndex}:${optionIds}`;
      if (key === this.#shuffleKey) return;
      this.#shuffleKey = key;

      const enriched = state.options.map((option, index) => this.#enrich(option, index));
      this.options.set(shuffleArray(enriched));
    });

    effect(() => {
      const currentPhase = this.phase();
      if (
        currentPhase === 'LOBBY' ||
        currentPhase === 'SPINNING' ||
        currentPhase === 'LISTEN_8S'
      ) {
        this.selectedTrackId.set(null);
      }
    });

    // En 360×640 la segunda fila de cartas podía quedar bajo el pliegue justo
    // al empezar los 6 segundos. Llevamos el arena arriba solo en móvil.
    effect(() => {
      if (this.phase() !== 'FLIP_6S' || window.innerWidth >= 480) return;
      queueMicrotask(() =>
        this.#host.nativeElement.scrollIntoView({ block: 'start', behavior: 'instant' })
      );
    });
  }

  onSelectCard(trackId: string): void {
    if (!this.canAnswer()) return;
    this.selectedTrackId.set(trackId);
    this.session.answer(trackId);
  }

  toggleSound(): void {
    this.audio.toggle();
  }

  openPrivacy(): void {
    this.session.privacyVisible.set(true);
  }

  #enrich(option: PublicOption, slotIndex: number): ShuffledOption {
    const track = VINIL06_CATALOG.find((candidate) => candidate.id === option.id);
    // Miniatura pública del vídeo cuando el catálogo conoce su ID; si falla
    // (offline / 404) VinylDeckGridComponent cae a `coverDataUri` con onError.
    const thumbnail = youtubeThumbnailUrl(option.youtubeVideoId ?? '');
    return {
      ...option,
      cover: thumbnail || option.cover || '',
      slotIndex,
      year: track?.year ?? 0,
      coverDataUri: svgCover(option)
    };
  }
}
