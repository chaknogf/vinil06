/**
 * Configuración de ejecución. Todo el estado de la partida es volátil:
 * aquí NO hay credenciales, tokens de Spotify ni datos personales.
 */
export const environment = {
  production: false,
  appName: 'Vinil06',

  /**
   * Proveedor de sincronización de sala:
   * - 'peer': WebRTC con el host como hub (modo actual). No hay base de datos ni
   *   servidor propio: el host distribuye el estado, que vive solo en RAM.
   * - 'firebase': Realtime Database (respaldo opcional). Solo se activa si además
   *   hay `firebase.databaseURL` configurado.
   * - 'local': BroadcastChannel + RAM (pestañas del mismo navegador).
   * - 'cloud': pub/sub efímero (WebSocket o Supabase), requiere `cloud.url` o cliente inyectado.
   */
  syncProvider: 'peer' as 'local' | 'cloud' | 'peer' | 'firebase',

  /**
   * STUN + TURN público (Open Relay). El TURN es un relay de red: no guarda
   * ningún dato de la partida. Necesario para mezclar Wi-Fi y datos móviles.
   * Si las credenciales públicas dejan de servir, reemplazalas por las tuyas.
   */
  peer: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ] as RTCIceServer[]
  },

  /** Config web de Firebase. Sin `databaseURL`, el provider Firebase no se activa. */
  firebase: {
    apiKey: '' as string,
    authDomain: '' as string,
    databaseURL: '' as string,
    projectId: '' as string,
    appId: '' as string
  },

  /** Vida máxima de una sala en memoria (30 min). El host también puede cerrarla antes. */
  roomTtlMs: 30 * 60 * 1000,

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
  }

  // iTunes no necesita configuración: cada pista del catálogo trae su preview.
};
