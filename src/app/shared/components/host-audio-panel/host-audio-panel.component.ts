import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { GamePhase, PublicOption } from '../../../core/models/game.models';
import { GameSessionService } from '../../../core/services/game-session.service';
import { HostAudioControllerService } from '../../../core/services/host-audio-controller.service';
import { spotifySearchUrl } from '../../../core/utils/spotify';
import { AlbumArtComponent } from '../album-art/album-art.component';

/**
 * Panel de audio del anfitrión: elige YouTube/Spotify/Manual, muestra el vídeo
 * SOLO durante la escucha y ofrece avance manual en cualquier fase. Nada de esto
 * se envía a los jugadores (ellos oyen el preview de iTunes del snapshot).
 */
@Component({
  selector: 'app-host-audio-panel',
  standalone: true,
  imports: [AlbumArtComponent],
  templateUrl: './host-audio-panel.component.html',
  styleUrl: './host-audio-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HostAudioPanelComponent {
  readonly track = input<PublicOption | null>(null);
  readonly phase = input<GamePhase>('LOBBY');

  readonly audio = inject(HostAudioControllerService);
  readonly session = inject(GameSessionService);
  readonly #sanitizer = inject(DomSanitizer);

  readonly youtubeInput = signal('');
  readonly retrying = signal(false);
  readonly ytFrame = viewChild<ElementRef<HTMLIFrameElement>>('ytFrame');

  /** Controles de vídeo visibles también si Premium falló y puede servir de plan B. */
  readonly showYouTube = computed(
    () =>
      this.audio.mode() === 'YOUTUBE' ||
      (this.audio.mode() === 'SPOTIFY_PREMIUM' &&
        this.audio.spotify.status() !== 'connected')
  );

  readonly spotifyNeedsRetry = computed(
    () =>
      this.audio.mode() === 'SPOTIFY_PREMIUM' &&
      this.audio.spotify.status() !== 'connected' &&
      this.audio.spotify.status() !== 'free'
  );

  readonly statusLabel = computed(() => {
    if (this.audio.activeNotice()) return 'Revisar audio';
    switch (this.audio.mode()) {
      case 'SPOTIFY_PREMIUM':
        return this.audio.effectiveMode() === 'SPOTIFY_PREMIUM'
          ? 'Spotify activo'
          : 'Spotify · usando preview';
      case 'YOUTUBE':
        return this.audio.youtubeVideoId() ? 'YouTube listo' : 'YouTube · sin vídeo';
      default:
        return 'Manual';
    }
  });

  readonly needsAttention = computed(() => !!this.audio.activeNotice());

  readonly deepLink = computed(() => {
    const track = this.track();
    return track ? spotifySearchUrl(track.title, track.artist) : '';
  });

  readonly youtubeEmbedSrc = computed(() => {
    const url = this.audio.youtubeEmbedUrl();
    return url ? this.#sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  readonly canReveal = computed(() => this.phase() === 'LISTEN_8S');
  readonly canClose = computed(() => this.phase() === 'FLIP_6S');

  applyYouTube(): void {
    this.audio.setYouTubeInput(this.youtubeInput());
  }

  useSuggestedVideo(): void {
    const query = this.audio.youtubeQuery().trim();
    if (!query) return;
    window.open(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      '_blank',
      'noopener,noreferrer'
    );
  }

  /**
   * Arranca el iframe desde un gesto del usuario: algunos navegadores ignoran
   * `autoplay=1` cuando el vídeo se inserta después del giro de la ruleta.
   */
  startYouTube(): void {
    if (!this.audio.youtubeVideoId()) {
      this.audio.warn('Pega primero un enlace o un ID de vídeo de YouTube.');
      return;
    }
    const frame = this.ytFrame()?.nativeElement.contentWindow;
    if (!frame) return;
    this.audio.dismissNotice();
    const command = (func: string) =>
      frame.postMessage(JSON.stringify({ event: 'command', func, args: '' }), 'https://www.youtube.com');
    command('unMute');
    command('playVideo');
  }

  async retrySpotify(): Promise<void> {
    this.retrying.set(true);
    const ok = await this.audio.spotify.retryDevice();
    this.retrying.set(false);
    this.audio.warn(
      ok
        ? 'Spotify vuelve a estar activo. La próxima ronda sonará desde tu dispositivo.'
        : 'Sigue sin haber un dispositivo de Spotify activo. Mientras tanto suena el preview.'
    );
  }

  /**
   * Reconección completa (PKCE). Solo se ofrece cuando Spotify está desconectado.
   * Avisamos antes porque el OAuth recarga la pestaña y la sala vive en RAM.
   */
  async connectSpotify(): Promise<void> {
    if (
      this.session.inSession() &&
      !window.confirm(
        'Conectar Spotify recargará la página y cerrará la sala actual (la partida solo vive en memoria). ¿Continuar?'
      )
    ) {
      return;
    }
    await this.audio.spotify.connect();
  }

  revealNow(): void {
    this.session.skipListen();
  }

  closeNow(): void {
    this.session.closeRound();
  }
}
