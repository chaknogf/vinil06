import { computed, DestroyRef, effect, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ConnectionStatus, GameMode, Role, RoomState, VinilTrack } from '../models/game.models';
import { createClientId } from '../utils/random';
import { RoomSyncService } from '../sync/room-sync.service';
import { HostRoomRecord, HostRoomStore } from '../sync/host-room-store.service';
import { GuestRoomRecord, GuestRoomStore } from '../sync/guest-room-store.service';
import { GameEngineService, LOCAL_PLAYER_ID } from './game-engine.service';
import { HostAudioControllerService } from './host-audio-controller.service';
import { PreviewAudioService } from './preview-audio.service';
import { environment } from '../../../environments/environment';

export interface HostSetup {
  readonly mode: GameMode;
  readonly nickname?: string;
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
  readonly #hostAudio = inject(HostAudioControllerService);
  readonly #store = inject(HostRoomStore);
  readonly #preview = inject(PreviewAudioService);
  readonly #guestStore = inject(GuestRoomStore);
  readonly #destroyRef = inject(DestroyRef);

  /** Estable mientras dure la sala: se restaura del dispositivo al volver. */
  clientId = createClientId();
  readonly role = signal<Role | null>(null);
  readonly nickname = signal('');
  readonly roomCode = signal('');
  readonly connection = signal<ConnectionStatus>('idle');
  readonly privacyVisible = signal(false);
  /** Aviso persistente del lobby (p. ej. tras cancelar la creación de sala). */
  readonly notice = signal('');
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

  /** Preview que suena en el host; nunca se publica en el snapshot de la sala. */
  readonly hostAudioUrl = computed(() =>
    this.role() === 'host' ? this.#engine.audioUrl() : ''
  );

  /** Última sala guardada en este dispositivo, lista para recuperar desde el lobby. */
  readonly recoverableRoom = signal<HostRoomRecord | null>(null);
  /** Última sala de invitado guardada en este dispositivo (30 min). */
  readonly recoverableGuestRoom = signal<GuestRoomRecord | null>(null);
  readonly connectionDetail = computed(() => this.#sync.lastError?.() ?? '');
  readonly recovering = signal(false);

  /** Canales WebRTC abiertos (solo peer; con local/cloud el conteo sale del snapshot). */
  readonly peerConnections = signal(0);
  /** Jugadores reales en la sala, sin bots: lo que ve el host antes de girar. */
  readonly onlinePlayers = computed(() =>
    (this.viewState()?.players ?? []).filter((player) => !player.isBot && player.connected)
  );
  readonly onlineCount = computed(() => this.onlinePlayers().length);
  readonly onlineNames = computed(() => this.onlinePlayers().map((player) => player.name));

  #pendingHost: HostSetup | null = null;
  #helloSent = false;
  #presenceId: ReturnType<typeof setInterval> | null = null;
  #lastSeen = new Map<string, number>();
  /** Firma del snapshot sin `hostNow`: evita publicar el estado en cada latido. */
  #lastStateSignature = '';
  #roomCreatedAt = 0;
  #lastStateAt = 0;
  #lastAnswer: { readonly optionId: string; readonly roundIndex: number } | null = null;
  #replayedAnswerRound = -1;
  #subs: Subscription[] = [];
  #unloadHandler: ((event: Event) => void) | null = null;
  readonly #visibilityHandler = () => {
    if (document.visibilityState === 'visible') this.#resumeForeground();
  };
  readonly #pageshowHandler = () => this.#resumeForeground();
  readonly #onlineHandler = () => this.#resumeForeground();

