# Sala sin base de datos remota: host como servidor

Este es el modo por defecto. **No hay Firebase, Redis, Supabase ni servidor de juego propio.**
El dispositivo que crea la sala corre el motor, mantiene el estado en Signals y lo distribuye
por WebRTC. El único guardado local es del propio host: un snapshot en IndexedDB (30 min) y
sus preferencias en localStorage. Nada se sube a un servidor ni se comparte con cuentas.

## Cómo funciona

1. El host elige opciones y pulsa «Crear sala». `GameEngineService` corre en su pestaña.
2. `PeerHubSyncProvider` toma un ID fijo derivado del código (`vinil06-XXXXXX`) y los
   invitados se conectan directamente por WebRTC DataChannel.
3. El host publica `STATE` **solo cuando cambia algo real** (fase, jugadores, puntos).
   El latido del reloj va como `PING` con `{ hostNow }`, ~150 B en vez de varios KB.
4. `HostAudioControllerService` usa el preview de iTunes de la carta correcta: suena en el
   altavoz del host durante `LISTEN_8S` (8–15 s, paso 0,5 s). Spotify Premium es opcional.
   Los invitados **no reproducen audio**: solo ven las cartas y deben estar presentes.
5. Cada cambio de estado se guarda en `HostRoomStore` (IndexedDB `vinil06-host`, TTL 30 min).
6. «Salir» conserva la copia local; «Cerrar sala» y el TTL la borran. Tras recargar, el lobby
   ofrece **«Recuperar sala»** para rehidratar motor, marcador y ronda y reconectar a los jugadores.
7. `HostPreferencesService` recuerda apodo, pack, modo, fuente de audio, duración, bots y
   toggles en `localStorage` (`vinil06.host-prefs.v1`). Nunca guarda estado de juego ni tokens.

## Red: Wi-Fi + datos móviles

`environment.peer.iceServers` trae STUN de Google y TURN público de Open Relay
(`openrelay.metered.ca`) en UDP 80/443 y TCP 443. El TURN **solo relaya paquetes**:
no guarda snapshot, puntos ni tokens. Es lo que permite que un celular en Wi-Fi y otro
en 4G se vean cuando el NAT directo falla.

Si las credenciales públicas dejan de funcionar o querés tu propio relay, reemplazá el
bloque `peer.iceServers` en ambos environments:

```ts
peer: {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: ['turn:TU-SERVIDOR:80', 'turn:TU-SERVIDOR:443?transport=tcp'],
      username: 'TU-USUARIO',
      credential: 'TU-CLAVE'
    }
  ] as RTCIceServer[]
}
```

Con `urls: []` el juego sigue funcionando solo entre dispositivos de la misma red.

## Audio del host (iTunes, sin login)

- Cada pista de la biblioteca trae un `previewUrl` de iTunes verificado: no hay OAuth,
  clave de API ni cuenta de Apple. Card y audio son la misma pista por construcción.
- `HostAudioMode = 'ITUNES' | 'SPOTIFY_PREMIUM'`. Spotify es opcional: si no conecta o
  falla a mitad de ronda, `GameEngineService.#playTrack()` cae al preview de iTunes y avisa.
- `AUDIBLE_CATALOG` filtra las pistas sin preview; los packs remotos sin `previewUrl` se
  descartan en `catalog-sync.service.ts`. Nunca hay silencio por catálogo incompleto.
- Las cartas salen de la biblioteca curada en español (pop/bandas, rancheras, baladas y rock).
  `usedTrackIds` evita repeticiones; si se agota un pack corto se recicla FIFO dentro del
  mismo catálogo.
- Miniaturas `i.ytimg.com/vi/<id>/hqdefault.jpg` solo si el catálogo conoce el ID de vídeo;
  `onError` / offline cae a la portada SVG local (`coverDataUri`). YouTube **no se reproduce**.

## Límites reales (no se pueden evitar en un browser)

- **El host no puede estar apagado ni en segundo plano.** Al bloquear la pantalla,
  iOS/Android suspende la pestaña y el cronómetro se congela hasta que vuelvas.
- **Recuperar la sala no la revierte del todo**: los invitados deben volver a entrar con el
  código porque sus conexiones WebRTC se cerraron al recargar.
- **PeerJS usa signaling público** para que los pares se encuentren. Es un servicio
  externo, pero no guarda ningún dato de la partida. Para «cero servicios» habría que
  auto-hostear signaling + TURN en un VPS.
- El TURN público es compartido y no tiene SLA: en horas pico puede tardar un poco más
  en establecerse el canal.

## Archivos tocados

- `src/environments/environment*.ts`: `syncProvider: 'peer'`, `peer.iceServers` y timings.
- `src/app/core/sync/peer-hub-sync.provider.ts`: pasa `iceServers` a `new Peer(...)`.
- `src/app/core/sync/host-room-store.service.ts`: IndexedDB de la sala del host.
- `src/app/core/services/host-preferences.service.ts`: localStorage del lobby.
- `src/app/core/services/game-engine.service.ts`: motor, `backup()`/`restore()`, audio iTunes.
- `src/app/core/services/game-session.service.ts`: publica `STATE`/`PING`, guarda/recupera,
  cierra y limpia en `leave()`, `closeRoom()` y a los 30 min.
- `src/app/core/services/host-audio-controller.service.ts`: iTunes + Spotify opcional.
- `src/app/core/data/catalog.ts` / `vinil06-catalog.ts`: biblioteca en español con previews.
- `src/app/core/utils/youtube.ts`: solo ID de vídeo para miniaturas (sin reproducción).
- `src/app/core/sync/room-sync.provider.ts`: `PING` lleva `{ hostNow }`.

Firebase sigue en el código como respaldo: para activarlo hace falta cambiar
`syncProvider` a `'firebase'` **y** pegar la config web. Ver `FIREBASE_SETUP.md`.

## Verificación

1. `pnpm exec tsc -p tsconfig.app.json --noEmit`
2. `pnpm exec ng build`
3. `pnpm test --watch=false`
4. Crear sala en un celular por Wi-Fi, entrar desde otro con datos móviles.
5. Recargar la pestaña del host: debe aparecer el banner «Recuperar sala» y reanudar el marcador.
6. Pulsar «Salir → Cerrar sala» y recargar: no debe reaparecer la sala.
7. Esperar 30 min (o bajar `roomTtlMs` en dev) y confirmar que la copia local se borra.
