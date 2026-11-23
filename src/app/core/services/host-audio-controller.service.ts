import { computed, inject, Injectable, signal } from '@angular/core';
import {
  HostAudioMode,
  MAX_LISTEN_MS,
  MIN_LISTEN_MS,
  PublicOption,
  Track
} from '../models/game.models';
import { spotifyMessage } from '../utils/spotify';
import { SpotifyHostAudioService } from './spotify-host-audio.service';

const DEFAULT_LISTEN_SEC = 8;

/**
 * Elige la fuente de audio del ANFITRIÓN para la fase de escucha.
 *
 * - ITUNES (por defecto): el motor reproduce en el altavoz del host el preview
 *   de ~30 s de la pista correcta. No pide cuenta, clave ni red extra: el mismo
 *   `VinilTrack` que genera la carta trae su `previewUrl`, así que carta y audio
 *   coinciden siempre. Los invitados solo ven las cartas: hay que estar presente.
 * - SPOTIFY_PREMIUM: opcional; reproduce esa misma pista en el dispositivo del
 *   host y cae al preview si Spotify no está disponible.
 *
 * YouTube quedó fuera del motor: sin API no se pueden enumerar títulos de una
 * playlist y el iframe no sabía qué vídeo correspondía a cada carta.
 */
@Injectable({ providedIn: 'root' })
export class HostAudioControllerService {
  readonly spotify = inject(SpotifyHostAudioService);

  readonly mode = signal<HostAudioMode>('ITUNES');
  /** Segundos de escucha elegidos por el host (8..15, paso de 0.5s). */
  readonly listenDurationSec = signal(DEFAULT_LISTEN_SEC);
  readonly notice = signal('');

  /** Nunca cambia de fuente a mitad de ronda: la fase congela la decisión. */
  readonly effectiveMode = computed<HostAudioMode>(() => {
    if (
      this.mode() === 'SPOTIFY_PREMIUM' &&
      this.spotify.status() === 'connected' &&
      !this.spotify.playbackFailed()
    ) {
      return 'SPOTIFY_PREMIUM';
    }
    return 'ITUNES';
  });

  readonly listenDurationMs = computed(() =>
    Math.min(MAX_LISTEN_MS, Math.max(MIN_LISTEN_MS, Math.round(this.listenDurationSec() * 500) * 2))
  );

  readonly spotifyNotice = computed(() => {
    if (this.mode() !== 'SPOTIFY_PREMIUM') return '';
    if (this.spotify.status() === 'connected' && this.spotify.playbackFailed()) {
      return 'Spotify no pudo reproducir esta pista. Suena el preview de iTunes: reintenta el dispositivo o cambia la fuente.';
    }
    const status = this.spotify.status();
    // Mientras conecta no hay fallo que mostrar: la sala ya está esperando.
    if (status === 'idle' || status === 'connecting' || status === 'connected') return '';
    return spotifyMessage(status);
  });

  readonly spotifyDisconnected = computed(
    () =>
      this.mode() === 'SPOTIFY_PREMIUM' &&
      this.spotify.status() !== 'connected' &&
      this.spotify.status() !== 'connecting'
  );

  readonly activeNotice = computed(() => this.spotifyNotice() || this.notice());

  readonly modeLabel = computed(() =>
    this.effectiveMode() === 'SPOTIFY_PREMIUM' ? 'Spotify Premium' : 'iTunes · preview en el host'
  );

  setMode(mode: HostAudioMode): void {
    this.mode.set(mode);
    this.notice.set('');
  }

  setListenDurationSec(value: number): void {
    const safe = Number.isFinite(value) ? value : DEFAULT_LISTEN_SEC;
    this.listenDurationSec.set(Math.min(15, Math.max(8, Math.round(safe * 2) / 2)));
  }

  /** Avisa si Premium no está listo; iTunes siempre puede sonar. */
  prepareTrack(track: Track | PublicOption | null | undefined): void {
    if (!track) {
      this.notice.set('');
      return;
    }
    this.notice.set(
      this.mode() === 'SPOTIFY_PREMIUM' && this.spotify.status() !== 'connected'
        ? 'Spotify desconectado: suena el preview de iTunes en el altavoz del host.'
        : ''
    );
  }

  warn(message: string): void {
    this.notice.set(message);
  }

  dismissNotice(): void {
    this.notice.set('');
  }

  /** Solo limpia avisos: modo y duración son preferencias y sobreviven a la sala. */
  reset(): void {
    this.notice.set('');
  }
}
