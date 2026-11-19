import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal
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

  readonly statusLabel = computed(() => {
    if (this.audio.activeNotice()) return 'Revisar audio';
    switch (this.audio.effectiveMode()) {
      case 'SPOTIFY_PREMIUM':
        return this.audio.spotify.status() === 'connected' ? 'Spotify activo' : 'Spotify sin conexión';
      case 'YOUTUBE':
        return this.audio.youtubeVideoId() ? 'YouTube listo' : 'YouTube · elige vídeo';
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

  revealNow(): void {
    this.session.skipListen();
  }

  closeNow(): void {
    this.session.closeRound();
  }
}
