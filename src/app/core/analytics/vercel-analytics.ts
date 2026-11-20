/**
 * Vercel Web Analytics para un SPA de Angular.
 *
 * `inject()` por sí solo no conoce el Router: dispara una page view al cargar y
 * deja que el script observe `pushState`. Aquí desactivamos esa detección para
 * enviar la page view desde el Router y poder agrupar `/jugar/<código>` como
 * `/jugar/:code`. También descartamos el callback PKCE de Spotify, cuya URL
 * contiene `code` y `state`.
 */
import {
  inject as injectVercelAnalytics,
  pageview,
  type BeforeSendEvent
} from '@vercel/analytics';
import { environment } from '../../../environments/environment';

const SPOTIFY_CALLBACK = '/spotify/callback';
const ROOM_PATH = /^\/jugar\/[^/]+$/;

/**
 * Devuelve la ruta agrupada y sin query/hash, o `null` si el evento no debe
 * enviarse. Acepta tanto URLs absolutas (`beforeSend`) como relativas (Router).
 */
function analyticsPath(rawUrl: string): string | null {
  try {
    const path = new URL(rawUrl, window.location.origin).pathname.replace(/\/+$/, '') || '/';
    if (path === SPOTIFY_CALLBACK) return null;
    if (path === '/' || path === '/jugar/:code') return path;
    if (ROOM_PATH.test(path)) return '/jugar/:code';
    return null;
  } catch {
    return null;
  }
}

/** Última barrera: nunca mandar código de sala ni parámetros del OAuth. */
export function beforeSendAnalytics(event: BeforeSendEvent): BeforeSendEvent | null {
  const path = analyticsPath(event.url);
  if (!path) return null;
  const origin = new URL(event.url, window.location.origin).origin;
  return { ...event, url: new URL(path, origin).href };
}

/** Llamar una sola vez, antes de `bootstrapApplication`. */
export function initVercelAnalytics(): void {
  injectVercelAnalytics({
    mode: environment.production ? 'production' : 'development',
    framework: 'angular',
    disableAutoTrack: true,
    beforeSend: beforeSendAnalytics
  });
}

/** Llamar en cada `NavigationEnd` del Router (incluida la navegación inicial). */
export function trackRoute(url: string): void {
  const path = analyticsPath(url);
  if (!path) return;
  pageview({ route: path, path });
}
