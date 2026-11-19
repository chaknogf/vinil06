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

  /** Llamar dentro del tap de "Crear sala" / "Entrar a la sala". */
  unlock(): void {
    const audio = this.#ensure();
    audio.src = SILENT_WAV;
    audio.volume = 0;
    void audio.play()
      .then(() => {
        audio.pause();
        this.blocked.set(false);
      })
      .catch(() => this.blocked.set(true));
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
