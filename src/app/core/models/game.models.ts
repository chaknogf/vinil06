/** Máquina de estados compartida por anfitrión y jugadores. */
export type GamePhase =
  | 'LOBBY'
  | 'SPINNING'
  | 'LISTEN_8S'
  | 'FLIP_6S'
  | 'ROUND_RESULT'
  | 'KARAOKE_TURN'
  | 'PODIUM';

export type GameMode = 'CARDS_12' | 'KARAOKE' | 'MIXED';
export type Role = 'host' | 'player';
export type ConnectionStatus = 'idle' | 'connected' | 'unavailable';

/** Canción del catálogo efímero en memoria. */
export interface Track {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly genre: string;
  readonly year: number;
  readonly decade: string;
  readonly bpm: number;
  readonly palette: readonly [string, string];
  /** 0..3, decide la forma geométrica de la portada SVG. */
  readonly motif: number;
  /** URL remota opcional; si falla, la UI usa la portada SVG local. */
  readonly cover?: string;
  /** URI de Spotify (`spotify:track:…`) cuando el catálogo la trae; evita buscar. */
  readonly spotifyUri?: string;
  /** Preview ~30s de iTunes: permite oír la pista sin cuenta ni API key. */
  readonly previewUrl?: string;
}

/** Pista local con portada SVG embebida (`data:image/svg+xml`), sin red. */
export interface VinilTrack extends Track {
  readonly cover: string;
}

/** Grupo de 4 canciones compatibles (una respuesta correcta + 3 señuelos). */
export interface RoundPack {
  readonly id: string;
  readonly genre: string;
  readonly decade: string;
  readonly label: string;
  readonly bpm: number;
  readonly tracks: readonly Track[];
}

/** Carta tal como se envía a los dispositivos (sin revelar la respuesta). */
export interface PublicOption {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly palette: readonly [string, string];
  readonly motif: number;
  /** Portada remota del catálogo sincronizado; vacía = usar SVG local. */
  readonly cover?: string;
  /** URI de Spotify opcional para reproducción directa. */
  readonly spotifyUri?: string;
}

/**
 * Opción preparada para el tablero de un dispositivo.
 * Se baraja con Fisher-Yates al entrar en FLIP_6S; `coverDataUri` es siempre
 * una portada SVG local válida para el fallback `onError` de la imagen remota.
 */
export interface ShuffledOption extends PublicOption {
  readonly slotIndex: number;
  readonly year: number;
  readonly coverDataUri: string;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  readonly isBot: boolean;
  readonly isLocal: boolean;
  readonly connected: boolean;
  readonly wildcards: number;
  readonly color: string;
  readonly lastDelta: number;
  readonly answered: boolean;
}

export interface RoundResultEntry {
  readonly playerId: string;
  readonly name: string;
  readonly points: number;
  /** Tiempo de llegada al tablero, en ms desde el inicio de la fase de respuesta. */
  readonly timeMs: number | null;
  readonly correct: boolean;
}

export interface RouletteDraw {
  readonly genre: string;
  readonly decade: string;
  readonly label: string;
  readonly song?: string;
  readonly artist?: string;
  readonly singer?: string;
}

export interface KaraokeTurn {
  readonly track: PublicOption;
  readonly singerId: string;
  readonly singerName: string;
  readonly challenge: string;
  readonly durationMs: number;
  readonly wildcardUsed: boolean;
  readonly wildcardsLeft: number;
}

/** Snapshot autoritativo que el host emite a todos los jugadores. */
export interface RoomState {
  readonly roomCode: string;
  readonly mode: GameMode;
  readonly phase: GamePhase;
  /** Date.now() del host al entrar en la fase (para cronómetros precisos). */
  readonly phaseStartedAt: number;
  /** Date.now() del host al emitir (para estimar desfase de reloj). */
  readonly hostNow: number;
  readonly roundIndex: number;
  readonly totalRounds: number;
  readonly draw: RouletteDraw | null;
  readonly options: readonly PublicOption[];
  /** Solo se rellena en ROUND_RESULT para no filtrar la respuesta. */
  readonly correctId: string | null;
  readonly players: readonly Player[];
  readonly results: readonly RoundResultEntry[];
  readonly karaoke: KaraokeTurn | null;
  readonly manual: boolean;
  /** Preview de la pista en curso. No identifica la respuesta: se envía a todos. */
  readonly audioUrl?: string;
}

export const TOTAL_ROUNDS = 12;
export const LISTEN_DURATION_MS = 8000;
export const ANSWER_DURATION_MS = 6000;
