import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { GamePhase, PublicOption } from '../../../core/models/game.models';
import { GameSessionService } from '../../../core/services/game-session.service';
import { HostAudioControllerService } from '../../../core/services/host-audio-controller.service';
import { spotifySearchUrl } from '../../../core/utils/spotify';
import { AlbumArtComponent } from '../album-art/album-art.component';

/**
 * Panel de audio del anfitrión: iTunes reproduce el preview de la MISMA carta
 * correcta en el altavoz del host; Spotify Premium es un extra opcional.
 * Los invitados no reciben audio: deben estar presentes en la sala.
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

  readonly retrying = signal(false);
  readonly successNotice = signal('');

  /** En HTTP plano (IP LAN) el PKCE no puede arrancar: no ofrecemos el login. */
  readonly spotifyBlocked = computed(() => !this.audio.spotify.canConnect);
  readonly spotifyBlockedReason = computed(() => this.audio.spotify.connectBlockedReason);

  readonly spotifyNeedsRetry = computed(
    () =>
      this.audio.mode() === 'SPOTIFY_PREMIUM' &&
      this.audio.spotify.status() !== 'connected' &&
      this.audio.spotify.status() !== 'free'
  );

  readonly hasAudio = computed(() => !!this.session.hostAudioUrl());
  readonly listening = computed(
    () => this.phase() === 'LISTEN_8S' || this.phase() === 'KARAOKE_TURN'
  );
  readonly noAudioWarning = computed(() => this.listening() && !this.hasAudio());

  /** Color y texto salen de la fuente que está sonando de verdad. */
  readonly statusLabel = computed(() => {
    if (this.noAudioWarning()) return 'Sin audio';
    if (this.audio.activeNotice()) return 'Revisar audio';
    return this.audio.effectiveMode() === 'SPOTIFY_PREMIUM'
      ? 'Spotify activo'
      : 'iTunes activo';
  });

  readonly statusOk = computed(
    () => !this.needsAttention() && !this.noAudioWarning() && this.hasAudio()
  );

  readonly needsAttention = computed(() => !!this.audio.activeNotice() || this.noAudioWarning());

  readonly deepLink = computed(() => {
    const track = this.track();
    return track ? spotifySearchUrl(track.title, track.artist) : '';
  });

  readonly canReveal = computed(() => this.phase() === 'LISTEN_8S');
  readonly canClose = computed(() => this.phase() === 'FLIP_6S');

  useItunes(): void {
    this.audio.setMode('ITUNES');
    this.successNotice.set('Usando el preview de iTunes en este dispositivo.');
  }

  selectSpotify(): void {
    if (this.spotifyBlocked()) {
      this.audio.warn(this.spotifyBlockedReason());
      this.useItunes();
      return;
    }
    this.audio.setMode('SPOTIFY_PREMIUM');
  }

  async retrySpotify(): Promise<void> {
    this.retrying.set(true);
    const ok = await this.audio.spotify.retryDevice();
    this.retrying.set(false);
    if (ok) {
      this.audio.dismissNotice();
      this.successNotice.set('Spotify vuelve a estar activo para la próxima ronda.');
    } else {
      this.successNotice.set('');
      this.audio.warn('Sigue sin haber un dispositivo de Spotify activo. Suena el preview de iTunes.');
    }
  }

  /**
   * Reconección completa (PKCE). Con la sala guardada en este dispositivo, el
   * host puede recuperarla desde el lobby al volver.
   */
  async connectSpotify(): Promise<void> {
    if (this.spotifyBlocked()) {
      this.audio.warn(this.spotifyBlockedReason());
      this.useItunes();
      return;
    }
    if (
      this.session.inSession() &&
      !window.confirm(
        'Conectar Spotify recargará la página. Guardamos la sala en este dispositivo y podrás recuperarla desde el lobby. ¿Continuar?'
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