  constructor() {
    // Un invitado que vuelve conserva su clientId: el host lo reconoce y le
    // devuelve su marcador. Nada de estado de juego se persiste localmente.
    const guest = this.#guestStore.load();
    if (guest?.clientId) this.clientId = guest.clientId;
    this.recoverableGuestRoom.set(guest);

    // Recuperación explícita: nunca reabrimos una sala sin que el host lo pida.
    void this.#loadRecoverableRoom();

    this.#subs.push(
      this.#sync.status.subscribe((status) => {
        this.connection.set(status);
        if (status === 'connected' && this.role() === 'player') {
          // El HELLO se envía cuando el DataChannel ya está abierto. Si se
          // reenvía tras una reconexión, el host lo ignora por clientId.
          this.#sendHello();
          // El host solo emite STATE cuando cambia la firma: sin pedirlo aquí,
          // quien reconecta se queda sin tablero hasta el siguiente cambio de fase.
          this.#sync.publish('STATE_REQUEST', {});
        } else if (status !== 'connected') {
          this.#helloSent = false;
        }
      })
    );

    this.#subs.push(
      this.#sync.connectionCount$.subscribe((count) => this.peerConnections.set(count))
    );

    // Firebase da presencia real: no hace falta expulsar por timeout de HELLO.
    if (this.#sync.presence$) {
      this.#subs.push(
        this.#sync.presence$.subscribe((ids) => this.#syncRoster(ids))
      );
    }

    this.#subs.push(
      this.#sync.ofType('HELLO').subscribe((message) => {
        if (this.role() === 'host') {
          this.#engine.addPlayer(message.clientId, message.payload.nickname);
          this.#lastSeen.set(message.clientId, Date.now());
        }
      })
    );

    // Un jugador que reconecta pide el snapshot: sin esto podía quedarse en
    // "Esperando el tablero" hasta el siguiente cambio de fase.
    this.#subs.push(
      this.#sync.ofType('STATE_REQUEST').subscribe((message) => {
        if (this.role() !== 'host') return;
        this.#lastSeen.set(message.clientId, Date.now());
        this.#sync.publish('STATE', this.#engine.snapshot());
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
        if (this.role() !== 'host') return;
        // Solo el cantante puede gastar el comodín de su turno.
        if (message.clientId === this.#engine.karaoke()?.singerId) {
          this.#engine.useWildcard(message.clientId);
        }
      })
    );

    this.#subs.push(
      this.#sync.ofType('KARAOKE_DONE').subscribe((message) => {
        if (this.role() !== 'host') return;
        // El envelope trae clientId: sin esta guarda cualquier invitado podía
        // cerrar el turno ajeno y regalarle +2 al cantante.
        if (message.clientId === this.#engine.karaoke()?.singerId) {
          this.#engine.finishKaraoke(message.payload.wildcardUsed ? 'pass' : 'done');
        }
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
          this.#lastStateAt = Date.now();
          this.remoteState.set(message.payload);
          this.#updateClockOffset(message.payload.hostNow);
          this.#replayAnswer(message.payload);
        }
      })
    );

    // El latido del motor actualiza `hostNow` cada segundo. El desfase de reloj
    // se compensa con ese valor, pero no hace falta enviar todo el snapshot:
    // los cronómetros usan `phaseStartedAt` + `clockOffset`, no `hostNow`.
    this.#subs.push(
      this.#sync.ofType('PING').subscribe((message) => {
        this.#lastStateAt = Date.now();
        this.#updateClockOffset(message.payload.hostNow);
        const current = this.remoteState();
        if (current) this.remoteState.set({ ...current, hostNow: message.payload.hostNow });
      })
    );

    // STATE solo cuando cambia algo que no sea la hora (fase, jugador, puntos…).
    // PING viaja como evento tiny (~100 B) en vez de ~KB del snapshot completo.
    effect(() => {
      const state = this.#engine.snapshot();
      if (this.role() !== 'host' || !state.roomCode) return;

      const signature = JSON.stringify({ ...state, hostNow: 0 });
      if (signature !== this.#lastStateSignature) {
        this.#lastStateSignature = signature;
        this.#sync.publish('STATE', state);
        // Escritura local, nunca remota: el estado de la sala no sale del dispositivo.
        void this.#store.save(state.roomCode, this.#engine.backup());
      }
      this.#sync.publish('PING', { hostNow: state.hostNow });
    });

    this.#unloadHandler = (event: Event) => {
      // bfcache (típico en iOS al cambiar de app): la página vuelve igual, no
      // hay que destruir el Peer ni borrar la sesión.
      if ((event as PageTransitionEvent).persisted) return;
      // Cerrar la pestaña NO debe contar como abandono del juego: guardamos la
      // identidad y nos vamos sin BYE para conservar el marcador al volver.
      this.leave({ keepGuestSession: true, silent: true });
    };
    window.addEventListener('pagehide', this.#unloadHandler);
    window.addEventListener('beforeunload', this.#unloadHandler);
    window.addEventListener('pageshow', this.#pageshowHandler);
    document.addEventListener('visibilitychange', this.#visibilityHandler);
    window.addEventListener('online', this.#onlineHandler);
    this.#destroyRef.onDestroy(() => this.#removeUnloadListeners());
  }

  /** Al volver al foreground: presence, snapshot y reintento si hace falta. */
  #resumeForeground(): void {
    const role = this.role();
    if (!role) return;
    if (role === 'player') {
      this.#sendHello(true);
      if (this.connection() === 'connected') this.#sync.publish('STATE_REQUEST', {});
    }
    if (this.connection() !== 'connected') this.retryConnection();
  }

  /** Paso 1: el host elige opciones; el modal bloqueante se muestra antes de activar. */
  requestHost(setup: HostSetup): void {
    this.#pendingHost = setup;
    this.notice.set('');
    this.pendingConnectSpotify.set(setup.connectSpotify === true);
    this.privacyVisible.set(true);
  }

  closePrivacy(): void {
    this.privacyVisible.set(false);
    if (this.#pendingHost) {
      this.#pendingHost = null;
      this.notice.set('No se creó la sala. Pulsa «Crear sala» cuando quieras.');
    }
  }

  dismissNotice(): void {
    this.notice.set('');
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
    this.#lastStateAt = Date.now();
    this.#lastAnswer = null;
    this.#replayedAnswerRound = -1;
    this.#guestStore.save(code, name, this.clientId);
    this.recoverableGuestRoom.set(this.#guestStore.load());
    this.#sync.connect(code, 'player', this.clientId);
    this.#startPresence();
    this.#sendHello();
  }

  /** Vuelve a la sala anterior con el mismo clientId y apodo. */
  resumeGuestRoom(): void {
    const saved = this.recoverableGuestRoom() ?? this.#guestStore.load();
    if (!saved) return;
    if (saved.clientId) this.clientId = saved.clientId;
    this.join(saved.code, saved.nickname);
  }

  forgetGuestRoom(): void {
    this.#guestStore.clear();
    this.recoverableGuestRoom.set(null);
  }

  /** Cierra la sala y borra su copia local. Solo el anfitrión puede hacerlo. */
  closeRoom(): void {
    if (this.role() !== 'host') return;
    const code = this.roomCode();
    this.leave({ closeRoom: true });
    void this.#store.clear(code);
    this.recoverableRoom.set(null);
  }

  /** Recupera la última sala guardada en este dispositivo tras una recarga. */
  async recoverRoom(): Promise<void> {
    if (this.inSession() || this.recovering()) return;
    this.recovering.set(true);
    try {
      const record = this.recoverableRoom() ?? (await this.#store.loadLast());
      if (!record) {
        this.recoverableRoom.set(null);
        return;
      }
      this.#preview.unlock();
      this.#engine.restore(record.backup);
      this.role.set('host');
      this.roomCode.set(record.code);
      this.nickname.set('');
      this.remoteState.set(null);
      this.clockOffset.set(0);
      this.#lastStateSignature = '';
      this.#roomCreatedAt = record.createdAt;
      this.#startPresence();
      this.#sync.connect(record.code, 'host', this.clientId);
      this.#engine.resumeRestoredAudio();
      this.recoverableRoom.set(null);
      this.notice.set(`Sala #${record.code} recuperada de este dispositivo. Avisa a los jugadores para que vuelvan a entrar.`);
    } catch {
      this.notice.set('No se pudo recuperar la sala guardada en este dispositivo.');
    } finally {
      this.recovering.set(false);
    }
  }

  /** Descarta la copia local: la sala no se podrá recuperar tras recargar. */
  discardRecoverableRoom(): void {
    const code = this.recoverableRoom()?.code;
    this.recoverableRoom.set(null);
    if (code) void this.#store.clear(code);
  }

  async #loadRecoverableRoom(): Promise<void> {
    try {
      this.recoverableRoom.set(await this.#store.loadLast());
    } catch {
      this.recoverableRoom.set(null);
    }
  }

  /** Reintento manual desde la UI cuando el canal no responde. */
  retryConnection(): void {
    const role = this.role();
    const code = this.roomCode();
    if (!role || !code) return;
    this.remoteState.set(null);
    this.#helloSent = false;
    // 0 desarma el watchdog mientras se abre el nuevo Peer; el primer STATE o
    // PING que llegue vuelve a ponerlo en marcha.
    this.#lastStateAt = 0;
    this.connection.set('idle');
    this.#sync.connect(code, role, this.clientId);
    if (role === 'player') this.#sendHello();
  }

  leave(
    options?: {
      readonly closeRoom?: boolean;
      /** Cerrar la pestaña no borra la identidad del invitado. */
      readonly keepGuestSession?: boolean;
      /** No avisar de salida: queremos conservar el puesto al volver. */
      readonly silent?: boolean;
    }
  ): void {
    this.#stopPresence();
    if (this.role() === 'player' && !options?.silent) {
      this.#sync.publish('BYE', {});
    }
    if (this.role() === 'player' && !options?.keepGuestSession) {
      this.#guestStore.clear();
    }
    this.recoverableGuestRoom.set(options?.keepGuestSession ? this.#guestStore.load() : null);
    this.#lastAnswer = null;
    this.#replayedAnswerRound = -1;
    this.#lastStateAt = 0;
    if (options?.closeRoom) this.#sync.closeRoom();
    else this.#sync.disconnect();
    this.role.set(null);
    this.roomCode.set('');
    this.nickname.set('');
    this.remoteState.set(null);
    this.clockOffset.set(0);
    this.#lastStateSignature = '';
    this.#roomCreatedAt = 0;
    this.#helloSent = false;
    this.#pendingHost = null;
    this.privacyVisible.set(false);
    this.pendingConnectSpotify.set(false);
    this.connection.set('idle');
    this.#engine.reset();
    // `leave()` conserva la copia local: permite recuperar la sala tras recargar.
    // Solo `closeRoom()` / el TTL la borran. El audio y los avisos se limpian.
    this.#hostAudio.reset();
    void this.#loadRecoverableRoom();
  }

  answer(optionId: string): void {
    if (this.role() === 'host') {
      const id = this.localPlayerId();
      if (id) this.#engine.recordAnswer(id, optionId);
    } else if (this.role() === 'player') {
      // Si el canal cae justo al responder, reenviamos la misma respuesta al
      // reconectar mientras siga viva la ronda (el host es quien mide el tiempo).
      const roundIndex = this.remoteState()?.roundIndex ?? -1;
      this.#lastAnswer = { optionId, roundIndex };
      this.#sync.publish('ANSWER', { optionId, answeredAtMs: 0 });
    }
  }

  #replayAnswer(state: RoomState): void {
    const answer = this.#lastAnswer;
    if (!answer || state.phase !== 'FLIP_6S') return;
    if (state.roundIndex !== answer.roundIndex) return;
    if (this.#replayedAnswerRound === state.roundIndex) return;
    this.#replayedAnswerRound = state.roundIndex;
    this.#sync.publish('ANSWER', { optionId: answer.optionId, answeredAtMs: 0 });
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
    this.leave({ keepGuestSession: true, silent: true });
    this.#stopPresence();
    this.#subs.forEach((sub) => sub.unsubscribe());
    this.#subs = [];
    this.#removeUnloadListeners();
  }

  #commitHost(manual: boolean): void {
    const setup = this.#pendingHost;
    this.privacyVisible.set(false);
    this.notice.set('');
    this.pendingConnectSpotify.set(false);
    // El host puede volver a abrir el aviso desde el tablero: sin setup pendiente,
    // sus botones solo lo cierran (no reinician la sala).
    if (!setup) return;
    this.role.set('host');
    this.remoteState.set(null);
    this.clockOffset.set(0);
    this.#guestStore.clear();
    this.recoverableGuestRoom.set(null);
    const code = this.#engine.createRoom(
      setup.mode,
      setup.includeSelf,
      setup.botNames,
      manual || setup.manual,
      setup.tracks,
      setup.nickname
    );
    this.roomCode.set(code);
    this.#pendingHost = null;
    this.#roomCreatedAt = Date.now();
    this.#lastStateSignature = '';
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
      const now = Date.now();
      if (this.role() === 'player') {
        this.#sendHello(true);
        // Un DataChannel puede estar "open" sin entregar datos. Si el host
        // calló más de 8 s, intentamos reconectar en vez de esperar forever.
        if (
          this.connection() === 'connected' &&
          this.#lastStateAt > 0 &&
          now - this.#lastStateAt > 8000
        ) {
          this.retryConnection();
        }
        return;
      }
      const ttl = environment.roomTtlMs > 0 ? environment.roomTtlMs : 30 * 60 * 1000;
      if (
        this.role() === 'host' &&
        this.#sync.kind === 'peer' &&
        this.#roomCreatedAt > 0 &&
        now - this.#roomCreatedAt >= ttl
      ) {
        this.notice.set('La sala se cerró automáticamente a los 30 minutos.');
        const expired = this.roomCode();
        this.leave();
        void this.#store.clear(expired);
        return;
      }
      if (this.role() !== 'host' || this.#sync.presence$) return;
      // Los celulares estrangulan los timers en segundo plano: 12 s expulsaba
      // a jugadores que seguían ahí. Ahora solo los marcamos ausentes y un
      // HELLO posterior los recupera con su marcador intacto.
      for (const [id, seen] of this.#lastSeen) {
        if (now - seen > 45_000) {
          this.#lastSeen.delete(id);
          this.#engine.markPlayerDisconnected(id);
        }
      }
    }, 4000);
  }

  /** Con presencia real, la lista de conectados manda: se fue = se eliminó. */
  #syncRoster(ids: readonly string[]): void {
    if (this.role() !== 'host') return;
    const connected = new Set(ids);
    for (const id of [...this.#lastSeen.keys()]) {
      if (!connected.has(id)) {
        this.#lastSeen.delete(id);
        this.#engine.removePlayer(id);
      }
    }
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
    if (this.#unloadHandler) {
      window.removeEventListener('pagehide', this.#unloadHandler);
      window.removeEventListener('beforeunload', this.#unloadHandler);
      this.#unloadHandler = null;
    }
    window.removeEventListener('pageshow', this.#pageshowHandler);
    document.removeEventListener('visibilitychange', this.#visibilityHandler);
    window.removeEventListener('online', this.#onlineHandler);
  }
}
