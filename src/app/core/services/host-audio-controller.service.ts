import { computed, inject, Injectable, signal } from '@angular/core';
import {
  HostAudioMode,
  MAX_LISTEN_MS,
  MIN_LISTEN_MS,
  PublicOption,
  Track
} from '../models/game.models';
import { SpotifyHostAudioService } from './spotify-host-audio.service';

const DEFAULT_LISTEN_SEC = 8;

/** Acepta un ID de 11 caracteres o una URL de YouTube/watch/youtu.be/embed/shorts. */
export function parseYouTubeId(raw: string): string {
  const value = raw.trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  const match = value.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i
  );
  return match?.[1] ?? '';
}

/**
 * Controla la fuente de audio del ANFITRIÓN sin Account ni persistencia.
 *
 * - SPOTIFY_PREMIUM: delega en SpotifyHostAudioService (PKCE, token en RAM).
 * - YOUTUBE: prepara la búsqueda/vídeo de la pista y muestra el reproductor solo
 *   durante la escucha; al voltear se retira, que es la forma fiable de silenciarlo
 *   sin depender de la IFrame API ni de permisos de autoplay.
 * - MANUAL: el host avanza con los botones del tablero.
 *
 * Cualquier fallo de Premium/YouTube degrada a una alternativa avanzable: la
 * ronda nunca se queda esperando audio.
 */
@Injectable({ providedIn: 'root' })
export class HostAudioControllerService {
  readonly spotify = inject(SpotifyHostAudioService);

  readonly mode = signal<HostAudioMode>('MANUAL');
  /** Segundos de escucha elegidos por el host (8..15, paso de 0.5s). */
  readonly listenDurationSec = signal(DEFAULT_LISTEN_SEC);
  readonly listening = signal(false);

  readonly youtubeQuery = signal('');
  readonly youtubeVideoId = signal('');
  readonly notice = signal('');

  /**
   * Modo realmente aplicado. Antes caíamos a YouTube aunque no hubiera vídeo,
   * y el tablero suprimía el preview: silencio total. Ahora YouTube solo se
   * aplica si hay un ID de vídeo; si no, suena el preview de iTunes.
   */
  readonly effectiveMode = computed<HostAudioMode>(() => {
    if (this.mode() === 'SPOTIFY_PREMIUM') {
      const ready = this.spotify.status() === 'connected' && !this.spotify.playbackFailed();
      if (ready) return 'SPOTIFY_PREMIUM';
      return this.youtubeVideoId() ? 'YOUTUBE' : 'MANUAL';
    }
    return this.youtubeVideoId() ? 'YOUTUBE' : 'MANUAL';
  });

  readonly listenDurationMs = computed(() =>
    Math.min(MAX_LISTEN_MS, Math.max(MIN_LISTEN_MS, Math.round(this.listenDurationSec() * 500) * 2))
  );

  readonly spotifyNotice = computed(() => {
    if (this.mode() !== 'SPOTIFY_PREMIUM') return '';
    if (this.spotify.status() === 'connected' && this.spotify.playbackFailed()) {
      return 'Spotify no pudo reproducir esta pista. Suena el preview: reintenta el dispositivo o cambia la fuente.';
    }
    switch (this.spotify.status()) {
      case 'free':
        return 'Tu Spotify es Free: no podemos controlarlo. Suena el preview; usa YouTube si quieres vídeo.';
      case 'no-device':
        return 'Spotify no tiene un dispositivo activo. Suena el preview; abre Spotify o reintenta.';
      case 'error':
      case 'not-configured':
        return 'Spotify no está disponible. Suena el preview; cambia la fuente si quieres.';
      default:
        return '';
    }
  });

  /** Desconexión real de Spotify: instruye el botón «Conectar» del panel. */
  readonly spotifyDisconnected = computed(
    () =>
      this.mode() === 'SPOTIFY_PREMIUM' &&
      this.spotify.status() !== 'connected' &&
      this.spotify.status() !== 'connecting'
  );

