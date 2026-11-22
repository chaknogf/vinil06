import { Injectable, signal } from '@angular/core';

/** WAV silencioso de 20 ms: desbloquea el autoplay tras un gesto del usuario. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRmQBAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/**
 * Reproduce el preview de iTunes (~30 s) en el dispositivo de cada jugador.
 * No necesita cuenta, OAuth ni permisos de Spotify: funciona con cualquier plan.
 */
@Injectable({ providedIn: 'root' })
export class PreviewAudioService {
  readonly playing = signal(false);
  readonly blocked = signal(false);

  #element: HTMLAudioElement | null = null;
  #url = '';
  #unlocked = false;
  #unlocking = false;

  /** Llamar dentro de un gesto del usuario (tap o tecla). Idempotente. */
  unlock(): void {
    if (this.#unlocked || this.#unlocking) return;
    this.#unlocking = true;
    const audio = this.#ensure();
    audio.src = SILENT_WAV;
    audio.volume = 0;
    void audio.play()
      .then(() => {
        audio.pause();
        this.#unlocked = true;
        this.blocked.set(false);
      })
      .catch(() => this.blocked.set(true))
      .finally(() => { this.#unlocking = false; });
  }

  /** Reproduce desde el segundo indicado para compensar la latencia de red. */
  play(url: string, startAtSeconds = 0): void {
    if (!url) {
      this.stop();
      return;
    }
    this.#url = url;
    const audio = this.#ensure();
    if (audio.src !== url) audio.src = url;
    audio.volume = 0.9;
    try {
      audio.currentTime = Math.max(0, startAtSeconds);
    } catch {
      // Algunos navegadores no permiten seek antes de tener metadata.
    }
    void audio.play()
      .then(() => {
        this.playing.set(true);
        this.blocked.set(false);
      })
      .catch(() => {
        this.playing.set(false);
        this.blocked.set(true);
      });
  }

  /**
   * Descarga el preview antes de que empiece la escucha, sobre el MISMO elemento
   * que luego lo reproduce. `play()` reutiliza el `src`, así que el cronómetro
   * de 8–15 s no se come la latencia de red.
   */
  preload(url: string): void {
    if (!url) return;
    const audio = this.#ensure();
    audio.preload = 'auto';
    if (audio.src !== url) {
      audio.src = url;
      try {
        audio.load();
      } catch {
        // Algunos navegadores no permiten forzar la carga; play() lo intentará.
      }
    }
  }

  /** Cancela la precarga en vuelo (nueva ronda, salida, etc.). */
  cancelPreload(): void {
    const audio = this.#element;
    if (audio && !this.playing()) {
      audio.pause();
      audio.removeAttribute('src');
      try {
        audio.load();
      } catch {
        // Nada que liberar si no había fuente.
      }
    }
    this.#url = '';
  }

  /** Reintento explícito desde el botón "Tocar para escuchar". */
  retry(): void {
    if (this.#url) this.play(this.#url);
  }

  stop(): void {
    const audio = this.#element;
    if (audio) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // Nada que rebobinar si aún no cargó.
      }
    }
    this.playing.set(false);
  }

  #ensure(): HTMLAudioElement {
    if (!this.#element) {
      const audio = new Audio();
      audio.preload = 'auto';
      this.#element = audio;
    }
    return this.#element;
  }
}
