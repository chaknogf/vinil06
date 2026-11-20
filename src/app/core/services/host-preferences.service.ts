import { Injectable, signal } from '@angular/core';
import { CatalogPackId, isCatalogPackId } from '../data/vinil06-catalog';
import { GameMode, HostAudioMode } from '../models/game.models';

const KEY = 'vinil06.host-prefs.v1';

/** Ajustes del anfitrión entre partidas. Nunca contienen estado de juego ni tokens. */
export interface HostPreferences {
  readonly nickname: string;
  readonly pack: CatalogPackId;
  readonly mode: GameMode;
  readonly audioMode: HostAudioMode;
  readonly listenDurationSec: number;
  readonly bots: number;
  readonly includeSelf: boolean;
  readonly manual: boolean;
}

const DEFAULTS: HostPreferences = {
  nickname: '',
  pack: 'mix',
  mode: 'CARDS_12',
  audioMode: 'ITUNES',
  listenDurationSec: 8,
  bots: 0,
  includeSelf: true,
  manual: false
};

const GAME_MODES: readonly GameMode[] = ['CARDS_12', 'KARAOKE', 'MIXED'];
const AUDIO_MODES: readonly HostAudioMode[] = ['ITUNES', 'SPOTIFY_PREMIUM'];

/**
 * Preferencias locales guardadas en `localStorage` del dispositivo del host.
 * No es una base de datos de sala: solo recuerda el formulario del lobby para
 * no volver a elegir pack, apodo o fuente de audio en cada partida.
 */
@Injectable({ providedIn: 'root' })
export class HostPreferencesService {
  readonly value = signal<HostPreferences>(this.#read());

  update(patch: Partial<HostPreferences>): void {
    const next: HostPreferences = {
      ...this.value(),
      ...patch,
      nickname: typeof patch.nickname === 'string' ? patch.nickname.slice(0, 18) : this.value().nickname,
      pack: isCatalogPackId(patch.pack ?? '') ? patch.pack! : this.value().pack,
      mode: patch.mode && GAME_MODES.includes(patch.mode) ? patch.mode : this.value().mode,
      audioMode: patch.audioMode && AUDIO_MODES.includes(patch.audioMode)
        ? patch.audioMode
        : this.value().audioMode,
      listenDurationSec:
        typeof patch.listenDurationSec === 'number' && Number.isFinite(patch.listenDurationSec)
          ? Math.min(15, Math.max(8, Math.round(patch.listenDurationSec * 2) / 2))
          : this.value().listenDurationSec,
      bots: typeof patch.bots === 'number' ? Math.min(3, Math.max(0, patch.bots)) : this.value().bots,
      includeSelf: typeof patch.includeSelf === 'boolean' ? patch.includeSelf : this.value().includeSelf,
      manual: typeof patch.manual === 'boolean' ? patch.manual : this.value().manual
    };
    this.value.set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // localStorage bloqueado: las preferencias viven solo en RAM esta sesión.
    }
  }

  #read(): HostPreferences {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULTS;
      const parsed = JSON.parse(raw) as Partial<HostPreferences>;
      return {
        nickname: typeof parsed.nickname === 'string' ? parsed.nickname.slice(0, 18) : DEFAULTS.nickname,
        pack: isCatalogPackId(parsed.pack ?? '') ? parsed.pack! : DEFAULTS.pack,
        mode: parsed.mode && GAME_MODES.includes(parsed.mode) ? parsed.mode : DEFAULTS.mode,
        audioMode: parsed.audioMode && AUDIO_MODES.includes(parsed.audioMode)
          ? parsed.audioMode
          : DEFAULTS.audioMode,
        listenDurationSec:
          typeof parsed.listenDurationSec === 'number' && Number.isFinite(parsed.listenDurationSec)
            ? Math.min(15, Math.max(8, Math.round(parsed.listenDurationSec * 2) / 2))
            : DEFAULTS.listenDurationSec,
        bots: typeof parsed.bots === 'number' ? Math.min(3, Math.max(0, parsed.bots)) : DEFAULTS.bots,
        includeSelf: typeof parsed.includeSelf === 'boolean' ? parsed.includeSelf : DEFAULTS.includeSelf,
        manual: typeof parsed.manual === 'boolean' ? parsed.manual : DEFAULTS.manual
      };
    } catch {
      return DEFAULTS;
    }
  }
}
