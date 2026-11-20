import { Injectable } from '@angular/core';
import { DataConnection, Peer } from 'peerjs';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConnectionStatus, Role } from '../models/game.models';
import { AnySyncMessage, RoomSyncProvider } from './room-sync.provider';

/**
 * Transporte peer-to-peer con el anfitrión como hub de su sala.
 *
 * El browser del host no puede ser un servidor TCP, pero sí un par WebRTC:
 * los invitados abren un DataChannel directo hacia él. PeerJS solo aporta el
 * signaling (y TURN si el NAT lo exige): el estado de la partida nunca se
 * guarda ni pasa por un servidor de la app.
 */
@Injectable()
export class PeerHubSyncProvider implements RoomSyncProvider {
  readonly kind = 'peer' as const;

  readonly #status$ = new BehaviorSubject<ConnectionStatus>('idle');
  readonly #connectionCount$ = new BehaviorSubject<number>(0);
  readonly #messages$ = new Subject<AnySyncMessage>();
  readonly status: Observable<ConnectionStatus> = this.#status$.asObservable();
  readonly connectionCount$: Observable<number> = this.#connectionCount$.asObservable();
  readonly messages$: Observable<AnySyncMessage> = this.#messages$.asObservable();

  #peer: Peer | null = null;
  #connections: DataConnection[] = [];
  #openConnections = new Set<DataConnection>();
  #role: Role = 'player';
  #roomId = '';
  #retryId: ReturnType<typeof setTimeout> | null = null;
  #retries = 0;

  connect(roomCode: string, role: Role, _clientId: string): void {
    this.disconnect();
    this.#role = role;
    this.#retries = 0;
    this.#roomId = `vinil06-${roomCode.toUpperCase()}`;

    // El host toma un ID fijo derivado del código; los jugadores reciben uno
    // aleatorio del broker y se conectan a ese ID. El TURN solo relaya paquetes
    // cuando Wi-Fi y datos móviles no pueden hablar directo.
    const options = { config: { iceServers: environment.peer.iceServers } };
    const peer = role === 'host' ? new Peer(this.#roomId, options) : new Peer(options);
    this.#peer = peer;

    peer.on('open', () => {
      if (this.#role === 'host') {
        this.#status$.next('connected');
      } else {
        this.#openGuestConnection();
      }
    });

    peer.on('connection', (connection) => this.#register(connection));

    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });

    peer.on('error', () => {
      this.#status$.next('unavailable');
      // El host puede no haber abierto la sala todavía (modal, OAuth, etc.).
      // Seguimos buscándolo mientras la pestaña siga en la partida.
      if (this.#role === 'player') this.#scheduleRetry();
    });
  }

  publish(message: AnySyncMessage): void {
    const payload = JSON.stringify(message);
    for (const connection of [...this.#connections]) {
      if (!connection.open) continue;
      try {
        connection.send(payload);
      } catch {
        // Un canal caído no puede frenar el motor del juego.
      }
    }
  }

  disconnect(): void {
    if (this.#retryId !== null) {
      clearTimeout(this.#retryId);
      this.#retryId = null;
    }
    for (const connection of this.#connections) connection.close();
    this.#connections = [];
    this.#openConnections.clear();
    this.#connectionCount$.next(0);
    if (this.#peer && !this.#peer.destroyed) this.#peer.destroy();
    this.#peer = null;
    this.#status$.next('idle');
  }

  #openGuestConnection(): void {
    const peer = this.#peer;
    if (!peer || peer.destroyed) return;
    this.#register(peer.connect(this.#roomId, { serialization: 'json' }));
  }

  #register(connection: DataConnection): void {
    this.#connections.push(connection);

    connection.on('open', () => {
      this.#retries = 0;
      this.#openConnections.add(connection);
      this.#connectionCount$.next(this.#openConnections.size);
      this.#status$.next('connected');
    });

    connection.on('data', (raw) => {
      const message = parseEnvelope(raw);
      if (message) this.#messages$.next(message);
    });

    connection.on('error', () => this.#onConnectionLost(connection));
    connection.on('close', () => this.#onConnectionLost(connection));
  }

  #onConnectionLost(connection?: DataConnection): void {
    if (connection) this.#openConnections.delete(connection);
    this.#connectionCount$.next(this.#openConnections.size);
    this.#connections = connection
      ? this.#connections.filter((item) => item !== connection)
      : this.#connections.filter((item) => item.open);
    if (this.#role !== 'player') return;

    this.#status$.next('unavailable');
    this.#scheduleRetry();
  }

  /** Reintento con backoff suave, sin límite mientras la sala siga abierta. */
  #scheduleRetry(): void {
    if (this.#retryId !== null) return;
    const delay = Math.min(1500 * (this.#retries + 1), 5000);
    this.#retries++;
    this.#retryId = setTimeout(() => {
      this.#retryId = null;
      this.#openGuestConnection();
    }, delay);
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
    typeof candidate.clientId !== 'string'
  ) {
    return null;
  }
  return value as AnySyncMessage;
}
