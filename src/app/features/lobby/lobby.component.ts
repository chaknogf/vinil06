import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CatalogSyncService } from '../../core/catalog/catalog-sync.service';
import {
  CatalogPackId,
  CATALOG_PACKS,
  isCatalogPackId,
  packLabel
} from '../../core/data/vinil06-catalog';
import { GameMode, HostAudioMode } from '../../core/models/game.models';
import { GameSessionService } from '../../core/services/game-session.service';
import { HostAudioControllerService } from '../../core/services/host-audio-controller.service';
import { PreviewAudioService } from '../../core/services/preview-audio.service';
import {
  SpotifyCreateIntent,
  SpotifyHostAudioService
} from '../../core/services/spotify-host-audio.service';
import { SessionViewComponent } from '../session/session-view.component';

interface ModeCard {
  readonly id: GameMode;
  readonly name: string;
  readonly badge: string;
  readonly description: string;
  readonly icon: string;
}

interface AudioModeCard {
  readonly id: HostAudioMode;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
}

const AUDIO_MODES: readonly AudioModeCard[] = [
  {
    id: 'SPOTIFY_PREMIUM',
    name: 'Spotify Premium',
    description: 'Control automático si tienes Premium y un dispositivo activo.',
    icon: '🟢'
  },
  {
    id: 'YOUTUBE',
    name: 'YouTube',
    description: 'Busca o pega el vídeo; suena solo en la escucha, sin Premium.',
    icon: '▶️'
  },
  {
    id: 'MANUAL',
    name: 'Manual',
    description: 'Sin APIs: pones la canción tú y avanzas desde el tablero.',
    icon: '✋'
  }
];

const MODES: readonly ModeCard[] = [
  {
    id: 'CARDS_12',
    name: '12 Rondas',
    badge: '8–15s + 6s',
    description: 'Ruleta de género y década, 4 cartas tocadiscos y podio final.',
    icon: '♠'
  },
  {
    id: 'KARAOKE',
    name: 'Karaoke Ruleta Rusa',
    badge: '15–20s',
    description: 'Canción y jugador al azar, reto de canto y 1 comodín por partida.',
    icon: '🎤'
  },
  {
    id: 'MIXED',
    name: 'Mixto',
    badge: 'Rondas 4, 8 y 12',
    description: 'Cartas tocadiscos con karaokes intercalados y marcador único.',
    icon: '✦'
  }
];

