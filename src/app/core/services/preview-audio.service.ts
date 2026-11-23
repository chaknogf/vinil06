import { Injectable, signal } from '@angular/core';

/** WAV silencioso de 20 ms: desbloquea el autoplay tras un gesto del usuario. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRmQBAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

interface PendingStart {
  readonly resolve: (started: boolean) => void;
  readonly onPlaying: () => void;
  readonly onError: () => void;
}

/**
 * Reproduce el preview de iTunes (~30 s) en el altavoz del host.
 * No necesita cuenta, OAuth ni permisos de Spotify: funciona con cualquier plan.
 */
@Injectable({ providedIn: 'root' })
export class PreviewAudioService {
  readonly playing = signal(false);
  readonly blocked = signal(false);

  #element: HTMLAudioElement | null = null;
  #url = '';
  #startAt = 0;
  /** `src` exacto que debe confirmar el evento `playing` (cambia en cada reintento). */
  #expectedSrc = '';
  #unlocked = false;
  #unlocking = false;
  #pending: PendingStart | null = null;
  #forceNewRequest = false;

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

  /** Reproduce desde el segundo indicado. Resuelve true cuando `play()` arranca. */
  async play(url: string, startAtSeconds = 0): Promise<boolean> {
    if (!url) {
      this.stop();
      return false;
    }
    this.#url = url;
    this.#startAt = startAtSeconds;
    this.#prepare(url);
    return this.#startPlayback(false);
  }

  /**
   * Reproduce y resuelve SOLO cuando el audio empieza a sonar: el evento
   * `playing` se dispara cuando el navegador ya tiene buffer suficiente. No hay
   * timeout: la sala espera a la pista. Si falla, `blocked()` se enciende y el
   * host puede pulsar «Reintentar», que hace una petición NUEVA sin perder la
   * sala ni a los jugadores. `cancelWait()` cierra la espera si la ronda cambia.
   */
  playWhenReady(url: string, startAtSeconds = 0): Promise<boolean> {
    if (!url) return Promise.resolve(false);
    // Guardamos la petición: `retry()` debe poder repetirla con cache-buster.
    this.#url = url;
    this.#startAt = startAtSeconds;
    this.#cancelPending(false);
    const audio = this.#ensure();

    return new Promise<boolean>((resolve) => {
      const onPlaying = (): void => {
        if (audio.src === this.#expectedSrc || audio.getAttribute('src') === this.#expectedSrc) {
          this.#clearPending();
          resolve(true);
        }
      };
      // No resolvemos false: seguimos esperando a que el reintento traiga buffer.
      const onError = (): void => this.blocked.set(true);

      this.#pending = { resolve, onPlaying, onError };
      audio.addEventListener('playing', onPlaying);
      audio.addEventListener('error', onError);
      void this.#startPlayback(false);
    });
  }

  /**
   * Reintento explícito: cambia el `src` con un parámetro único para forzar al
   * navegador a pedir el preview otra vez (no sirve un archivo en caché roto).
   * Los listeners de `playWhenReady()` siguen vivos, así que el mismo `playing`
   * del nuevo intento desbloquea la ronda.
   */
  retry(): void {
    if (!this.#url) return;
    this.blocked.set(false);
    void this.#startPlayback(true);
  }

  /** El motor marca el reintento: el próximo play pedirá el archivo de nuevo. */
  markRetry(): void {
    this.#forceNewRequest = true;
  }

  /** Cierra una espera en curso sin alterar la sala (cambio de ronda, salida…). */
  cancelWait(): void {
    this.#cancelPending(false);
    this.stop();
  }

  /**
   * Descarga el preview antes de que empiece la escucha, sobre el MISMO elemento
   * que luego lo reproduce. El buffer ya está caliente cuando llega el `playing`.
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
    this.#cancelPending(false);
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
      audio.addEventListener('playing', () => {
        this.playing.set(true);
        this.blocked.set(false);
      });
      audio.addEventListener('pause', () => this.playing.set(false));
      audio.addEventListener('ended', () => this.playing.set(false));
      this.#element = audio;
    }
    return this.#element;
  }

  #prepare(url: string): void {
    const audio = this.#ensure();
    this.#expectedSrc = url;
    if (audio.src !== url) audio.src = url;
    audio.volume = 0.9;
    try {
      audio.currentTime = Math.max(0, this.#startAt);
    } catch {
      // Algunos navegadores no permiten seek antes de tener metadata.
    }
  }

  async #startPlayback(newRequest: boolean): Promise<boolean> {
    const audio = this.#ensure();
    const fresh = newRequest || this.#forceNewRequest;
    this.#forceNewRequest = false;
    const src = fresh ? this.#withCacheBuster(this.#url) : this.#url;
    this.#expectedSrc = src;
    if (audio.src !== src) audio.src = src;
    audio.volume = 0.9;
    try {
      audio.currentTime = Math.max(0, this.#startAt);
    } catch {
      // Metadata todavía no disponible.
    }
    try {
      await audio.play();
      this.blocked.set(false);
      return true;
    } catch {
      // Autoplay bloqueado o red caída: seguimos esperando al evento `playing`
      // del reintento. `blocked` ya lo refleja el listener `error`/el catch.
      this.blocked.set(true);
      return false;
    }
  }

  #withCacheBuster(url: string): string {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const parsed = new URL(url, globalThis.location?.href);
      parsed.searchParams.set('_vinil_retry', nonce);
      return parsed.toString();
    } catch {
      return `${url}${url.includes('?') ? '&' : '?'}_vinil_retry=${nonce}`;
    }
  }

  #clearPending(): void {
    const pending = this.#pending;
    if (!pending) return;
    const audio = this.#element;
    audio?.removeEventListener('playing', pending.onPlaying);
    audio?.removeEventListener('error', pending.onError);
    this.#pending = null;
  }

  #cancelPending(started: boolean): void {
    const pending = this.#pending;
    this.#clearPending();
    pending?.resolve(started);
  }
}
