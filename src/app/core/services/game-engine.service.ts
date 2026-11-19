import { computed, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { KARAOKE_CHALLENGES, trackToOption } from '../data/catalog';
import { VINIL06_CATALOG } from '../data/vinil06-catalog';
import {
  ANSWER_DURATION_MS,
  GameMode,
  GamePhase,
  KaraokeTurn,
  Player,
  PublicOption,
  RoundPack,
  RoundResultEntry,
  RoomState,
  RouletteDraw,
  TOTAL_ROUNDS,
  VinilTrack
} from '../models/game.models';
import { createRoomCode, pickOne, randomInt, shuffleArray } from '../utils/random';
import { AudioService } from './audio.service';
import { HapticsService } from './haptics.service';
import { SpotifyHostAudioService } from './spotify-host-audio.service';

export const LOCAL_PLAYER_ID = 'host-local-player';

const PLAYER_COLORS = [
  'linear-gradient(135deg,#34d399,#0d9488)',
  'linear-gradient(135deg,#818cf8,#6d28d9)',
  'linear-gradient(135deg,#fbbf24,#ea580c)',
  'linear-gradient(135deg,#f472b6,#e11d48)',
  'linear-gradient(135deg,#38bdf8,#1d4ed8)',
  'linear-gradient(135deg,#a3e635,#16a34a)'
];

interface AnswerRecord {
  readonly optionId: string;
  readonly arrivalMs: number;
}

/**
 * Máquina de estados autoritativa del anfitrión. Todo vive en Signals/RAM.
 * El host decide fases, tiempos y puntos; los clientes solo reciben snapshots.
 */
@Injectable({ providedIn: 'root' })
export class GameEngineService {
  readonly #audio = inject(AudioService);
  readonly #haptics = inject(HapticsService);
  readonly #spotify = inject(SpotifyHostAudioService);

  readonly roomCode = signal('');
  readonly mode = signal<GameMode>('CARDS_12');
  readonly phase = signal<GamePhase>('LOBBY');
  readonly phaseStartedAt = signal(Date.now());
  readonly roundIndex = signal(0);
  readonly draw = signal<RouletteDraw | null>(null);
  readonly options = signal<PublicOption[]>([]);
  readonly correctId = signal<string | null>(null);
  readonly players = signal<Player[]>([]);
  readonly results = signal<RoundResultEntry[]>([]);
  readonly karaoke = signal<KaraokeTurn | null>(null);
  /** Canción que el anfitrión debe poner. No viaja en el snapshot de la sala. */
  readonly hostTrack = signal<PublicOption | null>(null);
  readonly manual = signal(false);

  /** Latece 1 Hz para refrescar hostNow y el desfase de reloj de los clientes. */
  readonly #tick = signal(0);

  readonly snapshot = computed<RoomState>(() => {
    this.#tick();
    return {
      roomCode: this.roomCode(),
      mode: this.mode(),
      phase: this.phase(),
      phaseStartedAt: this.phaseStartedAt(),
      hostNow: Date.now(),
      roundIndex: this.roundIndex(),
      totalRounds: TOTAL_ROUNDS,
      draw: this.draw(),
      options: this.options(),
      correctId: this.correctId(),
      players: this.players(),
      results: this.results(),
      karaoke: this.karaoke(),
      manual: this.manual()
    };
  });

  #pack: RoundPack | null = null;
  /** Pack elegido en el lobby (o catálogo local por defecto). */
  #catalogTracks: readonly VinilTrack[] = VINIL06_CATALOG;
  /** Toda pista mostrada o cantada queda marcada: nunca se repite en la partida. */
  #usedTrackIds = new Set<string>();
  #previewTrack: VinilTrack | null = null;
  #answers = new Map<string, AnswerRecord>();
  #answerOpenedAt = 0;
  #timers: Array<ReturnType<typeof setTimeout>> = [];
  #heartbeatId: ReturnType<typeof setInterval> | null = null;

  /** Inyecta el pack sincronizado (solo RAM) antes de crear la sala. */
  setCatalog(tracks: readonly VinilTrack[]): void {
    this.#catalogTracks = tracks.length ? tracks : VINIL06_CATALOG;
  }

  createRoom(
    mode: GameMode,
    includeSelf: boolean,
    botNames: readonly string[],
    manual: boolean,
    tracks?: readonly VinilTrack[]
  ): string {
    this.reset();
    if (tracks?.length) this.setCatalog(tracks);
    const code = createRoomCode();
    this.roomCode.set(code);
    this.mode.set(mode);
    this.manual.set(manual);

    const players: Player[] = [
      ...(includeSelf
        ? [
            this.#makePlayer(LOCAL_PLAYER_ID, 'Tú (Host)', 0, false, true)
          ]
        : []),
      ...botNames.map((name, i) => this.#makePlayer(`bot-${i + 1}`, name, i + 1, true, true))
    ];
    this.players.set(players);
    this.#startHeartbeat();
    return code;
  }

  addPlayer(clientId: string, nickname: string): void {
    if (this.phase() === 'PODIUM' || this.players().some((p) => p.id === clientId)) return;
    this.players.update((list) => [
      ...list,
      this.#makePlayer(clientId, this.#uniqueName(nickname), list.length, false, false)
    ]);
    this.#audio.tone(784, 0.08, 'sine', 0.05);
  }

  removePlayer(clientId: string): void {
    this.players.update((list) => list.filter((p) => p.id !== clientId));
  }

  /** Gira la ruleta: género + década (y canción/turno en karaoke). */
  spin(): void {
    const phase = this.phase();
    if (phase === 'PODIUM' || phase === 'SPINNING') return;

    this.#clearTimers();
    this.#answers.clear();
    this.#previewTrack = null;
    this.correctId.set(null);
    this.results.set([]);
    this.options.set([]);
    this.karaoke.set(null);
    this.hostTrack.set(null);
    this.players.update((list) => list.map((p) => ({ ...p, answered: false, lastDelta: 0 })));

    const pack = this.#nextPack();
    const karaokeRound = this.#isKaraokeRound();
    this.draw.set({
      genre: pack.genre,
      decade: pack.decade,
      label: pack.label,
      ...(karaokeRound ? this.#karaokePreview() : {})
    });

    // El host necesita saber qué pista poner antes de que corran los 8s.
    // Este signal NO se publica a los jugadores (no forma parte de snapshot).
    const trackToPlay = karaokeRound ? this.#previewTrack : pack.tracks[0];
    this.hostTrack.set(trackToPlay ? trackToOption(trackToPlay) : null);

    this.#enterPhase('SPINNING');
    this.#audio.tone(392, 0.1, 'triangle', 0.06);
    this.#schedule(() => this.#finishSpin(), environment.timings.spinMs);
  }

  /** LOBBY/RESULT -> SPINNING; PODIUM -> partida nueva. */
  advance(): void {
    if (this.phase() === 'PODIUM') {
      this.reset();
      return;
    }
    if (this.phase() === 'ROUND_RESULT' && this.roundIndex() < TOTAL_ROUNDS - 1) {
      this.roundIndex.update((n) => n + 1);
    }
    this.spin();
  }

  showPodium(): void {
    this.#clearTimers();
    this.#audio.stopBeat();
    this.#spotify.pause();
    this.#enterPhase('PODIUM');
    this.#audio.tone(659.25, 0.18, 'sine', 0.09);
  }

  /** Respuesta local (host en su pestaña) o remota (jugador). */
  recordAnswer(playerId: string, optionId: string, arrivalMs?: number): void {
    if (this.phase() !== 'FLIP_6S') return;
    if (!this.options().some((o) => o.id === optionId) || this.#answers.has(playerId)) return;

    const time = arrivalMs ?? Math.max(120, Math.round(performance.now() - this.#answerOpenedAt));
    this.#answers.set(playerId, { optionId, arrivalMs: time });
    this.players.update((list) =>
      list.map((p) => (p.id === playerId ? { ...p, answered: true } : p))
    );
    const isCorrect = optionId === this.#pack?.tracks[0]?.id;
    this.#audio.answerTap(isCorrect);
    this.#haptics.tap();
  }

  useWildcard(playerId: string): void {
    const turn = this.karaoke();
    if (this.phase() !== 'KARAOKE_TURN' || !turn || turn.singerId !== playerId) return;
    const singer = this.players().find((p) => p.id === playerId);
    if (!singer || singer.wildcards < 1) return;

    this.players.update((list) =>
      list.map((p) => (p.id === playerId ? { ...p, wildcards: p.wildcards - 1 } : p))
    );
    const track = trackToOption(this.#takeKaraokeTrack());
    this.karaoke.set({
      ...turn,
      track,
      wildcardUsed: true,
      wildcardsLeft: singer.wildcards - 1
    });
    this.hostTrack.set(track);
    this.#audio.flipChime();
    this.#haptics.flip();
  }

  finishKaraoke(outcome: 'done' | 'pass' | 'timeout'): void {
    const turn = this.karaoke();
    if (this.phase() !== 'KARAOKE_TURN' || !turn) return;
    this.#clearTimers();

    const points = outcome === 'done' ? (turn.wildcardUsed ? 1 : 2) : 0;
    this.players.update((list) =>
      list.map((p) =>
        p.id === turn.singerId
          ? { ...p, score: p.score + points, lastDelta: points }
          : { ...p, lastDelta: 0 }
      )
    );
    this.results.set([
      {
        playerId: turn.singerId,
        name: turn.singerName,
        points,
        timeMs: null,
        correct: outcome === 'done'
      }
    ]);
    this.#enterPhase('ROUND_RESULT');
    if (points) this.#audio.tone(880, 0.16, 'sine', 0.1);
  }

  /** Atajos del tablero manual. */
  skipListen(): void {
    if (this.phase() === 'LISTEN_8S') {
      this.#clearTimers();
      this.#beginFlip();
    }
  }

  closeRound(): void {
    if (this.phase() === 'FLIP_6S') {
      this.#clearTimers();
      this.#finishRound();
    }
  }

  reset(): void {
    this.#clearTimers();
    this.#stopHeartbeat();
    this.#audio.stopBeat();
    this.#spotify.pause();
    this.#usedTrackIds.clear();
    this.#previewTrack = null;
    this.#answers.clear();
    this.#pack = null;
    this.roomCode.set('');
    this.mode.set('CARDS_12');
    this.manual.set(false);
    this.roundIndex.set(0);
    this.draw.set(null);
    this.options.set([]);
    this.correctId.set(null);
    this.results.set([]);
    this.karaoke.set(null);
    this.hostTrack.set(null);
    this.players.set([]);
    this.#enterPhase('LOBBY');
  }

  destroy(): void {
    this.reset();
    this.#audio.dispose();
  }

  // ---- Internos -------------------------------------------------------

  #makePlayer(
    id: string,
    name: string,
    index: number,
    isBot: boolean,
    isLocal: boolean
  ): Player {
    return {
      id,
      name,
      score: 0,
      isBot,
      isLocal,
      connected: true,
      wildcards: 1,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length] ?? PLAYER_COLORS[0]!,
      lastDelta: 0,
      answered: false
    };
  }

  #enterPhase(phase: GamePhase): void {
    this.phase.set(phase);
    this.phaseStartedAt.set(Date.now());
    this.#tick.update((n) => n + 1);
  }

  #schedule(fn: () => void, delayMs: number): void {
    this.#timers.push(setTimeout(fn, delayMs));
  }

  #clearTimers(): void {
    this.#timers.forEach(clearTimeout);
    this.#timers = [];
  }

  #startHeartbeat(): void {
    this.#stopHeartbeat();
    this.#heartbeatId = setInterval(() => this.#tick.update((n) => n + 1), 1000);
  }

  #stopHeartbeat(): void {
    if (this.#heartbeatId !== null) {
      clearInterval(this.#heartbeatId);
      this.#heartbeatId = null;
    }
  }

  #isKaraokeRound(): boolean {
    const index = this.roundIndex();
    if (this.mode() === 'KARAOKE') return true;
    return this.mode() === 'MIXED' && (index === 3 || index === 7 || index === 11);
  }

  /**
   * 4 pistas no usadas: la primera es la correcta y el resto señuelos.
   * `usedTrackIds` garantiza que ninguna pista vuelva a aparecer en la partida.
   */
  #nextPack(): RoundPack {
    const fresh = (tracks: readonly VinilTrack[]) =>
      tracks.filter((track) => !this.#usedTrackIds.has(track.id));
    let pool = fresh(this.#catalogTracks);
    if (pool.length < 4) pool = fresh(VINIL06_CATALOG);
    if (pool.length < 4) pool = [...VINIL06_CATALOG];

    const [correct, ...rest] = shuffleArray(pool);
    const correctTrack = correct ?? VINIL06_CATALOG[0]!;
    const decoys = rest.slice(0, 3);
    for (const track of [correctTrack, ...decoys]) this.#usedTrackIds.add(track.id);

    const chosen: RoundPack = {
      id: `round-${this.roundIndex()}-${correctTrack.id}`,
      genre: correctTrack.genre,
      decade: correctTrack.decade,
      label: `${correctTrack.genre} · ${correctTrack.decade}`,
      bpm: correctTrack.bpm || 120,
      tracks: [correctTrack, ...decoys]
    };
    this.#pack = chosen;
    return chosen;
  }

  #karaokePreview(): Partial<{ song: string; artist: string; singer: string }> {
    const track = this.#takeKaraokeTrack();
    this.#previewTrack = track;
    const singer = pickOne(this.players());
    return { song: track.title, artist: track.artist, singer: singer?.name };
  }

  /** Toma una pista fresca y la marca como usada (ruleta y turno coinciden). */
  #takeKaraokeTrack(): VinilTrack {
    const fresh = (tracks: readonly VinilTrack[]) =>
      tracks.filter((track) => !this.#usedTrackIds.has(track.id));
    const pool = fresh(this.#catalogTracks);
    const fallback = pool.length ? pool : fresh(VINIL06_CATALOG);
    const source = fallback.length ? fallback : VINIL06_CATALOG;
    const track = pickOne(source) ?? VINIL06_CATALOG[0]!;
    this.#usedTrackIds.add(track.id);
    return track;
  }

  #finishSpin(): void {
    if (this.phase() !== 'SPINNING') return;
    if (this.#isKaraokeRound()) {
      this.#startKaraokeTurn();
      return;
    }
    const pack = this.#pack ?? this.#nextPack();
    this.options.set(pack.tracks.map(trackToOption));
    this.#enterPhase('LISTEN_8S');
    // Reproducción automática del host (best-effort): si falla, el cronómetro sigue.
    void this.#spotify.play(this.hostTrack());
    this.#audio.startBeat(pack.bpm);
    this.#schedule(() => this.#beginFlip(), environment.timings.listenMs);
  }

  #startKaraokeTurn(): void {
    const track = this.#previewTrack ?? this.#takeKaraokeTrack();
    this.#previewTrack = null;
    const singer =
      this.players().find((p) => p.name === this.draw()?.singer) ??
      this.players().find((p) => !p.isBot) ??
      this.players()[0];

    if (!singer) {
      this.results.set([]);
      this.#enterPhase('ROUND_RESULT');
      return;
    }

    this.karaoke.set({
      track: trackToOption(track),
      singerId: singer.id,
      singerName: singer.name,
      challenge: pickOne(KARAOKE_CHALLENGES) ?? KARAOKE_CHALLENGES[0]!,
      durationMs: randomInt(15000, 20000),
      wildcardUsed: false,
      wildcardsLeft: singer.wildcards
    });
    this.#enterPhase('KARAOKE_TURN');
    this.#audio.flipChime();
    this.#haptics.flip();
    this.#schedule(() => this.finishKaraoke('timeout'), this.karaoke()?.durationMs ?? 18000);
  }

  #beginFlip(): void {
    if (this.phase() !== 'LISTEN_8S') return;
    this.#audio.flipChime();
    this.#haptics.flip();
    this.#spotify.pause();
    this.#enterPhase('FLIP_6S');
    this.#answerOpenedAt = performance.now();
    this.#answers.clear();
    this.players.update((list) => list.map((p) => ({ ...p, answered: false })));

    const correctId = this.#pack?.tracks[0]?.id;
    for (const bot of this.players().filter((p) => p.isBot)) {
      if (Math.random() > 0.72 || !correctId) continue;
      const wrong = shuffleArray(this.options()).find((o) => o.id !== correctId);
      const optionId = Math.random() < 0.85 ? correctId : (wrong?.id ?? correctId);
      const delay = randomInt(1300, 4700);
      this.#schedule(() => this.recordAnswer(bot.id, optionId, delay), delay);
    }
    this.#schedule(() => this.#finishRound(), ANSWER_DURATION_MS);
  }

  #finishRound(): void {
    if (this.phase() !== 'FLIP_6S') return;
    this.#clearTimers();
    this.#audio.stopBeat();
    this.#spotify.pause();

    const correctId = this.#pack?.tracks[0]?.id ?? null;
    const correctAnswers = [...this.#answers.entries()]
      .filter(([, record]) => record.optionId === correctId)
      .sort((a, b) => a[1].arrivalMs - b[1].arrivalMs);

    const points = new Map<string, number>();
    correctAnswers.forEach(([playerId], index) => points.set(playerId, index === 0 ? 2 : 1));
    const times = new Map(correctAnswers.map(([playerId, record]) => [playerId, record.arrivalMs]));

    this.results.set(
      this.players().map((p) => ({
        playerId: p.id,
        name: p.name,
        points: points.get(p.id) ?? 0,
        timeMs: times.get(p.id) ?? null,
        correct: points.has(p.id)
      }))
    );
    this.players.update((list) =>
      list.map((p) => ({
        ...p,
        score: p.score + (points.get(p.id) ?? 0),
        lastDelta: points.get(p.id) ?? 0
      }))
    );
    this.correctId.set(correctId);
    this.#enterPhase('ROUND_RESULT');

    const local = points.get(LOCAL_PLAYER_ID);
    if (local === 2) {
      this.#audio.tone(587.33, 0.1, 'sine', 0.1);
      setTimeout(() => this.#audio.tone(880, 0.18, 'sine', 0.12), 100);
    } else if (local === 1) {
      this.#audio.tone(523.25, 0.14, 'sine', 0.09);
    } else {
      this.#audio.tone(220, 0.22, 'sawtooth', 0.05);
    }
  }

  #uniqueName(nickname: string): string {
    const base = nickname.trim().slice(0, 18) || 'Jugador';
    const names = new Set(this.players().map((p) => p.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }
}
