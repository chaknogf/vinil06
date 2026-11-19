import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ConnectionStatus, Role, RoomState } from '../models/game.models';

/** Contrato de mensajes efímeros. Nada de esto se persiste. */
export interface SyncPayloads {
  HELLO: { nickname: string };
  STATE: RoomState;
  ANSWER: { optionId: string; answeredAtMs: number };
  WILDCARD: Record<string, never>;
  KARAOKE_DONE: { wildcardUsed: boolean };
  BYE: Record<string, never>;
  PING: Record<string, never>;
}

export type SyncMessageType = keyof SyncPayloads;

export interface SyncEnvelope<K extends SyncMessageType = SyncMessageType> {
  readonly kind: K;
  readonly roomCode: string;
  readonly clientId: string;
  readonly role: Role;
  readonly sentAt: number;
  readonly seq: number;
  readonly payload: SyncPayloads[K];
}

export type AnySyncMessage = { [K in SyncMessageType]: SyncEnvelope<K> }[SyncMessageType];

/**
 * Intercambiables desde environment.ts. El resto de la app solo conoce esta interfaz.
 */
export interface RoomSyncProvider {
  readonly kind: 'local' | 'cloud';
  readonly status: Observable<ConnectionStatus>;
  readonly messages$: Observable<AnySyncMessage>;
  connect(roomCode: string, role: Role, clientId: string): void;
  publish(message: AnySyncMessage): void;
  disconnect(): void;
}

export const ROOM_SYNC_PROVIDER = new InjectionToken<RoomSyncProvider>('ROOM_SYNC_PROVIDER');
