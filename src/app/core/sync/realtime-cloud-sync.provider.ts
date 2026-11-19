import { inject, Injectable, InjectionToken } from '@angular/core';
import { BehaviorSubject, merge, Observable, Subject, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConnectionStatus, Role } from '../models/game.models';
import { AnySyncMessage, RoomSyncProvider } from './room-sync.provider';

/** Transporte pub/sub efímero: solo reenvía mensajes, no guarda nada. */
export interface CloudTransport {
  readonly status: Observable<ConnectionStatus>;
  readonly rawMessages: Observable<string>;
  connect(roomCode: string, clientId: string): void;
  publish(raw: string): void;
  disconnect(): void;
}

/** Superficie mínima y estructural de un cliente Supabase Realtime. */
export interface SupabaseBroadcastChannel {
  on(
    type: 'broadcast',
    filter: { event: string },
    callback: (payload: { payload: unknown }) => void
  ): SupabaseBroadcastChannel;
  subscribe(callback?: (status: string) => void): SupabaseBroadcastChannel;
  send(payload: unknown): Promise<unknown>;
}

export interface SupabaseLikeClient {
  channel(name: string): SupabaseBroadcastChannel;
  removeChannel(channel: SupabaseBroadcastChannel): void;
}

/**
 * Inyecta tu cliente Supabase aquí si usas `transport: 'supabase'`.
 * Por defecto es null y se usa WebSocket.
 */
export const CLOUD_REALTIME_CLIENT = new InjectionToken<SupabaseLikeClient | null>(
  'CLOUD_REALTIME_CLIENT',
  { providedIn: 'root', factory: () => null }
);

/** WebSocket sin persistencia. Protocolo: JSON de SyncEnvelope, el server hace broadcast al resto. */
export class WebSocketCloudTransport implements CloudTransport {
  readonly #status$ = new BehaviorSubject<ConnectionStatus>('idle');
  readonly #raw$ = new Subject<string>();
  readonly status = this.#status$.asObservable();
  readonly rawMessages = this.#raw$.asObservable();

  #socket: WebSocket | null = null;
  #retryId: ReturnType<typeof setTimeout> | null = null;
  #roomCode = '';
  #clientId = '';

  connect(roomCode: string, clientId: string): void {
    this.disconnect();
    this.#roomCode = roomCode;
    this.#clientId = clientId;

    const base = environment.cloud.url.trim().replace(/\/$/, '');
    if (!base || typeof WebSocket === 'undefined') {
      this.#status$.next('unavailable');
      return;
    }

    const url = `${base}/${encodeURIComponent(roomCode)}?client=${encodeURIComponent(clientId)}`;
    const socket = new WebSocket(url);
    this.#socket = socket;

    socket.onopen = () => this.#status$.next('connected');
    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data === 'string') this.#raw$.next(event.data);
    };
    socket.onerror = () => this.#status$.next('unavailable');
    socket.onclose = () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#status$.next('unavailable');
      // Un reintento único: la sala es efímera, no queremos sockets zombi.
      if (this.#retryId === null) {
        this.#retryId = setTimeout(() => {
          this.#retryId = null;
          if (this.#status$.value === 'unavailable') {
            this.connect(this.#roomCode, this.#clientId);
          }
        }, 2500);
      }
    };
  }

  publish(raw: string): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(raw);
    }
  }

  disconnect(): void {
    if (this.#retryId !== null) {
      clearTimeout(this.#retryId);
      this.#retryId = null;
    }
    if (this.#socket) {
      this.#socket.onclose = null;
      this.#socket.onerror = null;
      this.#socket.onmessage = null;
      this.#socket.close();
      this.#socket = null;
    }
    this.#status$.next('idle');
  }
}

/** Adaptador Supabase Realtime Broadcast (mismo contrato, sin persistencia). */
export class SupabaseBroadcastTransport implements CloudTransport {
  readonly #status$ = new BehaviorSubject<ConnectionStatus>('idle');
  readonly #raw$ = new Subject<string>();
  readonly status = this.#status$.asObservable();
  readonly rawMessages = this.#raw$.asObservable();

  #channel: SupabaseBroadcastChannel | null = null;

  constructor(
    private readonly client: SupabaseLikeClient,
    private readonly eventName: string
  ) {}

