import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { PublicOption } from '../../../core/models/game.models';
import { SpotifyHostAudioService } from '../../../core/services/spotify-host-audio.service';
import { spotifySearchUrl } from '../../../core/utils/spotify';
import { AlbumArtComponent } from '../album-art/album-art.component';

/** Panel del anfitrión: conexión Premium opcional + deep link + fallback manual. */
@Component({
  selector: 'app-spotify-host-panel',
  standalone: true,
  imports: [AlbumArtComponent],
  templateUrl: './spotify-host-panel.component.html',
  styleUrl: './spotify-host-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SpotifyHostPanelComponent {
  readonly track = input<PublicOption | null>(null);
  readonly spotify = inject(SpotifyHostAudioService);
  readonly dismissed = signal(false);

  readonly deepLink = computed(() => {
    const track = this.track();
    return track ? spotifySearchUrl(track.title, track.artist) : '';
  });

  readonly statusLabel = computed(() => {
    const device = this.spotify.deviceName();
    switch (this.spotify.status()) {
      case 'connected':
        return device ? `Conectado · ${device}` : 'Conectado';
      case 'connecting':
        return 'Conectando…';
      case 'free':
        return 'Spotify Free';
      case 'no-device':
        return 'Sin dispositivo';
      case 'error':
        return 'Spotify no disponible';
      case 'not-configured':
        return 'Spotify opcional';
      default:
        return 'Sin conectar';
    }
  });

  readonly needsAttention = computed(
    () =>
      !this.dismissed() &&
      ['free', 'no-device', 'error', 'not-configured'].includes(this.spotify.status())
  );

  dismiss(): void {
    this.dismissed.set(true);
  }
}
