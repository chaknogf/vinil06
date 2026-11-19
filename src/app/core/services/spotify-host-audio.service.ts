import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { PublicOption } from '../models/game.models';

export type SpotifyHostStatus =
  | 'idle'
  | 'not-configured'
  | 'connecting'
  | 'connected'
  | 'free'
  | 'no-device'
  | 'error';

interface TokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in: number;
}

interface ProfileResponse {
  readonly product?: string;
  readonly display_name?: string;
}

interface DevicesResponse {
  readonly devices?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly is_active: boolean;
  }>;
}

interface SearchResponse {
  readonly tracks?: { readonly items?: ReadonlyArray<{ readonly uri: string }> };
}

class SpotifyApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Datos mínimos del formulario para reanudar la creación tras el redirect. */
export interface SpotifyCreateIntent {
  readonly mode: 'CARDS_12' | 'KARAOKE' | 'MIXED';
  readonly pack: string;
  readonly nickname: string;
  readonly bots: number;
  readonly includeSelf: boolean;
  readonly manual: boolean;
}

const VERIFIER_KEY = 'vinil06_pkce_verifier';
const STATE_KEY = 'vinil06_pkce_state';
const INTENT_KEY = 'vinil06_pkce_create_intent';

/**
 * Audio de Spotify para el ANFITRIÓN (PKCE público, sin client secret).
 *
 * - Los tokens viven SOLO en campos privados/Signals de esta pestaña; nunca se
 *   escriben en localStorage, IndexedDB ni se envían a nuestro backend.
 * - El par verifier/state se guarda en sessionStorage solo durante el redirect
 *   y se borra en cuanto se canjea el código.
 * - Cualquier fallo (cuenta Free, sin dispositivo, red, API) deja la partida
 *   seguir en modo manual: `play()`/`pause()` nunca lanzan hacia el motor.
 */
@Injectable({ providedIn: 'root' })
export class SpotifyHostAudioService {
  readonly status = signal<SpotifyHostStatus>('idle');
  readonly isPremium = signal(false);
  readonly accountName = signal('');
  readonly deviceName = signal('');
  readonly playing = signal(false);
  readonly message = signal('');
  /** Se enciende al volver del callback PKCE para reanudar la creación de sala. */
  readonly redirectCompleted = signal(false);

