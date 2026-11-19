import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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

  constructor() {
    // Si el navegador vuelve del flow PKCE, canjea el código y vuelve al lobby.
    void this.spotify.handleRedirect();
  }

  /**
   * El modal se muestra antes de activar el tablero. Si el host pidió Spotify,
   * aceptar deriva al login; la sala se activa sola al volver del callback.
   */
  onAccept(): void {
    if (
      this.session.pendingConnectSpotify() &&
      this.spotify.configured &&
      this.spotify.status() !== 'connected'
    ) {
      void this.spotify.connect();
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
    this.session.closePrivacy();
  }
}
