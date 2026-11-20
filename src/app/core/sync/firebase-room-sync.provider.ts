import { Injectable } from '@angular/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  Database,
  DatabaseReference,
  get,
  getDatabase,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
  Unsubscribe,
  update
} from 'firebase/database';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConnectionStatus, Role, RoomState } from '../models/game.models';
import { AnySyncMessage, RoomSyncProvider } from './room-sync.provider';

interface RoomRecord {
  readonly code?: string;
  readonly hostId?: string;
  readonly expiresAt?: number;
  readonly state?: RoomState;
  readonly stateUpdatedAt?: number;
  readonly presence?: Record<string, unknown>;
}

/**
 * Transporte con Firebase Realtime Database: reemplaza al host-hub WebRTC por
 * un relay administrado que también persiste la sala.
 *
 * - Funciona por WebSocket sobre HTTPS: no hay NAT, TURN ni signaling propio,
 *   así que Wi-Fi y datos móviles van por el mismo camino.
 * - El SDK reconecta solo; cuando un celular muere, `onDisconnect` borra su
 *   nodo de presencia sin expulsar por timeout ni perder el puntaje.
 * - El host sigue siendo autoritativo: publica `state` en la sala y el resto
 *   de los mensajes van en una lista de eventos efímeros.
 * - La sala se cierra con el botón del host o a los 30 min de creada.
 */
@Injectable()
export class FirebaseRoomSyncProvider implements RoomSyncProvider {
  readonly kind = 'firebase' as const;

  readonly #status$ = new BehaviorSubject<ConnectionStatus>('idle');
  readonly #connectionCount$ = new BehaviorSubject<number>(0);
  readonly #presence$ = new BehaviorSubject<readonly string[]>([]);
  readonly #messages$ = new Subject<AnySyncMessage>();
  readonly status: Observable<ConnectionStatus> = this.#status$.asObservable();
  readonly connectionCount$: Observable<number> = this.#connectionCount$.asObservable();
  readonly presence$: Observable<readonly string[]> = this.#presence$.asObservable();
  readonly messages$: Observable<AnySyncMessage> = this.#messages$.asObservable();

  #db: Database | null = null;
  #roomRef: DatabaseReference | null = null;
  #eventsRef: DatabaseReference | null = null;
  #presenceRef: DatabaseReference | null = null;
  #roomUnsub: Unsubscribe | null = null;
  #eventsUnsub: Unsubscribe | null = null;
  #ttlTimer: ReturnType<typeof setTimeout> | null = null;
  #seenEvents = new Set<string>();
  #lastStateAt = 0;
  #role: Role = 'player';
  #clientId = '';
  #roomCode = '';

  connect(roomCode: string, role: Role, clientId: string): void {
    this.disconnect();
    this.#role = role;
    this.#clientId = clientId;
    this.#roomCode = roomCode.toUpperCase();
    this.#seenEvents.clear();
    this.#lastStateAt = 0;

    try {
      this.#db = database();
    } catch {
      this.#status$.next('unavailable');
      return;
    }

    const db = this.#db;
    const code = this.#roomCode;
    const roomRef = ref(db, `rooms/${code}`);
    // Los eventos van en un nodo hermano: si estuvieran dentro de `rooms/{code}`,
    // onValue descargaría TODO el historial en cada snapshot del host.
    const eventsRef = ref(db, `roomEvents/${code}`);
    const presenceRef = ref(db, `rooms/${code}/presence/${clientId}`);
    this.#roomRef = roomRef;
    this.#eventsRef = eventsRef;
    this.#presenceRef = presenceRef;

    // El host crea la sala solo si no existe: reconectar no debe borrar el estado.
    if (role === 'host') {
      void runTransaction(roomRef, (current) =>
        current ?? { code, hostId: clientId, createdAt: Date.now(), expiresAt: Date.now() + ttlMs() }
      ).catch(() => this.#status$.next('unavailable'));
    }

    void set(presenceRef, { role, since: Date.now() }).catch(() => this.#status$.next('unavailable'));
    void onDisconnect(presenceRef).remove().catch(() => undefined);

    this.#roomUnsub = onValue(
      roomRef,
      (snapshot) => {
        this.#status$.next('connected');
        if (!snapshot.exists()) {
          this.#presence$.next([]);
          this.#connectionCount$.next(0);
          return;
        }
        const room = snapshot.val() as RoomRecord;
        const ids = room.presence && typeof room.presence === 'object'
          ? Object.keys(room.presence)
          : [];
        this.#presence$.next(ids);
        this.#connectionCount$.next(Math.max(0, ids.length - 1));

        if (room.state && room.stateUpdatedAt && room.stateUpdatedAt !== this.#lastStateAt) {
          this.#lastStateAt = room.stateUpdatedAt;
          if (this.#role !== 'host') {
            this.#messages$.next({
              kind: 'STATE',
              roomCode: room.code ?? code,
              clientId: room.hostId ?? '',
              role: 'host',
              sentAt: room.stateUpdatedAt,
              seq: 0,
              payload: room.state
            } as AnySyncMessage);
          }
        }

        if (typeof room.expiresAt === 'number') {
          this.#scheduleExpiry(room.expiresAt);
          if (Date.now() >= room.expiresAt) this.#removeRoom();
        }
      },
      () => this.#status$.next('unavailable')
    );

