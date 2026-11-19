import { InjectionToken, Signal } from '@angular/core';
import { VinilTrack } from '../data/vinil06-catalog';

export type GameMode = 'CARDS_12' | 'KARAOKE_ROULETTE' | 'MIXED';

export type RoundPhase =
  | 'LOBBY'
  | 'SPINNING'
  | 'LISTEN_8S'
  | 'FLIP_6S'
  | 'ROUND_RESULT'
  | 'KARAOKE_TURN'
  | 'PODIUM';

export interface PlayerScore {
  playerId: string;
  nickname: string;
  points: number;
  lastDelta: number;
  isConnected: boolean;
  karaokeJokerUsed: boolean;
}

export interface RoomStateSnapshot {
  roomCode: string;
  mode: GameMode;
  packId: string;
  roundNumber: number;
  totalRounds: number;
  phase: RoundPhase;
  selectedGenre?: string;
  selectedYear?: number;
  /** Las 4 opciones de la ronda; cada cliente las baraja con Fisher-Yates al voltear */
  roundOptions?: VinilTrack[];
  correctTrackId?: string;
  /** Timestamp UTC (Date.now()) en que inició la fase actual para compensar latencia */
  phaseStartedAtUtc?: number;
  /** Jugador activo en Karaoke Ruleta Rusa */
  karaokePlayerId?: string;
  karaokePrompt?: string;
  leaderboard: PlayerScore[];
}

export interface PlayerAnswerPayload {
  playerId: string;
  nickname: string;
  roundNumber: number;
  selectedTrackId: string;
  /** Marca relativa al inicio del volteo de 6s en el cliente */
  clientElapsedMs: number;
}

export type RoomSyncMessage =
  | { type: 'STATE_SYNC'; payload: RoomStateSnapshot }
  | { type: 'REQUEST_STATE'; payload: { requesterId: string } }
  | { type: 'PLAYER_ANSWER'; payload: PlayerAnswerPayload }
  | { type: 'KARAOKE_JOKER'; payload: { playerId: string; roundNumber: number } }
  | { type: 'ROOM_CLOSED'; payload: { reason: string } };

export interface RoomSyncProvider {
  readonly isConnected: Signal<boolean>;
  readonly state: Signal<RoomStateSnapshot | null>;
  readonly incomingAnswers: Signal<PlayerAnswerPayload[]>;

  joinRoom(
    roomCode: string,
    participant: { id: string; nickname: string; isHost: boolean }
  ): Promise<void>;

  /** Solo el anfitrión emite el estado maestro de la sala */
  broadcastState(snapshot: RoomStateSnapshot): Promise<void>;

  /** Los jugadores envían su respuesta durante la ventana de 6s */
  submitAnswer(answer: PlayerAnswerPayload): Promise<void>;

  /** Solicita el estado actual al anfitrión al reconectar o entrar tarde */
  requestLatestState(requesterId: string): Promise<void>;

  /** Limpieza estricta en memoria y cierre de canal */
  leaveAndPurge(): Promise<void>;
}

export const ROOM_SYNC_PROVIDER = new InjectionToken<RoomSyncProvider>(
  'ROOM_SYNC_PROVIDER'
);