  connect(roomCode: string, _clientId: string): void {
    this.disconnect();
    const channel = this.client.channel(`vinil06:${roomCode}`);
    channel.on('broadcast', { event: this.eventName }, ({ payload }) => {
      if (typeof payload === 'string') this.#raw$.next(payload);
      else if (payload && typeof payload === 'object') this.#raw$.next(JSON.stringify(payload));
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') this.#status$.next('connected');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.#status$.next('unavailable');
      }
    });
    this.#channel = channel;
  }

  publish(raw: string): void {
    void this.#channel?.send({ payload: raw });
  }

  disconnect(): void {
    if (this.#channel) {
      this.client.removeChannel(this.#channel);
      this.#channel = null;
    }
    this.#status$.next('idle');
  }
}

/** Proveedor de producción: transporte cloud + fallback local automático. */
@Injectable()
export class RealtimeCloudSyncProvider implements RoomSyncProvider {
  readonly kind = 'cloud' as const;

  readonly #status$ = new BehaviorSubject<ConnectionStatus>('idle');
  // El transporte cloud es pub/sub: el conteo fiable sale del heartbeat HELLO.
  readonly #connectionCount$ = new BehaviorSubject<number>(0);
  readonly #transportMessages$ = new Subject<AnySyncMessage>();
  readonly #localMessages$ = new Subject<AnySyncMessage>();
  readonly status = this.#status$.asObservable();
  readonly connectionCount$ = this.#connectionCount$.asObservable();
  readonly messages$ = merge(this.#transportMessages$, this.#localMessages$);

  readonly #transport: CloudTransport;
  #statusSub: Subscription | null = null;
  #rawSub: Subscription | null = null;
  #localChannel: BroadcastChannel | null = null;
  #usingFallback = false;

  constructor() {
    const supabase = inject(CLOUD_REALTIME_CLIENT, { optional: true });
    this.#transport =
      environment.cloud.transport === 'supabase' && supabase
        ? new SupabaseBroadcastTransport(supabase, environment.cloud.broadcastEvent)
        : new WebSocketCloudTransport();
  }

  connect(roomCode: string, role: Role, clientId: string): void {
    this.disconnect();
    this.#statusSub = this.#transport.status.subscribe((status) => {
      if (status === 'unavailable' && environment.cloud.fallbackToLocal) {
        this.#enableLocalFallback(roomCode);
      } else if (!this.#usingFallback) {
        this.#status$.next(status);
      }
    });
    this.#rawSub = this.#transport.rawMessages.subscribe((raw) => {
      const parsed = parseEnvelope(raw);
      if (parsed) this.#transportMessages$.next(parsed);
    });
    this.#transport.connect(roomCode, clientId);
  }

  publish(message: AnySyncMessage): void {
    if (this.#usingFallback && this.#localChannel) {
      this.#localChannel.postMessage(message);
    } else {
      this.#transport.publish(JSON.stringify(message));
    }
  }

  disconnect(): void {
    this.#statusSub?.unsubscribe();
    this.#statusSub = null;
    this.#rawSub?.unsubscribe();
    this.#rawSub = null;
    if (this.#localChannel) {
      this.#localChannel.onmessage = null;
      this.#localChannel.close();
      this.#localChannel = null;
    }
    this.#usingFallback = false;
    this.#transport.disconnect();
    this.#status$.next('idle');
  }

  #enableLocalFallback(roomCode: string): void {
    if (this.#usingFallback || typeof BroadcastChannel === 'undefined') return;
    this.#localChannel = new BroadcastChannel(`vinil06:${roomCode}`);
    this.#localChannel.onmessage = (event: MessageEvent<unknown>) => {
      const parsed = parseEnvelope(event.data);
      if (parsed) this.#localMessages$.next(parsed);
    };
    this.#usingFallback = true;
    this.#status$.next('connected');
  }
}

function parseEnvelope(raw: unknown): AnySyncMessage | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AnySyncMessage>;
  if (
    typeof candidate.kind !== 'string' ||
    typeof candidate.roomCode !== 'string' ||
    typeof (candidate as { clientId?: unknown }).clientId !== 'string'
  ) {
    return null;
  }
  return value as AnySyncMessage;
}