  readonly activeNotice = computed(() => this.spotifyNotice() || this.notice());

  readonly youtubeSearchUrl = computed(() => {
    const query = this.youtubeQuery().trim() || 'Vinil06 canción';
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  });

  readonly youtubeEmbedUrl = computed(() => {
    const id = this.youtubeVideoId();
    // La app retira el iframe al pasar de fase; el autoplay se pide igual para
    // que arranque nada más pulsar el enlace del host.
    const origin =
      typeof window === 'undefined' ? '' : `&origin=${encodeURIComponent(window.location.origin)}`;
    // enablejsapi permite arrancar el vídeo con un postMessage desde el botón
    // «Tocar para activar audio» cuando el navegador bloquea el autoplay.
    return id
      ? `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0&enablejsapi=1${origin}`
      : '';
  });

  readonly modeLabel = computed(() => {
    const selected = this.mode();
    const base =
      selected === 'SPOTIFY_PREMIUM' ? 'Spotify Premium' : selected === 'YOUTUBE' ? 'YouTube' : 'Manual';
    const effective = this.effectiveMode();
    if (selected === effective) return base;
    return `${base} → ${effective === 'YOUTUBE' ? 'YouTube' : 'preview iTunes'}`;
  });

  setMode(mode: HostAudioMode): void {
    this.mode.set(mode);
    this.notice.set('');
    if (mode !== 'SPOTIFY_PREMIUM') this.listening.set(false);
  }

  setListenDurationSec(value: number): void {
    const safe = Number.isFinite(value) ? value : DEFAULT_LISTEN_SEC;
    // Clamp estricto [8, 15] y paso de 0.5s para que el cronómetro sea legible.
    this.listenDurationSec.set(
      Math.min(15, Math.max(8, Math.round(safe * 2) / 2))
    );
  }

  /** Prepara la búsqueda de la pista recién sorteada. La llama el motor. */
  prepareTrack(track: Track | PublicOption | null | undefined): void {
    if (!track) {
      this.youtubeQuery.set('');
      this.youtubeVideoId.set('');
      return;
    }
    const known = track as Partial<Track>;
    this.youtubeQuery.set(
      known.youtubeQuery?.trim() || `${track.artist} ${track.title}`.trim()
    );
    // Si el catálogo trae un ID lo usamos; si no, conservamos el que el host
    // pegó en el tablero (puede hacerlo antes de girar la ruleta).
    const trackVideoId = parseYouTubeId(known.youtubeVideoId ?? '');
    if (trackVideoId) this.youtubeVideoId.set(trackVideoId);
    const spotifyDown =
      this.mode() === 'SPOTIFY_PREMIUM' && this.spotify.status() !== 'connected';
    this.notice.set(
      spotifyDown
        ? 'Spotify desconectado: suena el preview. Pulsa «Conectar Spotify» o pega un vídeo de YouTube.'
        : this.mode() === 'YOUTUBE' && !this.youtubeVideoId()
          ? 'Sin vídeo de YouTube: suena el preview de iTunes. Pega un enlace o abre la búsqueda.'
          : ''
    );
  }

  setYouTubeInput(raw: string): boolean {
    const id = parseYouTubeId(raw);
    if (!id) {
      this.notice.set('Pega un enlace de YouTube o un ID de 11 caracteres.');
      return false;
    }
    this.youtubeVideoId.set(id);
    this.notice.set('');
    return true;
  }

  openYouTube(): void {
    window.open(this.youtubeSearchUrl(), '_blank', 'noopener,noreferrer');
  }

  /** Fronteras de fase: el reproductor de YouTube solo vive durante la escucha. */
  startListen(): void {
    this.listening.set(true);
  }

  stopListen(): void {
    this.listening.set(false);
  }

  warn(message: string): void {
    this.notice.set(message);
  }

  dismissNotice(): void {
    this.notice.set('');
  }

  reset(): void {
    this.listening.set(false);
    this.youtubeQuery.set('');
    this.youtubeVideoId.set('');
    this.notice.set('');
  }
}
