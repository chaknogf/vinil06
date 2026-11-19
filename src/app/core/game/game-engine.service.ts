import { computed, effect, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { VINIL06_CATALOG, VinilTrack } from '../data/vinil06-catalog';
import {
  GameMode,
  PlayerScore,
  ROOM_SYNC_PROVIDER,
  RoomStateSnapshot,
  RoundPhase,
} from '../sync/room-sync.models';

export const LISTEN_DURATION_MS = 8000;
export const FLIP_DURATION_MS = 6000;
export const TOTAL_STANDARD_ROUNDS = 12;

export interface ShuffledOption extends VinilTrack {
  slotIndex: number;
}

export interface HostSessionConfig {
  roomCode: string;
  hostId: string;
  hostNickname: string;
  mode: GameMode;
  packId: string;
  /** Permite inyectar un catálogo sincronizado desde CatalogSyncService */
  catalog?: readonly VinilTrack[];
}

@Injectable({ providedIn: 'root' })
export class GameEngineService implements OnDestroy {
  private readonly syncProvider = inject(ROOM_SYNC_PROVIDER);

  private activeCatalog: readonly VinilTrack[] = VINIL06_CATALOG;
  private readonly usedTrackIds = new Set<string>();
  private readonly answeredInRound = new Set<string>();

  private rafId: number | null = null;
  private phaseStartPerfMs = 0;
  private phaseDurationMs = 0;
  private autoAdvanceTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private role = signal<'HOST' | 'PLAYER' | null>(null);
  private localParticipantId = signal<string>('');
  private localNickname = signal<string>('');

  /** Estado replicado de la sala */
  readonly roomState = signal<RoomStateSnapshot | null>(null);

  /** Tiempo restante en milisegundos de la fase activa (8000ms o 6000ms) */
  readonly remainingMs = signal<number>(0);

  /** Opciones barajadas en orden aleatorio exclusivo de este dispositivo */
  readonly shuffledOptions = signal<ShuffledOption[]>([]);

  /** Respuesta elegida por el jugador local en la ronda activa */
  readonly selectedTrackId = signal<string | null>(null);

  /** Último feedback de ronda para el jugador local */
  readonly lastRoundFeedback = signal<{
    status: 'IDLE' | 'CORRECT_FIRST' | 'CORRECT_OTHER' | 'WRONG' | 'TIMEOUT';
    pointsEarned: number;
  }>({ status: 'IDLE', pointsEarned: 0 });

  readonly isHost = computed(() => this.role() === 'HOST');
  readonly isConnected = this.syncProvider.isConnected;
  readonly phase = computed<RoundPhase>(() => this.roomState()?.phase ?? 'LOBBY');
  readonly cardsLocked = computed(() => this.phase() === 'LISTEN_8S');
  readonly canAnswer = computed(
    () => this.phase() === 'FLIP_6S' && this.selectedTrackId() === null
  );

  readonly remainingSecondsDisplay = computed(() => {
    const secs = Math.max(0, this.remainingMs() / 1000);
    return secs.toFixed(1);
  });

  readonly isUrgentTimer = computed(
    () => this.phase() === 'FLIP_6S' && this.remainingMs() <= 2000 && this.remainingMs() > 0
  );

  readonly leaderboard = computed<PlayerScore[]>(() => {
    const list = this.roomState()?.leaderboard ?? [];
    return [...list].sort((a, b) => b.points - a.points);
  });

  readonly activeKaraokePlayer = computed<PlayerScore | null>(() => {
    const state = this.roomState();
    if (!state?.karaokePlayerId) return null;
    return state.leaderboard.find((p) => p.playerId === state.karaokePlayerId) ?? null;
  });

  constructor() {
    // Sincronizar estado entrante desde el proveedor de red
    effect(() => {
      const incoming = this.syncProvider.state();
      if (!incoming) return;

      const prevState = this.roomState();
      this.roomState.set(incoming);

      const phaseChanged =
        !prevState ||
        prevState.phase !== incoming.phase ||
        prevState.roundNumber !== incoming.roundNumber ||
        prevState.phaseStartedAtUtc !== incoming.phaseStartedAtUtc;

      if (phaseChanged) {
        this.onPhaseEntered(incoming);
      }
    });

    // El anfitrión evalúa respuestas entrantes en tiempo real durante FLIP_6S
    effect(() => {
      const answers = this.syncProvider.incomingAnswers();
      if (!this.isHost() || this.phase() !== 'FLIP_6S') return;

      const current = this.roomState();
      if (!current || !current.correctTrackId) return;

      for (const ans of answers) {
        if (ans.roundNumber !== current.roundNumber) continue;
        if (this.answeredInRound.has(ans.playerId)) continue;

        this.answeredInRound.add(ans.playerId);

        const isCorrect = ans.selectedTrackId === current.correctTrackId;
        if (!isCorrect) continue;

        // Primer acierto de la ronda = +2 pts; siguientes aciertos a tiempo = +1 pt
        const priorCorrectCount = this.countCorrectAnswersInRound(current.roundNumber, ans.playerId);
        const awardedPoints = priorCorrectCount === 0 ? 2 : 1;

        this.awardPointsToPlayer(ans.playerId, awardedPoints);
      }
    });
  }

  private correctAnswerOrder: string[] = [];

  private countCorrectAnswersInRound(roundNumber: number, candidatePlayerId: string): number {
    // Si ya fue registrado en este turno, devolver su índice previo
    return this.correctAnswerOrder.filter((id) => id !== candidatePlayerId).length;
  }

  private awardPointsToPlayer(playerId: string, pointsToAdd: number): void {
    const current = this.roomState();
    if (!current) return;

    this.correctAnswerOrder.push(playerId);

    const updatedLeaderboard = current.leaderboard.map((entry) => {
      if (entry.playerId !== playerId) return entry;
      return {
        ...entry,
        points: entry.points + pointsToAdd,
        lastDelta: entry.lastDelta + pointsToAdd,
      };
    });

    const nextSnapshot: RoomStateSnapshot = {
      ...current,
      leaderboard: updatedLeaderboard,
    };

    this.roomState.set(nextSnapshot);
    void this.syncProvider.broadcastState(nextSnapshot);
  }

  /** Inicia una sala nueva como Anfitrión */
  async createHostSession(config: HostSessionConfig): Promise<void> {
    this.resetLocalBuffers();
    this.activeCatalog =
      config.catalog && config.catalog.length >= 4 ? config.catalog : VINIL06_CATALOG;
    this.role.set('HOST');
    this.localParticipantId.set(config.hostId);
    this.localNickname.set(config.hostNickname);

    const initialSnapshot: RoomStateSnapshot = {
      roomCode: config.roomCode.toUpperCase(),
      mode: config.mode,
      packId: config.packId,
      roundNumber: 0,
      totalRounds: TOTAL_STANDARD_ROUNDS,
      phase: 'LOBBY',
      leaderboard: [],
    };

    await this.syncProvider.joinRoom(initialSnapshot.roomCode, {
      id: config.hostId,
      nickname: config.hostNickname,
      isHost: true,
    });

    await this.syncProvider.broadcastState(initialSnapshot);
  }

  /** Permite a un jugador unirse por código sin cuenta */
  async joinAsPlayer(roomCode: string, playerId: string, nickname: string): Promise<void> {
    this.resetLocalBuffers();
    this.role.set('PLAYER');
    this.localParticipantId.set(playerId);
    this.localNickname.set(nickname);

    await this.syncProvider.joinRoom(roomCode.toUpperCase(), {
      id: playerId,
      nickname,
      isHost: false,
    });
  }

  /** Avanza a la siguiente ronda (solo Anfitrión) */
  async startNextRound(): Promise<void> {
    if (!this.isHost()) return;
    const current = this.roomState();
    if (!current) return;

    this.stopTimerLoop();
    this.clearAutoAdvance();

    const nextRound = current.roundNumber + 1;

    if (nextRound > current.totalRounds) {
      await this.finishGameToPodium();
      return;
    }

    // Resetear deltas de la ronda anterior
    const cleanLeaderboard = current.leaderboard.map((p) => ({
      ...p,
      lastDelta: 0,
    }));

    const isKaraokeRound = this.shouldTriggerKaraokeRound(current.mode, nextRound);

    if (isKaraokeRound) {
      await this.triggerKaraokeRouletteRound(current, nextRound, cleanLeaderboard);
      return;
    }

    // Fase de sorteo de Género y Año
    const { genre, year, options, correctTrack } = this.pickRoundTracks();
    this.usedTrackIds.add(correctTrack.id);
    this.answeredInRound.clear();
    this.correctAnswerOrder = [];

    const spinningSnapshot: RoomStateSnapshot = {
      ...current,
      roundNumber: nextRound,
      phase: 'SPINNING',
      selectedGenre: genre,
      selectedYear: year,
      roundOptions: options,
      correctTrackId: correctTrack.id,
      karaokePlayerId: undefined,
      karaokePrompt: undefined,
      phaseStartedAtUtc: Date.now(),
      leaderboard: cleanLeaderboard,
    };

    await this.syncProvider.broadcastState(spinningSnapshot);

    // Breve animación de ruleta (1.4s) antes de iniciar los 8s de escucha bloqueada
    this.autoAdvanceTimeoutId = setTimeout(() => {
      void this.beginListen8sPhase();
    }, 1400);
  }

  /** Inicia los 8.0 segundos de escucha con las 4 cartas boca abajo bloqueadas */
  async beginListen8sPhase(): Promise<void> {
    if (!this.isHost()) return;
    const current = this.roomState();
    if (!current || !current.roundOptions || !current.correctTrackId) return;

    const listenSnapshot: RoomStateSnapshot = {
      ...current,
      phase: 'LISTEN_8S',
      phaseStartedAtUtc: Date.now(),
    };

    await this.syncProvider.broadcastState(listenSnapshot);

    this.autoAdvanceTimeoutId = setTimeout(() => {
      void this.beginFlip6sPhase();
    }, LISTEN_DURATION_MS);
  }

  /** Voltea las 4 cartas en orden aleatorio e inicia el cronómetro de 6.0 segundos */
  async beginFlip6sPhase(): Promise<void> {
    if (!this.isHost()) return;
    const current = this.roomState();
    if (!current) return;

    const flipSnapshot: RoomStateSnapshot = {
      ...current,
      phase: 'FLIP_6S',
      phaseStartedAtUtc: Date.now(),
    };

    await this.syncProvider.broadcastState(flipSnapshot);

    this.autoAdvanceTimeoutId = setTimeout(() => {
      void this.resolveRoundPhase();
    }, FLIP_DURATION_MS);
  }

  /** Cierra los 6 segundos, publica resultados y actualiza posiciones */
  async resolveRoundPhase(): Promise<void> {
    if (!this.isHost()) return;
    const current = this.roomState();
    if (!current) return;

    this.stopTimerLoop();

    const resultSnapshot: RoomStateSnapshot = {
      ...current,
      phase: 'ROUND_RESULT',
      phaseStartedAtUtc: Date.now(),
    };

    await this.syncProvider.broadcastState(resultSnapshot);
  }

  /** Activa un turno de Karaoke Ruleta Rusa */
  private async triggerKaraokeRouletteRound(
    current: RoomStateSnapshot,
    nextRound: number,
    leaderboard: PlayerScore[]
  ): Promise<void> {
    const pool = this.getAvailableTracks();
    const chosenTrack = pool[Math.floor(Math.random() * pool.length)];
    this.usedTrackIds.add(chosenTrack.id);

    const eligiblePlayers = leaderboard.filter((p) => p.isConnected);
    const chosenPlayer =
      eligiblePlayers.length > 0
        ? eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)]
        : undefined;

    const karaokeSnapshot: RoomStateSnapshot = {
      ...current,
      roundNumber: nextRound,
      phase: 'KARAOKE_TURN',
      selectedGenre: chosenTrack.genre,
      selectedYear: chosenTrack.year,
      roundOptions: undefined,
      correctTrackId: chosenTrack.id,
      karaokePlayerId: chosenPlayer?.playerId,
      karaokePrompt: chosenTrack.karaokePrompt,
      phaseStartedAtUtc: Date.now(),
      leaderboard,
    };

    await this.syncProvider.broadcastState(karaokeSnapshot);
  }

  /** Usa el único comodín de Karaoke Ruleta Rusa para sortear nueva canción/turno */
  async useKaraokeJoker(): Promise<void> {
    const current = this.roomState();
    if (!current || current.phase !== 'KARAOKE_TURN') return;

    const actorId = this.isHost() ? current.karaokePlayerId : this.localParticipantId();
    if (!actorId) return;

    const player = current.leaderboard.find((p) => p.playerId === actorId);
    if (!player || player.karaokeJokerUsed) return;

    const updatedLeaderboard = current.leaderboard.map((p) =>
      p.playerId === actorId ? { ...p, karaokeJokerUsed: true } : p
    );

    const pool = this.getAvailableTracks();
    const nextTrack = pool[Math.floor(Math.random() * pool.length)];
    this.usedTrackIds.add(nextTrack.id);

    const nextSnapshot: RoomStateSnapshot = {
      ...current,
      selectedGenre: nextTrack.genre,
      selectedYear: nextTrack.year,
      correctTrackId: nextTrack.id,
      karaokePrompt: nextTrack.karaokePrompt,
      phaseStartedAtUtc: Date.now(),
      leaderboard: updatedLeaderboard,
    };

    await this.syncProvider.broadcastState(nextSnapshot);
  }

  /** Envía la selección del jugador durante los 6 segundos de volteo */
  async selectCardOption(trackId: string): Promise<void> {
    if (!this.canAnswer()) return;
    const current = this.roomState();
    if (!current || !current.correctTrackId) return;

    this.selectedTrackId.set(trackId);

    const elapsedMs = Math.min(
      FLIP_DURATION_MS,
      Math.max(0, Math.round(performance.now() - this.phaseStartPerfMs))
    );

    const isCorrect = trackId === current.correctTrackId;
    if (!isCorrect) {
      this.lastRoundFeedback.set({ status: 'WRONG', pointsEarned: 0 });
    } else {
      // Estimación optimista local; el anfitrión valida el orden exacto en la sala
      const alreadySomeoneAhead = this.correctAnswerOrder.length > 0;
      this.lastRoundFeedback.set({
        status: alreadySomeoneAhead ? 'CORRECT_OTHER' : 'CORRECT_FIRST',
        pointsEarned: alreadySomeoneAhead ? 1 : 2,
      });
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(isCorrect ? [25, 30, 25] : 60);
    }

    await this.syncProvider.submitAnswer({
      playerId: this.localParticipantId(),
      nickname: this.localNickname(),
      roundNumber: current.roundNumber,
      selectedTrackId: trackId,
      clientElapsedMs: elapsedMs,
    });
  }

  async finishGameToPodium(): Promise<void> {
    if (!this.isHost()) return;
    const current = this.roomState();
    if (!current) return;

    this.stopTimerLoop();
    this.clearAutoAdvance();

    const podiumSnapshot: RoomStateSnapshot = {
      ...current,
      phase: 'PODIUM',
      phaseStartedAtUtc: Date.now(),
    };

    await this.syncProvider.broadcastState(podiumSnapshot);
  }

  async purgeSession(): Promise<void> {
    this.stopTimerLoop();
    this.clearAutoAdvance();
    this.resetLocalBuffers();
    this.role.set(null);
    this.localParticipantId.set('');
    this.localNickname.set('');
    this.roomState.set(null);
    await this.syncProvider.leaveAndPurge();
  }

  private onPhaseEntered(snapshot: RoomStateSnapshot): void {
    this.stopTimerLoop();

    if (snapshot.phase === 'LISTEN_8S' || snapshot.phase === 'FLIP_6S') {
      this.selectedTrackId.set(null);
      this.lastRoundFeedback.set({ status: 'IDLE', pointsEarned: 0 });
    }

    if (snapshot.phase === 'FLIP_6S' && snapshot.roundOptions) {
      // Barajado Fisher-Yates independiente por dispositivo para evitar copias visuales
      this.shuffledOptions.set(this.shuffleFisherYates(snapshot.roundOptions));
    } else if (snapshot.phase === 'LISTEN_8S') {
      // Preparar slots ocultos sin revelar orden aún
      this.shuffledOptions.set(
        (snapshot.roundOptions ?? []).map((track, idx) => ({
          ...track,
          slotIndex: idx,
        }))
      );
    }

    if (snapshot.phase === 'LISTEN_8S') {
      this.startPrecisionCountdown(LISTEN_DURATION_MS, snapshot.phaseStartedAtUtc);
    } else if (snapshot.phase === 'FLIP_6S') {
      this.startPrecisionCountdown(FLIP_DURATION_MS, snapshot.phaseStartedAtUtc);
    } else {
      this.remainingMs.set(0);
    }
  }

  private startPrecisionCountdown(durationMs: number, startedAtUtc?: number): void {
    const nowUtc = Date.now();
    const elapsedSinceStart = startedAtUtc ? Math.max(0, nowUtc - startedAtUtc) : 0;
    const initialRemaining = Math.max(0, durationMs - elapsedSinceStart);

    this.phaseDurationMs = initialRemaining;
    this.phaseStartPerfMs = performance.now();
    this.remainingMs.set(initialRemaining);

    const tick = (nowPerf: number) => {
      const elapsed = nowPerf - this.phaseStartPerfMs;
      const left = Math.max(0, this.phaseDurationMs - elapsed);
      this.remainingMs.set(left);

      if (left > 0) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.rafId = null;
        if (this.phase() === 'FLIP_6S' && this.selectedTrackId() === null) {
          this.lastRoundFeedback.set({ status: 'TIMEOUT', pointsEarned: 0 });
        }
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private shouldTriggerKaraokeRound(mode: GameMode, roundNumber: number): boolean {
    if (mode === 'KARAOKE_ROULETTE') return true;
    if (mode === 'MIXED') {
      return roundNumber === 4 || roundNumber === 8 || roundNumber === 12;
    }
    return false;
  }

  private getAvailableTracks(): VinilTrack[] {
    const unused = this.activeCatalog.filter((t) => !this.usedTrackIds.has(t.id));
    if (unused.length >= 4) return unused;

    // Si se agotan pistas en una sesión larga, reiniciar set de usados
    this.usedTrackIds.clear();
    return [...this.activeCatalog];
  }

  private pickRoundTracks(): {
    genre: string;
    year: number;
    options: VinilTrack[];
    correctTrack: VinilTrack;
  } {
    const available = this.getAvailableTracks();
    const correctTrack = available[Math.floor(Math.random() * available.length)];

    // Priorizar distractores del mismo género o década para hacer más ágil la lectura en 6s
    const sameGenreOrDecade = this.activeCatalog.filter(
      (t) =>
        t.id !== correctTrack.id &&
        (t.genre === correctTrack.genre || t.decade === correctTrack.decade)
    );
    const others = this.activeCatalog.filter(
      (t) => t.id !== correctTrack.id && !sameGenreOrDecade.includes(t)
    );

    const distractorsPool = [...this.shuffleFisherYates(sameGenreOrDecade), ...this.shuffleFisherYates(others)];
    const chosenDistractors = distractorsPool.slice(0, 3);

    const fourOptions = this.shuffleFisherYates([correctTrack, ...chosenDistractors]);

    return {
      genre: correctTrack.genre,
      year: correctTrack.year,
      options: fourOptions,
      correctTrack,
    };
  }

  private shuffleFisherYates<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  private stopTimerLoop(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private clearAutoAdvance(): void {
    if (this.autoAdvanceTimeoutId !== null) {
      clearTimeout(this.autoAdvanceTimeoutId);
      this.autoAdvanceTimeoutId = null;
    }
  }

  private resetLocalBuffers(): void {
    this.usedTrackIds.clear();
    this.answeredInRound.clear();
    this.correctAnswerOrder = [];
    this.shuffledOptions.set([]);
    this.selectedTrackId.set(null);
    this.lastRoundFeedback.set({ status: 'IDLE', pointsEarned: 0 });
    this.remainingMs.set(0);
  }

  ngOnDestroy(): void {
    this.stopTimerLoop();
    this.clearAutoAdvance();
    this.resetLocalBuffers();
  }
}
