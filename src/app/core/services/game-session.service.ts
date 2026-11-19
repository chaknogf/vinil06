import { computed, DestroyRef, effect, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ConnectionStatus, GameMode, Role, RoomState, VinilTrack } from '../models/game.models';
import { createClientId } from '../utils/random';
import { RoomSyncService } from '../sync/room-sync.service';
import { GameEngineService, LOCAL_PLAYER_ID } from './game-engine.service';

export interface HostSetup {
  readonly mode: GameMode;
  readonly includeSelf: boolean;
  readonly botNames: readonly string[];
  readonly manual: boolean;
  /** Pack sincronizado en memoria (o local si no hay red). */
  readonly tracks?: readonly VinilTrack[];
  /** El host quiere conectar Spotify Premium antes de activar el tablero. */
  readonly connectSpotify?: boolean;
}

/**
 * Fachada de sesión: une motor local, transporte y vista del jugador.
 * El anfitrión es autoritativo; los invitados solo dibujan snapshots.
 */
@Injectable({ providedIn: 'root' })
export class GameSessionService implements OnDestroy {
  readonly #sync = inject(RoomSyncService);
  readonly #engine = inject(GameEngineService);
  readonly #destroyRef = inject(DestroyRef);

  readonly clientId = createClientId();
  readonly role = signal<Role | null>(null);
  readonly nickname = signal('');
  readonly roomCode = signal('');
  readonly connection = signal<ConnectionStatus>('idle');
  readonly privacyVisible = signal(false);
  /** true mientras el modal debe derivar al login de Spotify antes de activar. */
  readonly pendingConnectSpotify = signal(false);
  readonly remoteState = signal<RoomState | null>(null);
  readonly clockOffset = signal(0);
  readonly syncKind = this.#sync.kind;

  readonly inSession = computed(() => this.role() !== null);
  readonly viewState = computed<RoomState | null>(() =>
    this.role() === 'host' ? this.#engine.snapshot() : this.remoteState()
  );

  readonly localPlayerId = computed(() =>
    this.role() === 'host'
      ? this.#engine.players().some((p) => p.id === LOCAL_PLAYER_ID)
        ? LOCAL_PLAYER_ID
        : ''
      : this.clientId
  );

  /** Pista que el anfitrión debe abrir en Spotify; nunca se envía a los jugadores. */
  readonly hostTrack = computed(() =>
    this.role() === 'host' ? this.#engine.hostTrack() : null
  );

  /** Canales WebRTC abiertos (solo peer; con local/cloud el conteo sale del snapshot). */
  readonly peerConnections = signal(0);
  /** Jugadores reales en la sala, sin bots: lo que ve el host antes de girar. */
  readonly onlinePlayers = computed(() =>
    (this.viewState()?.players ?? []).filter((player) => !player.isBot)
  );
  readonly onlineCount = computed(() => this.onlinePlayers().length);
  readonly onlineNames = computed(() => this.onlinePlayers().map((player) => player.name));

  #pendingHost: HostSetup | null = null;
  #helloSent = false;
  #presenceId: ReturnType<typeof setInterval> | null = null;
  #lastSeen = new Map<string, number>();
  #subs: Subscription[] = [];
  #unloadHandler: (() => void) | null = null;