  readonly #router = inject(Router);
  readonly #scopes = [
    'streaming',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-email'
  ];

  #accessToken = '';
  #refreshToken = '';
  #expiresAt = 0;
  #deviceId = '';
  #uriCache = new Map<string, string>();

  constructor() {
    this.status.set(this.#clientId() ? 'idle' : 'not-configured');
  }

  get configured(): boolean {
    return !!this.#clientId();
  }

  get redirectUri(): string {
    return `${window.location.origin}${environment.spotify.redirectPath}`;
  }

  /** Paso 1: genera PKCE y lleva al host a Spotify. */
  async connect(): Promise<void> {
    const clientId = this.#clientId();
    if (!clientId) {
      this.#set('not-configured', 'Configurá SPOTIFY_CLIENT_ID para activar la reproducción automática.');
      return;
    }

    try {
      const verifier = this.#randomBase64Url(32);
      const state = this.#randomBase64Url(16);
      sessionStorage.setItem(VERIFIER_KEY, verifier);
      sessionStorage.setItem(STATE_KEY, state);

      const challenge = this.#base64Url(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
      );

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: this.#scopes.join(' '),
        redirect_uri: this.redirectUri,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256'
      });

      this.#set('connecting', 'Conectando con Spotify…');
      window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
    } catch {
      this.#clearPkce();
      this.#set('error', 'No se pudo iniciar la conexión con Spotify. Podés seguir en modo manual.');
    }
  }

  /**
   * Paso 2: se llama desde el shell de la app. Devuelve true solo si esta URL
   * era el callback, para que el router pueda volver al lobby.
   */
  async handleRedirect(): Promise<boolean> {
    if (window.location.pathname !== environment.spotify.redirectPath) return false;

    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const code = params.get('code');
    const state = params.get('state');
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    this.#clearPkce();

    try {
      if (error) throw new Error(error);
      if (!code || !state || !verifier || state !== expectedState) {
        throw new Error('Respuesta de Spotify no válida');
      }

      const token = await this.#exchangeCode(code, verifier);
      this.#saveToken(token);
      await this.#loadProfileAndDevice();
    } catch {
      this.#set('error', 'No se pudo conectar Spotify. La partida continúa en modo manual.');
    } finally {
      // Aunque falle el canje, el lobby debe poder reanudar la sala en manual.
      this.redirectCompleted.set(true);
    }

    await this.#router.navigateByUrl('/');
    return true;
  }

  /**
   * Guarda el formulario del lobby mientras Spotify redirige. Es un dato
   * efímero sin credenciales ni tokens; se borra en cuanto se consume.
   */
  saveCreateIntent(intent: SpotifyCreateIntent): void {
    try {
      sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
    } catch {
      // sessionStorage puede estar bloqueado: el host crea la sala en manual.
    }
  }

  consumeCreateIntent(): SpotifyCreateIntent | null {
    try {
      const raw = sessionStorage.getItem(INTENT_KEY);
      sessionStorage.removeItem(INTENT_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<SpotifyCreateIntent>;
      if (!value || typeof value !== 'object' || !value.mode || !value.pack) return null;
      return {
        mode: value.mode,
        pack: value.pack,
        nickname: typeof value.nickname === 'string' ? value.nickname : '',
        bots: typeof value.bots === 'number' ? value.bots : 0,
        includeSelf: value.includeSelf !== false,
        manual: value.manual === true
      };
    } catch {
      return null;
    }
  }

  clearCreateIntent(): void {
    try {
      sessionStorage.removeItem(INTENT_KEY);
    } catch {
      // Nada que limpiar si el almacenamiento está bloqueado.
    }
  }

  disconnect(): void {
    this.#accessToken = '';
    this.#refreshToken = '';
    this.#expiresAt = 0;
    this.#deviceId = '';
    this.#uriCache.clear();
    this.playing.set(false);
    this.isPremium.set(false);
    this.accountName.set('');
    this.deviceName.set('');
    this.#clearPkce();
    this.#set(this.configured ? 'idle' : 'not-configured', '');
  }

  /** Se llama al entrar en LISTEN_8S. Nunca bloquea el cronómetro. */
  async play(track: PublicOption | null): Promise<boolean> {
    if (!track || this.status() !== 'connected' || !this.#accessToken) return false;

    let uri = track.spotifyUri || this.#uriCache.get(this.#trackKey(track)) || '';
    if (!uri) {
      try {
        uri = await this.#findTrackUri(track);
        if (uri) this.#uriCache.set(this.#trackKey(track), uri);
      } catch (error) {
        this.#handleError(error);
        return false;
      }
    }
    if (!uri) {
      this.message.set(`No encontramos «${track.title}» en Spotify. Reproducila desde tu app.`);
      return false;
    }

    try {
      await this.#api<void>(
        `/v1/me/player/play?device_id=${encodeURIComponent(this.#deviceId)}`,
        { method: 'PUT', body: JSON.stringify({ uris: [uri] }) }
      );
      this.playing.set(true);
      this.message.set('');
      return true;
    } catch (error) {
      this.#handleError(error);
      return false;
    }
  }

  /** Se llama al pasar a FLIP_6S o cerrar la ronda. */
  pause(): void {
    void this.#pauseAsync();
  }

  // ---- Internos -------------------------------------------------------

  async #pauseAsync(): Promise<void> {
    if (!this.#accessToken || this.status() !== 'connected') return;
    try {
      await this.#api<void>('/v1/me/player/pause', { method: 'PUT' });
      this.playing.set(false);
    } catch {
      // El pause es best-effort: el tablero ya cambió de fase igual.
    }
  }

  #set(status: SpotifyHostStatus, message: string): void {
    this.status.set(status);
    this.message.set(message);
    if (status !== 'connected') {
      this.playing.set(false);
      this.#deviceId = '';
    }
  }

  #clientId(): string {
    return environment.spotify.clientId?.trim() ?? '';
  }

  #clearPkce(): void {
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
  }

  #randomBase64Url(bytes: number): string {
    const values = new Uint8Array(bytes);
    crypto.getRandomValues(values);
    return this.#base64Url(values);
  }

  #base64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async #exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.#clientId(),
      code_verifier: verifier
    });
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    if (!response.ok) throw new SpotifyApiError(response.status, await response.text());
    return (await response.json()) as TokenResponse;
  }

  async #refresh(): Promise<boolean> {
    if (!this.#refreshToken) return false;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.#refreshToken,
      client_id: this.#clientId()
    });
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      if (!response.ok) return false;
      const token = (await response.json()) as TokenResponse;
      this.#saveToken({ ...token, refresh_token: token.refresh_token ?? this.#refreshToken });
      return true;
    } catch {
      return false;
    }
  }

  #saveToken(token: TokenResponse): void {
    this.#accessToken = token.access_token;
    this.#refreshToken = token.refresh_token ?? this.#refreshToken;
    this.#expiresAt = Date.now() + Math.max(60, token.expires_in - 60) * 1000;
  }

  async #loadProfileAndDevice(): Promise<void> {
    const profile = await this.#api<ProfileResponse>('/v1/me');
    this.accountName.set(profile.display_name?.trim() || 'Tu cuenta');

    if (profile.product !== 'premium') {
      this.isPremium.set(false);
      this.#set('free', 'Tu cuenta de Spotify es Free. La reproducción automática requiere Premium; podés seguir en manual.');
      return;
    }
    this.isPremium.set(true);

    const devices = await this.#api<DevicesResponse>('/v1/me/player/devices');
    const device = devices.devices?.find((item) => item.is_active) ?? devices.devices?.[0];
    if (!device) {
      this.#set('no-device', 'No hay ningún dispositivo de Spotify activo. Abrí Spotify en tu celular o bocina; mientras tanto el tablero sigue en manual.');
      return;
    }

    this.#deviceId = device.id;
    this.deviceName.set(device.name);
    this.#set('connected', '');
  }

  async #findTrackUri(track: PublicOption): Promise<string> {
    const query = `${track.artist} ${track.title}`;
    const response = await this.#api<SearchResponse>(
      `/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`
    );
    return response.tracks?.items?.[0]?.uri ?? '';
  }

  #trackKey(track: PublicOption): string {
    return `${track.artist}|${track.title}`;
  }

  async #api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    if (Date.now() >= this.#expiresAt && this.#refreshToken) {
      await this.#refresh();
    }

    const response = await fetch(`https://api.spotify.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.#accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {})
      }
    });

    if (response.status === 401 && retry && this.#refreshToken && (await this.#refresh())) {
      return this.#api<T>(path, init, false);
    }
    if (!response.ok) throw new SpotifyApiError(response.status, await response.text());
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  #handleError(error: unknown): void {
    const status = error instanceof SpotifyApiError ? error.status : 0;
    if (status === 404) {
      this.#set('no-device', 'El dispositivo de Spotify dejó de estar disponible. Seguimos en manual.');
    } else if (status === 403) {
      this.#set('error', 'Spotify denegó la reproducción. Revisá tu Premium y los permisos; seguimos en manual.');
    } else {
      this.#set('error', 'No se pudo controlar Spotify. La partida continúa en modo manual.');
    }
  }
}
