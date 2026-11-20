import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HostRoomBackup } from '../services/game-engine.service';

const DB_NAME = 'vinil06-host';
const DB_VERSION = 1;
const ROOMS = 'rooms';
const META = 'meta';

export interface HostRoomRecord {
  readonly code: string;
  readonly createdAt: number;
  readonly savedAt: number;
  readonly backup: HostRoomBackup;
}

/**
 * Persistencia local del host: la sala vive en el dispositivo que la creó,
 * nunca en un servidor. IndexedDB sobrevive al reload de la pestaña; si el
 * navegador no la soporta, la sala sigue funcionando solo en RAM.
 */
@Injectable({ providedIn: 'root' })
export class HostRoomStore {
  #dbPromise: Promise<IDBDatabase | null> | null = null;

  async save(code: string, backup: HostRoomBackup): Promise<void> {
    const db = await this.#open();
    if (!db) return;
    const previous = await this.#get<HostRoomRecord>(db, ROOMS, code);
    const record: HostRoomRecord = {
      code,
      createdAt: previous?.createdAt ?? Date.now(),
      savedAt: Date.now(),
      backup
    };
    await this.#write(db, ROOMS, record);
    await this.#write(db, META, { key: 'lastCode', value: code });
  }

  /** Devuelve la última sala del host solo si aún no venció el TTL de 30 min. */
  async loadLast(): Promise<HostRoomRecord | null> {
    const db = await this.#open();
    if (!db) return null;
    const meta = await this.#get<{ key: string; value: string }>(db, META, 'lastCode');
    if (!meta?.value) return null;
    return this.#loadValid(db, meta.value);
  }

  async load(code: string): Promise<HostRoomRecord | null> {
    const db = await this.#open();
    if (!db) return null;
    return this.#loadValid(db, code.toUpperCase());
  }

  async clear(code: string): Promise<void> {
    const db = await this.#open();
    if (!db) return;
    const normalized = code.toUpperCase();
    await this.#remove(db, ROOMS, normalized);
    const meta = await this.#get<{ key: string; value: string }>(db, META, 'lastCode');
    if (meta?.value === normalized) await this.#remove(db, META, 'lastCode');
  }

  async #loadValid(db: IDBDatabase, code: string): Promise<HostRoomRecord | null> {
    const record = await this.#get<HostRoomRecord>(db, ROOMS, code);
    if (!record) return null;
    const ttl = environment.roomTtlMs > 0 ? environment.roomTtlMs : 30 * 60 * 1000;
    if (Date.now() - record.createdAt >= ttl) {
      await this.clear(code);
      return null;
    }
    return record;
  }

  #open(): Promise<IDBDatabase | null> {
    if (this.#dbPromise) return this.#dbPromise;
    this.#dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ROOMS)) db.createObjectStore(ROOMS, { keyPath: 'code' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return this.#dbPromise;
  }

  #get<T>(db: IDBDatabase, store: string, key: string): Promise<T | null> {
    return new Promise((resolve) => {
      const request = db.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => resolve(null);
    });
  }

  #write(db: IDBDatabase, store: string, value: unknown): Promise<void> {
    return new Promise((resolve) => {
      const request = db.transaction(store, 'readwrite').objectStore(store).put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }

  #remove(db: IDBDatabase, store: string, key: string): Promise<void> {
    return new Promise((resolve) => {
      const request = db.transaction(store, 'readwrite').objectStore(store).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }
}