@Component({
  selector: 'app-lobby',
  imports: [SessionViewComponent],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LobbyComponent {
  readonly session = inject(GameSessionService);
  readonly route = inject(ActivatedRoute);
  readonly catalog = inject(CatalogSyncService);
  readonly spotify = inject(SpotifyHostAudioService);
  readonly audio = inject(HostAudioControllerService);
  readonly preview = inject(PreviewAudioService);

  readonly modes = MODES;
  readonly audioModes = AUDIO_MODES;
  readonly packs = CATALOG_PACKS;
  readonly tab = signal<'create' | 'join'>('create');
  readonly mode = signal<GameMode>('CARDS_12');
  readonly pack = signal<CatalogPackId>('mix');
  readonly nickname = signal('');
  readonly joinCode = signal('');
  // Sin bots por defecto: solo se suman si el host los elige explícitamente.
  readonly bots = signal(0);
  readonly includeSelf = signal(true);
  readonly manual = signal(false);
  readonly error = signal('');

  readonly inSession = computed(() => this.session.inSession());
  readonly selectedMode = computed(() => MODES.find((m) => m.id === this.mode()) ?? MODES[0]!);
  /** El apodo es obligatorio para entrar: sin él no se abre ninguna conexión. */
  readonly validNickname = computed(() => this.nickname().trim().length >= 2);
  readonly canJoin = computed(() => this.validNickname() && this.joinCode().length === 6);
  /** Solo pedimos login si el host eligió Premium y aún no está conectado. */
  readonly wantsSpotifyLogin = computed(
    () =>
      this.audio.mode() === 'SPOTIFY_PREMIUM' &&
      !this.manual() &&
      this.spotify.configured &&
      this.spotify.status() !== 'connected'
  );

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const code = params.get('code');
      if (code) {
        this.joinCode.set(code.toUpperCase().slice(0, 6));
        this.tab.set('join');
      }
    });

    // El redirect PKCE recarga la página: al volver, reanudamos la sala que el
    // host estaba creando. El modal ya fue aceptado antes de salir a Spotify.
    effect(() => {
      if (!this.spotify.redirectCompleted()) return;
      const intent = this.spotify.consumeCreateIntent();
      if (!intent) return;
      this.#restoreIntent(intent);
      void this.#resumeAfterOAuth();
    });
  }

  async createRoom(): Promise<void> {
    this.preview.unlock();
    const wantsSpotify = this.wantsSpotifyLogin();
    if (wantsSpotify) {
      // Guardamos solo el formulario (sin tokens) para reanudar tras el redirect.
      this.spotify.saveCreateIntent({
        mode: this.mode(),
        pack: this.pack(),
        nickname: this.nickname(),
        bots: this.bots(),
        includeSelf: this.includeSelf(),
        manual: this.manual(),
        audioMode: this.audio.mode(),
        listenDurationSec: this.audio.listenDurationSec()
      });
    }

    const names = ['Ana', 'Carlos', 'Sofía'].slice(0, this.bots());
    // Carga efímera: si /api/catalog falla, el servicio usa VINIL06_CATALOG local.
    const tracks = await this.catalog.loadPack(this.pack());
    this.session.requestHost({
      mode: this.mode(),
      includeSelf: this.includeSelf(),
      botNames: names,
      manual: this.manual(),
      tracks,
      connectSpotify: wantsSpotify
    });
  }

  selectPack(id: CatalogPackId): void {
    this.pack.set(id);
  }

  selectedPackLabel(): string {
    return packLabel(this.pack());
  }

  /** Escribir el apodo tras pegar/vivir con el código también entra automáticamente. */
  onNickname(value: string): void {
    this.nickname.set(value);
    if (this.tab() === 'join' && this.canJoin()) this.joinRoom();
  }

  joinRoom(): void {
    this.preview.unlock();
    const code = this.joinCode().trim().toUpperCase();
    if (!this.validNickname()) {
      this.error.set('Escribe tu apodo (al menos 2 letras) para entrar a la sala.');
      return;
    }
    if (code.length !== 6) {
      this.error.set('El código de sala tiene 6 caracteres.');
      return;
    }
    this.error.set('');
    this.session.join(code, this.nickname());
  }

  setCode(value: string): void {
    const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    this.joinCode.set(code);
    this.error.set('');
    // Al completar los 6 caracteres entramos solos: el botón queda como respaldo
    // para el caso de venir por enlace (/jugar/CODE) o pegar un código incompleto.
    if (code.length === 6) this.joinRoom();
  }

  setBots(value: number): void {
    this.bots.set(Math.min(3, Math.max(0, value)));
  }

  selectAudioMode(mode: HostAudioMode): void {
    this.audio.setMode(mode);
  }

  /** Stepper con clamp estricto [8, 15] y paso de 0.5s. */
  setListenDuration(value: number): void {
    this.audio.setListenDurationSec(value);
  }

  #restoreIntent(intent: SpotifyCreateIntent): void {
    this.tab.set('create');
    this.mode.set(intent.mode);
    this.pack.set(isCatalogPackId(intent.pack) ? intent.pack : 'mix');
    this.nickname.set(intent.nickname);
    this.bots.set(Math.min(3, Math.max(0, intent.bots)));
    this.includeSelf.set(intent.includeSelf);
    this.manual.set(intent.manual);
    this.audio.setMode(intent.audioMode ?? 'SPOTIFY_PREMIUM');
    this.audio.setListenDurationSec(intent.listenDurationSec ?? 8);
    // Ya volvimos de Spotify: el modo Premium queda activo pero no se redirige
    // otra vez porque el token ya está en memoria (wantsSpotifyLogin es false).
  }

  async #resumeAfterOAuth(): Promise<void> {
    const tracks = await this.catalog.loadPack(this.pack());
    this.session.activateHostAfterOAuth({
      mode: this.mode(),
      includeSelf: this.includeSelf(),
      botNames: ['Ana', 'Carlos', 'Sofía'].slice(0, this.bots()),
      manual: this.manual(),
      tracks
    });
  }
}
