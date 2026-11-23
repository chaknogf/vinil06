import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { GamePhase, PublicOption } from '../../../core/models/game.models';
import { GameSessionService } from '../../../core/services/game-session.service';
import { HostAudioControllerService } from '../../../core/services/host-audio-controller.service';
import { PreviewAudioService } from '../../../core/services/preview-audio.service';
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
  readonly preview = inject(PreviewAudioService);

  readonly retrying = signal(false);
  readonly successNotice = signal('');
  readonly connectConfirm = signal(false);
  readonly closeConfirm = signal(false);
  /** Cerrar antes de tiempo afecta a todos: lo confirmamos si falta alguien. */
  readonly hasPendingAnswers = computed(
    () =>
      this.phase() === 'FLIP_6S' &&
      (this.session.viewState()?.players.some((player) => !player.isBot && !player.answered) ??
        false)
  );

  /** En HTTP plano (IP LAN) el PKCE no puede arrancar: no ofrecemos el login. */
  readonly spotifyBlocked = computed(() => !this.audio.spotify.canConnect);
  readonly spotifyBlockedReason = computed(() => this.audio.spotify.connectBlockedReason);

  readonly spotifyNeedsRetry = computed(() => {
    const status = this.audio.spotify.status();
    return (
      this.audio.mode() === 'SPOTIFY_PREMIUM' &&
      status !== 'connected' &&
      status !== 'connecting' &&
      status !== 'free'
    );
  });

  readonly hasAudio = computed(() => !!this.session.hostAudioUrl());
  readonly listening = computed(
    () => this.phase() === 'LISTEN_8S' || this.phase() === 'KARAOKE_TURN'
  );
  readonly noAudioWarning = computed(() => this.listening() && !this.hasAudio());
  readonly audioWaiting = computed(() => this.session.viewState()?.audioWaiting === true);
  /** Spotify remoto no confirma cuándo suena: solo que aceptó el comando. */
  readonly spotifyWaiting = computed(
    () => this.audioWaiting() && this.audio.mode() === 'SPOTIFY_PREMIUM'
  );
  readonly previewBlocked = computed(() => this.preview.blocked());
  readonly canRetryAudio = computed(() => this.audioWaiting() || this.previewBlocked());

  /** Color y texto salen de la fuente que está sonando de verdad. */
  readonly statusLabel = computed(() => {
    if (this.spotifyWaiting()) return 'Esperando a Spotify…';
    if (this.audioWaiting()) return 'Preparando audio…';
    if (this.previewBlocked()) return 'Sin sonido · reintentar';
    if (this.noAudioWarning()) return 'Sin audio';
    if (this.audio.activeNotice()) return 'Revisar audio';
    return this.audio.effectiveMode() === 'SPOTIFY_PREMIUM'
      ? 'Spotify activo'
      : 'iTunes activo';
  });

  readonly statusOk = computed(
    () =>
      !this.needsAttention() &&
      !this.noAudioWarning() &&
      !this.audioWaiting() &&
      !this.previewBlocked() &&
      this.hasAudio()
  );

  readonly needsAttention = computed(
    () =>
      !!this.audio.activeNotice() ||
      this.noAudioWarning() ||
      this.audioWaiting() ||
      this.previewBlocked()
  );

  readonly deepLink = computed(() => {
    const track = this.track();
    return track ? spotifySearchUrl(track.title, track.artist) : '';
  });

  readonly canReveal = computed(() => this.phase() === 'LISTEN_8S');
  readonly canClose = computed(() => this.phase() === 'FLIP_6S');

  /** Una petición nueva de la pista, sin recargar ni perder la sala. */
  retryAudio(): void {
    this.session.retryAudio();
  }

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
    // Nada de `window.confirm`: un diálogo nativo corta la experiencia y no se
    // puede estilizar. Confirmamos dentro del panel, sin salir de la sala.
    if (this.session.inSession()) {
      this.connectConfirm.set(true);
      return;
    }
    await this.audio.spotify.connect();
  }

  async confirmConnectSpotify(): Promise<void> {
    this.connectConfirm.set(false);
    await this.audio.spotify.connect();
  }

  revealNow(): void {
    this.session.skipListen();
  }

  requestCloseRound(): void {
    if (this.hasPendingAnswers()) {
      this.closeConfirm.set(true);
      return;
    }
    this.closeNow();
  }

  closeNow(): void {
    this.closeConfirm.set(false);
    this.session.closeRound();
  }
}
