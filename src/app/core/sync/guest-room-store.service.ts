import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const STORAGE_KEY = 'vinil06.guest-session.v1';

/**
 * Identidad mínima del invitado en ESTE dispositivo: código, apodo y un ID
 * estable. No guarda estado de juego, respuestas ni tokens: el host sigue siendo
 * la autoridad y el snapshot se pide de nuevo al volver.
 *
 * Se usa `localStorage` (no `sessionStorage`) para sobrevivir a cerrar la
 * pestaña, con el mismo TTL de 30 min que la sala del anfitrión.
 */
export interface GuestRoomRecord {
  readonly code: string;
  readonly nickname: string;
  readonly clientId: string;
  readonly savedAt: number;
}

@Injectable({ providedIn: 'root' })
export class GuestRoomStore {
  save(code: string, nickname: string, clientId: string): void {
    try {
      const record: GuestRoomRecord = {
        code: code.toUpperCase(),
        nickname,
        clientId,
        savedAt: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Almacenamiento bloqueado: la partida sigue funcionando solo en memoria.
    }
  }

  load(): GuestRoomRecord | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const record = JSON.parse(raw) as Partial<GuestRoomRecord>;
      if (
        typeof record.code !== 'string' ||
        typeof record.nickname !== 'string' ||
        typeof record.clientId !== 'string' ||
        typeof record.savedAt !== 'number'
      ) {
        this.clear();
        return null;
      }
      const ttl = environment.roomTtlMs > 0 ? environment.roomTtlMs : 30 * 60 * 1000;
      if (Date.now() - record.savedAt >= ttl) {
        this.clear();
        return null;
      }
      return record as GuestRoomRecord;
    } catch {
      this.clear();
      return null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nada que limpiar si el almacenamiento está bloqueado.
    }
  }
}
