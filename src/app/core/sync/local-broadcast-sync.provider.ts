import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ConnectionStatus, Role } from '../models/game.models';
import { AnySyncMessage, RoomSyncProvider } from './room-sync.provider';

/**
 * Sincronización local multi-pestaña: una pestaña Anfitrión y N pestañas Jugador
 * en el mismo navegador, sin backend. BroadcastChannel + RAM, cero persistencia.
 */
@Injectable()
export class LocalBroadcastSyncProvider implements RoomSyncProvider {
  readonly kind = 'local' as const;

  readonly #status$ = new BehaviorSubject<ConnectionStatus>('idle');
  // BroadcastChannel no tiene canales por jugador: el conteo sale del snapshot.
  readonly #connectionCount$ = new BehaviorSubject<number>(0);
  readonly #messages$ = new Subject<AnySyncMessage>();
  readonly status: Observable<ConnectionStatus> = this.#status$.asObservable();
  readonly connectionCount$: Observable<number> = this.#connectionCount$.asObservable();
  readonly messages$: Observable<AnySyncMessage> = this.#messages$.asObservable();

  #channel: BroadcastChannel | null = null;

  connect(roomCode: string, _role: Role, _clientId: string): void {
    this.disconnect();
    if (typeof BroadcastChannel === 'undefined') {
      this.#status$.next('unavailable');
      return;
    }
    this.#channel = new BroadcastChannel(`vinil06:${roomCode}`);
    this.#channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (this.#isEnvelope(message)) {
        this.#messages$.next(message);
      }
    };
    this.#status$.next('connected');
  }

  publish(message: AnySyncMessage): void {
    this.#channel?.postMessage(message);
  }

  disconnect(): void {
    if (this.#channel) {
      this.#channel.onmessage = null;
      this.#channel.close();
      this.#channel = null;
    }
    this.#status$.next('idle');
  }

  #isEnvelope(value: unknown): value is AnySyncMessage {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<AnySyncMessage>;
    return (
      typeof candidate.kind === 'string' &&
      typeof clientIdOf(candidate) === 'string' &&
      typeof candidate.roomCode === 'string'
    );
  }
}

function clientIdOf(value: object): unknown {
  return (value as { clientId?: unknown }).clientId;
}
