/**
 * Configuración de ejecución. Todo el estado de la partida es volátil:
 * aquí NO hay credenciales, tokens de Spotify ni datos personales.
 */
export const environment = {
  production: false,
  appName: 'Vinil06',

  /**
   * Proveedor de sincronización de sala:
   * - 'peer': WebRTC con el host como hub (PeerJS, sin backend ni cuota de servicios).
   * - 'local': BroadcastChannel + RAM (pestañas del mismo navegador).
   * - 'cloud': pub/sub efímero (WebSocket o Supabase), requiere `cloud.url` o cliente inyectado.
   *
   * 'peer' permite jugar entre celulares sin servidor propio: solo usa el
   * signaling público de PeerJS para que los invitados encuentren al host.
   */
  syncProvider: 'peer' as 'local' | 'cloud' | 'peer',

  cloud: {
    /** Tipo de transporte: 'websocket' o 'supabase'. */
    transport: 'websocket' as 'websocket' | 'supabase',
    /** p.ej. wss://tu-servidor.example.com/vinil06  (sin persistencia). */
    url: '',
    /** Nombre del evento Broadcast usado por Supabase Realtime. */
    broadcastEvent: 'vinil06_sync',
    /** true -> si el transporte falla, se usa automáticamente BroadcastChannel local. */
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
   * Spotify para el host (PKCE público, sin client secret).
   * Client ID de la app Vinil06: todos los anfitriones usan este mismo ID
   * y autorizan con su propia cuenta Premium; el token vive solo en su pestaña.
   * Redirect URIs registradas en el Dashboard de Spotify:
   *   http://127.0.0.1:4200/spotify/callback  (local; main.ts fuerza este origin)
   *   https://vinil06.vercel.app/spotify/callback
   */
  spotify: {
    clientId: 'fba39884cee24a938f7579b33b9cf1aa' as string,
    redirectPath: '/spotify/callback'
  },

  /**
   * YouTube para el host: Google Identity Services (token model) + Data API v3.
   * - clientId: OAuth Client ID web de Google (orígenes autorizados:
   *   http://127.0.0.1:4200 y https://vinil06.vercel.app).
   * - apiKey: clave pública; RESTRINGIR en Google Cloud a:
   *   · API: YouTube Data API v3
   *   · Sitios web: http://127.0.0.1:4200/* y https://vinil06.vercel.app/*
   * - GIS no usa client_secret ni redirect URI propia: el token se entrega al
   *   callback de JS y vive solo en memoria.
   */
  youtube: {
    clientId: '365995761449-0tl4rq1dd3rgi563rlh2g7g0kgsfctr5.apps.googleusercontent.com' as string,
    apiKey: 'AIzaSyCdWDdtylzp2DWIzrI-pBSwmqGAcRmkFYM' as string
  }
};