  constructor() {
    this.#subs.push(
      this.#sync.status.subscribe((status) => {
        this.connection.set(status);
        if (status === 'connected' && this.role() === 'player') {
          // El HELLO se envía cuando el DataChannel ya está abierto. Si se
          // reenvía tras una reconexión, el host lo ignora por clientId.
          this.#sendHello();
        } else if (status !== 'connected') {
          this.#helloSent = false;
        }
      })
    );

    this.#subs.push(
      this.#sync.connectionCount$.subscribe((count) => this.peerConnections.set(count))
    );

    this.#subs.push(
      this.#sync.ofType('HELLO').subscribe((message) => {
        if (this.role() === 'host') {
          this.#engine.addPlayer(message.clientId, message.payload.nickname);
          this.#lastSeen.set(message.clientId, Date.now());
        }
      })
    );

    this.#subs.push(
      this.#sync.ofType('ANSWER').subscribe((message) => {
        if (this.role() === 'host') {
          // El tiempo de llegada se mide AQUÍ, no se confía en el reloj del jugador.
          this.#engine.recordAnswer(message.clientId, message.payload.optionId);
        }
      })
    );

    this.#subs.push(
      this.#sync.ofType('WILDCARD').subscribe((message) => {
        if (this.role() === 'host') this.#engine.useWildcard(message.clientId);
      })
    );

    this.#subs.push(
      this.#sync.ofType('KARAOKE_DONE').subscribe(() => {
        if (this.role() === 'host') this.#engine.finishKaraoke('done');
      })
    );

    this.#subs.push(
      this.#sync.ofType('BYE').subscribe((message) => {
        if (this.role() === 'host') {
          this.#engine.removePlayer(message.clientId);
          this.#lastSeen.delete(message.clientId);
        }
      })
    );

    this.#subs.push(
      this.#sync.ofType('STATE').subscribe((message) => {
        if (this.role() === 'player') {
          this.remoteState.set(message.payload);
          this.#updateClockOffset(message.payload.hostNow);
        }
      })
    );

    // Publica snapshots del motor solo mientras esta pestaña sea el host.
    effect(() => {
      const state = this.#engine.snapshot();
      if (this.role() === 'host' && state.roomCode) {
        this.#sync.publish('STATE', state);
      }
    });

    this.#unloadHandler = () => this.leave();
    window.addEventListener('pagehide', this.#unloadHandler);
    window.addEventListener('beforeunload', this.#unloadHandler);
    this.#destroyRef.onDestroy(() => this.#removeUnloadListeners());
  }

  /** Paso 1: el host elige opciones; el modal bloqueante se muestra antes de activar. */
  requestHost(setup: HostSetup): void {
    this.#pendingHost = setup;
    this.pendingConnectSpotify.set(setup.connectSpotify === true);
    this.privacyVisible.set(true);
  }

  closePrivacy(): void {
    this.privacyVisible.set(false);
  }

  /** Paso 2a: acepta la transparencia y activa el tablero sincronizado. */
  activateHost(): void {
    this.#commitHost(false);
  }

  /** Paso 2b: tablero manual, sin transporte de red. */
  activateManualHost(): void {
    this.#commitHost(true);
  }

  /**
   * Reanuda la activación tras el redirect PKCE: el modal ya fue aceptado,
   * así que no se vuelve a mostrar. El intent se restaura desde el lobby.
   */
  activateHostAfterOAuth(setup: HostSetup): void {
    this.#pendingHost = setup;
    this.#commitHost(false);
  }

  join(roomCode: string, nickname: string): void {
    this.leave();
    const code = roomCode.trim().toUpperCase();
    const name = nickname.trim().slice(0, 18);
    // Sin apodo no hay jugador: la UI lo exige y aquí lo verificamos también.
    if (!code || name.length < 2) return;

    this.role.set('player');
    this.nickname.set(name);
    this.roomCode.set(code);
    this.remoteState.set(null);
    this.clockOffset.set(0);
    this.#helloSent = false;
    this.#sync.connect(code, 'player', this.clientId);
    this.#startPresence();
    this.#sendHello();
  }

  /** Reintento manual desde la UI cuando el canal no responde. */
  retryConnection(): void {
    const role = this.role();
    const code = this.roomCode();
    if (!role || !code) return;
    this.remoteState.set(null);
    this.#helloSent = false;
    this.connection.set('idle');
    this.#sync.connect(code, role, this.clientId);
    if (role === 'player') this.#sendHello();
  }

  leave(): void {
    this.#stopPresence();
    if (this.role() === 'player') {
      this.#sync.publish('BYE', {});
    }
    this.#sync.disconnect();
    this.role.set(null);
    this.roomCode.set('');
    this.nickname.set('');
    this.remoteState.set(null);
    this.clockOffset.set(0);
    this.#helloSent = false;
    this.#pendingHost = null;
    this.privacyVisible.set(false);
    this.pendingConnectSpotify.set(false);
    this.connection.set('idle');
    this.#engine.reset();
  }

  answer(optionId: string): void {
    if (this.role() === 'host') {
      const id = this.localPlayerId();
      if (id) this.#engine.recordAnswer(id, optionId);
    } else if (this.role() === 'player') {
      this.#sync.publish('ANSWER', { optionId, answeredAtMs: 0 });
    }
  }

  useWildcard(): void {
    const id = this.localPlayerId();
    if (!id) return;
    if (this.role() === 'host') this.#engine.useWildcard(id);
    else this.#sync.publish('WILDCARD', {});
  }

  karaokeDone(done: boolean): void {
    if (this.role() === 'host') this.#engine.finishKaraoke(done ? 'done' : 'pass');
    else this.#sync.publish('KARAOKE_DONE', { wildcardUsed: !done });
  }

  // ---- Acciones del host ---------------------------------------------

  spin(): void {
    if (this.role() === 'host') this.#engine.spin();
  }

  advance(): void {
    if (this.role() === 'host') this.#engine.advance();
  }

  showPodium(): void {
    if (this.role() === 'host') this.#engine.showPodium();
  }

  skipListen(): void {
    if (this.role() === 'host') this.#engine.skipListen();
  }

  closeRound(): void {
    if (this.role() === 'host') this.#engine.closeRound();
  }

  copyInviteLink(): string {
    return `${window.location.origin}/jugar/${this.roomCode()}`;
  }

  ngOnDestroy(): void {
    this.leave();
    this.#stopPresence();
    this.#subs.forEach((sub) => sub.unsubscribe());
    this.#subs = [];
    this.#removeUnloadListeners();
  }

  #commitHost(manual: boolean): void {
    const setup = this.#pendingHost;
    this.privacyVisible.set(false);
    this.pendingConnectSpotify.set(false);
    // El host puede volver a abrir el aviso desde el tablero: sin setup pendiente,
    // sus botones solo lo cierran (no reinician la sala).
    if (!setup) return;
    this.role.set('host');
    this.remoteState.set(null);
    this.clockOffset.set(0);
    const code = this.#engine.createRoom(
      setup.mode,
      setup.includeSelf,
      setup.botNames,
      manual || setup.manual,
      setup.tracks
    );
    this.roomCode.set(code);
    this.#pendingHost = null;
    this.#startPresence();

    // El tablero manual funciona 100% en esta pestaña; el normal usa pub/sub.
    if (!manual) this.#sync.connect(code, 'host', this.clientId);
  }

  #sendHello(force = false): void {
    if (
      (!force && this.#helloSent) ||
      this.role() !== 'player' ||
      this.connection() !== 'connected'
    ) return;
    this.#sync.publish('HELLO', { nickname: this.nickname() });
    this.#helloSent = true;
  }

  /**
   * Presencia viva: el invitado repite su HELLO cada 4s (el host dedupe por
   * clientId) y el host retira a quien dejó de enviarlo. Así el conteo funciona
   * también cuando un celular pierde el DataChannel sin llegar a enviar BYE.
   */
  #startPresence(): void {
    this.#stopPresence();
    this.#presenceId = setInterval(() => {
      if (this.role() === 'player') {
        this.#sendHello(true);
        return;
      }
      if (this.role() !== 'host') return;
      const now = Date.now();
      for (const [id, seen] of this.#lastSeen) {
        if (now - seen > 12_000) {
          this.#lastSeen.delete(id);
          this.#engine.removePlayer(id);
        }
      }
    }, 4000);
  }

  #stopPresence(): void {
    if (this.#presenceId !== null) {
      clearInterval(this.#presenceId);
      this.#presenceId = null;
    }
    this.#lastSeen.clear();
  }

  #updateClockOffset(hostNow: number): void {
    const diff = hostNow - Date.now();
    const current = this.clockOffset();
    this.clockOffset.set(current === 0 ? diff : Math.round(current * 0.8 + diff * 0.2));
  }

  #removeUnloadListeners(): void {
    if (!this.#unloadHandler) return;
    window.removeEventListener('pagehide', this.#unloadHandler);
    window.removeEventListener('beforeunload', this.#unloadHandler);
    this.#unloadHandler = null;
  }
}
