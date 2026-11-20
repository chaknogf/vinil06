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
  /** Latido 1 Hz: solo la hora del host, para no reenviar el snapshot completo. */
  PING: { hostNow: number };
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
  readonly kind: 'local' | 'cloud' | 'peer' | 'firebase';
  readonly status: Observable<ConnectionStatus>;
  /** Canales abiertos hacia otros dispositivos (lo usa el host para el conteo). */
  readonly connectionCount$: Observable<number>;
  readonly messages$: Observable<AnySyncMessage>;
  /** Proveedores con presencia real (Firebase) informan quién sigue conectado. */
  readonly presence$?: Observable<readonly string[]>;
  connect(roomCode: string, role: Role, clientId: string): void;
  publish(message: AnySyncMessage): void;
  disconnect(): void;
  /** Solo proveedores con persistencia: borra la sala. Los demás no hacen nada. */
  closeRoom?(): void;
}

export const ROOM_SYNC_PROVIDER = new InjectionToken<RoomSyncProvider>('ROOM_SYNC_PROVIDER');