    // Descarta los eventos viejos para no repetir respuestas al reconectar.
    void get(eventsRef)
      .then((snapshot) => {
        snapshot.forEach((child) => {
          if (child.key) this.#seenEvents.add(child.key);
        });
        if (this.#eventsRef !== eventsRef) return;
        this.#eventsUnsub = onChildAdded(
          eventsRef,
          (child) => {
            const key = child.key;
            if (!key || this.#seenEvents.has(key)) return;
            this.#seenEvents.add(key);
            const message = parseEnvelope(child.val());
            if (message) this.#messages$.next(message);
          },
          () => this.#status$.next('unavailable')
        );
      })
      .catch(() => this.#status$.next('unavailable'));
  }

  publish(message: AnySyncMessage): void {
    const db = this.#db;
    const eventsRef = this.#eventsRef;
    if (!db || !eventsRef) return;

    if (message.kind === 'STATE' && this.#role === 'host' && this.#roomRef) {
      void update(this.#roomRef, {
        state: message.payload,
        stateUpdatedAt: message.sentAt
      }).catch(() => undefined);
      return;
    }

    void push(eventsRef, message as unknown as Record<string, unknown>).catch(() => undefined);
  }

  closeRoom(): void {
    this.#removeRoom();
  }

  disconnect(): void {
    this.#roomUnsub?.();
    this.#eventsUnsub?.();
    this.#roomUnsub = null;
    this.#eventsUnsub = null;
    if (this.#ttlTimer !== null) {
      clearTimeout(this.#ttlTimer);
      this.#ttlTimer = null;
    }
    if (this.#presenceRef) {
      void onDisconnect(this.#presenceRef).cancel().catch(() => undefined);
      void remove(this.#presenceRef).catch(() => undefined);
    }
    this.#db = null;
    this.#roomRef = null;
    this.#eventsRef = null;
    this.#presenceRef = null;
    this.#presence$.next([]);
    this.#connectionCount$.next(0);
    this.#status$.next('idle');
  }

  #scheduleExpiry(expiresAt: number): void {
    if (this.#ttlTimer !== null) return;
    const delay = Math.max(0, expiresAt - Date.now());
    this.#ttlTimer = setTimeout(() => {
      this.#ttlTimer = null;
      this.#removeRoom();
    }, delay);
  }

  /** Borra el estado y el historial de eventos de la sala. */
  #removeRoom(): void {
    if (this.#roomRef) void remove(this.#roomRef).catch(() => undefined);
    if (this.#eventsRef) void remove(this.#eventsRef).catch(() => undefined);
  }
}

function ttlMs(): number {
  return environment.roomTtlMs > 0 ? environment.roomTtlMs : 30 * 60 * 1000;
}

/** Inicialización diferida: con la config vacía no se crea ninguna app Firebase. */
function database(): Database {
  const config = environment.firebase;
  if (!config.databaseURL.trim()) throw new Error('Firebase no configurado');
  const app = getApps().length ? getApp() : initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    databaseURL: config.databaseURL,
    projectId: config.projectId,
    appId: config.appId
  });
  return getDatabase(app);
}

function parseEnvelope(raw: unknown): AnySyncMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<AnySyncMessage>;
  if (
    typeof candidate.kind !== 'string' ||
    typeof candidate.roomCode !== 'string' ||
    typeof candidate.clientId !== 'string'
  ) {
    return null;
  }
  return raw as AnySyncMessage;
}
