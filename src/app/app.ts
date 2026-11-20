import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GameSessionService } from './core/services/game-session.service';
import { SpotifyHostAudioService } from './core/services/spotify-host-audio.service';
import { EphemeralPrivacyModalComponent } from './shared/components/ephemeral-privacy-modal/ephemeral-privacy-modal.component';
import { InstallPromptComponent } from './shared/components/install-prompt/install-prompt.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, EphemeralPrivacyModalComponent, InstallPromptComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  readonly session = inject(GameSessionService);
  readonly spotify = inject(SpotifyHostAudioService);
  readonly spotifyError = signal('');

  constructor() {
    // Si el navegador vuelve del flow PKCE, canjea el código y vuelve al lobby.
    void this.spotify.handleRedirect();
  }

  /**
   * El modal se muestra antes de activar el tablero. Si el host pidió Spotify,
   * aceptar deriva al login; la sala se activa sola al volver del callback.
   */
  async onAccept(): Promise<void> {
    if (
      this.session.pendingConnectSpotify() &&
      this.spotify.configured &&
      this.spotify.status() !== 'connected'
    ) {
      this.spotifyError.set('');
      await this.spotify.connect();
      // connect() navega al login; si falla antes, antes el modal se cerraba
      // sin sala y sin explicación. Mostramos el error y dejamos la salida manual.
      if (this.spotify.status() === 'error') {
        this.spotifyError.set(
          this.spotify.message() || 'No se pudo conectar con Spotify. Puedes seguir en modo manual.'
        );
      }
      return;
    }
    this.session.activateHost();
  }

  onManual(): void {
    this.spotify.clearCreateIntent();
    this.session.activateManualHost();
  }

  onDismiss(): void {
    this.spotify.clearCreateIntent();
    this.spotifyError.set('');
    this.session.closePrivacy();
  }
}
