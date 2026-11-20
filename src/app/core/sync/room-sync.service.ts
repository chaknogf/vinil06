import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ConnectionStatus, Role } from '../models/game.models';
import {
  AnySyncMessage,
  ROOM_SYNC_PROVIDER as RoomSyncProviderToken,
  SyncEnvelope,
  SyncMessageType,
  SyncPayloads
} from './room-sync.provider';

/**
 * Fachada única de sincronización. Los componentes nunca conocen el transporte.
 */
@Injectable({ providedIn: 'root' })
export class RoomSyncService {
  readonly #provider = inject(RoomSyncProviderToken);
  readonly status: Observable<ConnectionStatus> = this.#provider.status;
  readonly connectionCount$: Observable<number> = this.#provider.connectionCount$;
  readonly presence$: Observable<readonly string[]> | null = this.#provider.presence$ ?? null;
  readonly kind = this.#provider.kind;

  #roomCode = '';
  #clientId = '';
  #role: Role = 'player';
  #seq = 0;

  connect(roomCode: string, role: Role, clientId: string): void {
    this.#roomCode = roomCode.toUpperCase();
    this.#role = role;
    this.#clientId = clientId;
    this.#seq = 0;
    this.#provider.connect(this.#roomCode, role, clientId);
  }

  /** Mensajes de otros dispositivos de ESTA sala (los propios se ignoran). */
  readonly messages$: Observable<AnySyncMessage> = this.#provider.messages$.pipe(
    filter((message) => message.roomCode === this.#roomCode && message.clientId !== this.#clientId)
  );

  publish<K extends SyncMessageType>(kind: K, payload: SyncPayloads[K]): void {
    if (!this.#roomCode) return;
    this.#provider.publish({
      kind,
      payload,
      roomCode: this.#roomCode,
      clientId: this.#clientId,
      role: this.#role,
      sentAt: Date.now(),
      seq: ++this.#seq
    } as AnySyncMessage);
  }

  ofType<K extends SyncMessageType>(kind: K): Observable<SyncEnvelope<K>> {
    return this.messages$.pipe(
      filter((message) => message.kind === kind),
      map((message) => message as SyncEnvelope<K>)
    );
  }

  /** Borra la sala persistida (si el proveedor la tiene) y corta el canal. */
  closeRoom(): void {
    this.#provider.closeRoom?.();
    this.disconnect();
  }

  disconnect(): void {
    this.#provider.disconnect();
    this.#roomCode = '';
    this.#clientId = '';
  }
}
