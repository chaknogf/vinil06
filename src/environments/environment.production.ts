/**
 * Build de producción para Vercel (este archivo reemplaza a environment.ts).
 * No importa `environment.ts`: en build de producción ese path se sustituye
 * por este mismo archivo y crearíamos una referencia circular.
 *
 * Por defecto se mantiene el proveedor local para que la SPA sea jugable sin
 * backend. Para partidas entre celulares: `syncProvider: 'cloud'` y configura
 * `cloud.url` (WebSocket) o inyecta un cliente Supabase con CLOUD_REALTIME_CLIENT.
 */
export const environment = {
  production: true,
  appName: 'Vinil06',
  syncProvider: 'local' as 'local' | 'cloud',
  cloud: {
    transport: 'websocket' as 'websocket' | 'supabase',
    url: '',
    broadcastEvent: 'vinil06_sync',
    fallbackToLocal: true
  },
  timings: {
    listenMs: 8000,
    answerMs: 6000,
    spinMs: 2300,
    resultMinMs: 0
  },
  features: {
    audio: true,
    haptics: true
  },

  /**
   * Client ID público de Spotify (PKCE). Todos los hosts usan este ID con su
   * propia cuenta Premium. Registrar en el Dashboard la redirect URI:
   *   https://vinil06.vercel.app/spotify/callback
   */
  spotify: {
    clientId: 'fba39884cee24a938f7579b33b9cf1aa' as string,
    redirectPath: '/spotify/callback'
  }
};
