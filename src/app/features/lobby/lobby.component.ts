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
import { HostPreferencesService } from '../../core/services/host-preferences.service';
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
    id: 'ITUNES',
    name: 'iTunes',
    description: 'Preview de la canción exacta en tu altavoz. Sin login, sin clave y sin red extra.',
    icon: '🎵'
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
  readonly prefs = inject(HostPreferencesService);
  readonly preview = inject(PreviewAudioService);

  readonly modes = MODES;
  readonly audioModes = AUDIO_MODES;
  readonly packs = CATALOG_PACKS;
  readonly tab = signal<'create' | 'join'>('create');
  /** El formulario arranca con los ajustes guardados en este dispositivo. */
  readonly mode = signal<GameMode>(this.prefs.value().mode);
  readonly pack = signal<CatalogPackId>(this.prefs.value().pack);
  readonly nickname = signal(this.prefs.value().nickname);
  readonly joinCode = signal('');
  readonly bots = signal(this.prefs.value().bots);
  readonly includeSelf = signal(this.prefs.value().includeSelf);
  readonly manual = signal(this.prefs.value().manual);
  readonly error = signal('');
  readonly joining = signal(false);
  readonly recoverableRoom = this.session.recoverableRoom;
  readonly recovering = this.session.recovering;

  readonly inSession = computed(() => this.session.inSession());
  readonly selectedMode = computed(() => MODES.find((m) => m.id === this.mode()) ?? MODES[0]!);
  /** El apodo es obligatorio para entrar: sin él no se abre ninguna conexión. */
  readonly validNickname = computed(() => this.nickname().trim().length >= 2);
  readonly validCode = computed(() => /^[A-Z0-9]{6}$/.test(this.joinCode()));
  readonly canJoin = computed(
    () => this.validNickname() && this.validCode() && !this.joining() && !this.inSession()
  );
  /** Solo pedimos login si el host eligió Premium y aún no está conectado. */
  readonly wantsSpotifyLogin = computed(
    () =>
      this.audio.mode() === 'SPOTIFY_PREMIUM' &&
      !this.manual() &&
      this.spotify.configured &&
      this.spotify.status() !== 'connected'
  );

  constructor() {
    this.audio.setMode(this.prefs.value().audioMode);
    this.audio.setListenDurationSec(this.prefs.value().listenDurationSec);

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const code = params.get('code');
      if (code) {
        const incoming = code.toUpperCase().slice(0, 6);
        this.joinCode.set(incoming);
        this.tab.set('join');
        if (this.inSession() && incoming !== this.session.roomCode()) {
          this.session.notice.set(
            `Estás en otra sala. Sal y vuelve a entrar con el código #${incoming}.`
          );
        }
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
    if (this.inSession() || this.joining()) return;
    this.joining.set(true);
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

    try {
      const names = ['Ana', 'Carlos', 'Sofía'].slice(0, this.bots());
      // Carga efímera: si /api/catalog falla, el servicio usa VINIL06_CATALOG local.
      const tracks = await this.catalog.loadPack(this.pack());
      this.session.requestHost({
        mode: this.mode(),
        nickname: this.nickname(),
        includeSelf: this.includeSelf(),
        botNames: names,
        manual: this.manual(),
        tracks,
        connectSpotify: wantsSpotify
      });
    } finally {
      this.joining.set(false);
    }
  }

  selectPack(id: CatalogPackId): void {
    this.pack.set(id);
    this.#persist({ pack: id });
  }

  selectedPackLabel(): string {
    return packLabel(this.pack());
  }

  /**
   * El apodo es texto libre: NUNCA entramos automáticamente al escribirlo, o
   * el jugador sería registrado con la primera sílaba (p. ej. "An" en vez de
   * "Ana"). El botón "Entrar a la sala" o Enter confirma el nombre completo.
   */
  onNickname(value: string): void {
    this.nickname.set(value);
    this.error.set('');
    this.#persist({ nickname: value });
  }

  joinRoom(): void {
    if (this.inSession() || this.joining()) return;
    this.preview.unlock();
    const code = this.joinCode().trim().toUpperCase();
    if (!this.validNickname()) {
      this.error.set('Escribe tu apodo (al menos 2 caracteres) para entrar a la sala.');
      return;
    }
    if (!this.validCode()) {
      this.error.set('El código de sala tiene 6 caracteres (letras o números).');
      return;
    }
    this.error.set('');
    this.joining.set(true);
    this.session.join(code, this.nickname());
    // Al cambiar de vista sin navegar, el scroll no se reseteaba solo.
    window.scrollTo({ top: 0, behavior: 'instant' });
    setTimeout(() => this.joining.set(false), 700);
  }

  setCode(value: string): void {
    const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    this.joinCode.set(code);
    this.error.set('');
    // Sin auto-ingreso: el jugador termina su apodo y pulsa "Entrar a la sala".
    // Así nunca se registra a medias un nombre ni se entra antes de querer.
  }

  setBots(value: number): void {
    const safe = Math.min(3, Math.max(0, value));
    this.bots.set(safe);
    this.#persist({ bots: safe });
  }

  setMode(mode: GameMode): void {
    this.mode.set(mode);
    this.#persist({ mode });
  }

  setIncludeSelf(value: boolean): void {
    this.includeSelf.set(value);
    this.#persist({ includeSelf: value });
  }

  setManual(value: boolean): void {
    this.manual.set(value);
    this.#persist({ manual: value });
  }

  selectAudioMode(mode: HostAudioMode): void {
    this.audio.setMode(mode);
    this.#persist({ audioMode: mode });
  }

  /** Stepper con clamp estricto [8, 15] y paso de 0.5s. */
  setListenDuration(value: number): void {
    this.audio.setListenDurationSec(value);
    this.#persist({ listenDurationSec: this.audio.listenDurationSec() });
  }

  /** Recupera o descarta la sala guardada en este dispositivo. */
  recoverRoom(): void {
    void this.session.recoverRoom();
  }

  discardRecoverableRoom(): void {
    this.session.discardRecoverableRoom();
  }

  /** Cada cambio del lobby se guarda en localStorage; nunca es estado de juego. */
  #persist(patch: Parameters<HostPreferencesService['update']>[0]): void {
    this.prefs.update(patch);
  }

  #restoreIntent(intent: SpotifyCreateIntent): void {
    this.tab.set('create');
    this.mode.set(intent.mode);
    this.pack.set(isCatalogPackId(intent.pack) ? intent.pack : 'mix');
    this.nickname.set(intent.nickname);
    this.bots.set(Math.min(3, Math.max(0, intent.bots)));
    this.includeSelf.set(intent.includeSelf);
    this.manual.set(intent.manual);
    this.audio.setMode(intent.audioMode ?? 'ITUNES');
    this.audio.setListenDurationSec(intent.listenDurationSec ?? 8);
    // Ya volvimos de Spotify: el modo Premium queda activo pero no se redirige
    // otra vez porque el token ya está en memoria (wantsSpotifyLogin es false).
  }

  async #resumeAfterOAuth(): Promise<void> {
    const tracks = await this.catalog.loadPack(this.pack());
    this.session.activateHostAfterOAuth({
      mode: this.mode(),
      nickname: this.nickname(),
      includeSelf: this.includeSelf(),
      botNames: ['Ana', 'Carlos', 'Sofía'].slice(0, this.bots()),
      manual: this.manual(),
      tracks
    });
  }
}
