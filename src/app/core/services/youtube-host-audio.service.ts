import { computed, Injectable, OnDestroy, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

interface GisTokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
  readonly error?: string;
  readonly error_description?: string;
}

interface GisError {
  readonly type?: string;
  readonly message?: string;
}

interface GisTokenClient {
  requestAccessToken(overrides?: { readonly prompt?: 'select_account' | 'consent' }): void;
}

interface GisOauth2 {
  initTokenClient(config: {
    readonly client_id: string;
    readonly scope: string;
    readonly prompt: 'select_account' | 'consent';
    readonly callback: (response: GisTokenResponse) => void;
    readonly error_callback: (error: GisError) => void;
  }): GisTokenClient;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GisOauth2 } };
  }
}

interface SearchResponse {
  readonly items?: readonly {
    readonly id?: { readonly videoId?: string };
    readonly snippet?: {
      readonly title?: string;
      readonly channelTitle?: string;
      readonly thumbnails?: { readonly default?: { readonly url?: string } };
    };
  }[];
}

export type YoutubeHostStatus =
  | 'idle'
  | 'not-configured'
  | 'connecting'
  | 'connected'
  | 'error';

export interface YoutubeVideo {
  readonly id: string;
  readonly title: string;
  readonly channel: string;
  readonly thumbnail: string;
}

/**
 * Login de YouTube para el ANFITRIÓN con Google Identity Services (token model).
 *
 * ¿Por qué no Authorization Code + PKCE como en Spotify? Google exige
 * `client_secret` en el canje cuando el Client ID es de tipo "Aplicación web",
 * incluso enviando `code_verifier`. Meter ese secreto en una SPA sería
 * inseguro, y una Vercel Function solo para el canje sería backend de más.
 * El token model de GIS es el flujo que Google recomienda para apps que corren
 * en el navegador: abre su propia UX, devuelve el access token al callback de
 * JS, no usa redirect URI ni client_secret, y no guarda nada en el navegador.
 *
 * - El token vive SOLO en un campo privado; nunca se persiste.
 * - La sala vive en RAM: el popup de Google no recarga la pestaña principal.
 * - Si falla el login o la API, el modo YouTube sigue aceptando un enlace pegado.
 */
@Injectable({ providedIn: 'root' })
export class YoutubeHostAudioService implements OnDestroy {
  readonly status = signal<YoutubeHostStatus>('idle');
  readonly message = signal('');
  readonly loading = signal(false);
  readonly videos = signal<readonly YoutubeVideo[]>([]);
  readonly connected = computed(() => this.status() === 'connected');

  #accessToken = '';
  #expiresAt = 0;
  #tokenClient: GisTokenClient | null = null;
  #gisPromise: Promise<void> | null = null;

  constructor() {
    if (!this.configured) this.status.set('not-configured');
    // Precargamos GIS al iniciar la app: cuando el host pulse "Conectar", el
    // script ya debe estar listo y el popup se abre sin esperas.
    if (this.configured) void this.#loadGis().catch(() => undefined);
  }

  ngOnDestroy(): void {
    this.#accessToken = '';
    this.#expiresAt = 0;
    this.#tokenClient = null;
  }

  get configured(): boolean {
    return !!this.#clientId();
  }

  /** Dispara la UX de Google desde el gesto del usuario. */
  async connect(): Promise<void> {
    const clientId = this.#clientId();
    if (!clientId) {
      this.#set('not-configured', 'Falta el OAuth Client ID de Google en environment.youtube.clientId.');
      return;
    }

    this.#set('connecting', 'Abriendo Google…');
    try {
      await this.#loadGis();
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) throw new Error('Google Identity Services no está disponible');

      if (!this.#tokenClient) {
        this.#tokenClient = oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          prompt: 'select_account',
          callback: (response) => this.#onToken(response),
          error_callback: (error) => this.#onAuthError(error)
        });
      }
      this.#tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Error desconocido';
      this.#set('error', `No se pudo abrir el login de YouTube: ${detail}. Podés pegar un enlace manualmente.`);
    }
  }

  /** El token nunca toca sessionStorage/localStorage: solo este campo. */
  #onToken(response: GisTokenResponse): void {
    if (response.error || !response.access_token) {
      const detail = response.error_description ?? response.error ?? 'Google no devolvió un token.';
      this.#set(
        'error',
        `No se pudo conectar YouTube: ${detail === 'access_denied' ? 'cancelaste el permiso' : detail}. Podés pegar un enlace manualmente.`
      );
      return;
    }

    this.#accessToken = response.access_token;
    this.#expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000 - 60_000;
    this.#set('connected', 'YouTube conectado.');
    void this.loadVideos();
  }

  #onAuthError(error: GisError): void {
    const detail =
      error.type === 'popup_closed_by_user'
        ? 'Cerraste la ventana de Google antes de autorizar.'
        : error.message ?? error.type ?? 'Error de autenticación';
    this.#set('error', `${detail} Podés intentarlo otra vez o pegar un enlace manualmente.`);
  }

  /** Lista los vídeos subidos por la cuenta autorizada (scope youtube.readonly). */
  async loadVideos(): Promise<void> {
    if (!this.#tokenValid()) {
      this.#set('error', 'La sesión de YouTube venció. Pulsá «Conectar YouTube» otra vez.');
      return;
    }

    this.loading.set(true);
    try {
      const params = new URLSearchParams({
        part: 'snippet',
        forMine: 'true',
        type: 'video',
        order: 'date',
        maxResults: '25'
      });
      const apiKey = this.#apiKey();
      if (apiKey) params.set('key', apiKey);

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
        { headers: { Authorization: `Bearer ${this.#accessToken}` } }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = (await response.json()) as SearchResponse;
      this.videos.set(
        (json.items ?? [])
          .map((item) => ({
            id: item.id?.videoId?.trim() ?? '',
            title: decodeEntities(item.snippet?.title ?? 'Sin título'),
            channel: decodeEntities(item.snippet?.channelTitle ?? ''),
            thumbnail: item.snippet?.thumbnails?.default?.url ?? ''
          }))
          .filter((video) => video.id.length === 11)
      );
      this.#set(
        'connected',
        this.videos().length
          ? ''
          : 'Tu cuenta no tiene vídeos subidos. Podés pegar cualquier enlace de YouTube.'
      );
    } catch {
      this.#set('error', 'No se pudo leer tu lista de vídeos. Podés pegar un enlace manualmente.');
    } finally {
      this.loading.set(false);
    }
  }

  disconnect(): void {
    this.#accessToken = '';
    this.#expiresAt = 0;
    this.videos.set([]);
    this.#set('idle', '');
  }

  #clientId(): string {
    return environment.youtube.clientId?.trim() ?? '';
  }

  #apiKey(): string {
    return environment.youtube.apiKey?.trim() ?? '';
  }

  #tokenValid(): boolean {
    return !!this.#accessToken && Date.now() < this.#expiresAt;
  }

  #set(status: YoutubeHostStatus, message: string): void {
    this.status.set(status);
    this.message.set(message);
  }

  /** Carga el SDK de Google una sola vez, reutilizando la etiqueta si ya existe. */
  #loadGis(): Promise<void> {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (this.#gisPromise) return this.#gisPromise;

    this.#gisPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('No se pudo cargar Google Identity Services')),
          { once: true }
        );
        return;
      }

      const script = document.createElement('script');
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'));
      document.head.appendChild(script);
    });

    return this.#gisPromise;
  }
}

function decodeEntities(value: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}
