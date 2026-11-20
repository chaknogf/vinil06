/**
 * Build de producción para Vercel (este archivo reemplaza a environment.ts).
 * No importa `environment.ts`: en build de producción ese path se sustituye
 * por este mismo archivo y crearíamos una referencia circular.
 *
 * 'peer' es el transporte preferido: el host es la autoridad y el estado de la
 * sala vive solo en RAM. El TURN público solo relaya paquetes, no persiste
 * datos. Firebase queda como respaldo opcional y desactivado.
 */
export const environment = {
  production: true,
  appName: 'Vinil06',
  syncProvider: 'peer' as 'local' | 'cloud' | 'peer' | 'firebase',
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
  firebase: {
    apiKey: '' as string,
    authDomain: '' as string,
    databaseURL: '' as string,
    projectId: '' as string,
    appId: '' as string
  },
  roomTtlMs: 30 * 60 * 1000,
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

  // iTunes no necesita configuración: cada pista del catálogo trae su preview.
};
