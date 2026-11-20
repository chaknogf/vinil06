# Sala sin base de datos: host como servidor + IndexedDB

Este es el modo por defecto. **No hay Firebase, Redis, Supabase ni servidor propio.**
El dispositivo que crea la sala corre el motor, guarda el estado y lo distribuye.

## Cómo funciona

1. El host elige opciones y pulsa «Crear sala». `GameEngineService` corre en su pestaña.
2. `PeerHubSyncProvider` toma un ID fijo derivado del código (`vinil06-XXXXXX`) y los
   invitados se conectan directamente por WebRTC DataChannel.
3. El host publica `STATE` **solo cuando cambia algo real** (fase, jugadores, puntos).
   El latido del reloj va como `PING` con `{ hostNow }`, ~150 B en vez de varios KB.
4. En cada `STATE`, `HostRoomStore` guarda `backup()` del motor en **IndexedDB del host**:
   estado visible, pack de la ronda, pistas ya usadas y respuestas recibidas.
5. Si el host recarga, `#restoreHostFromDevice()` lee el último registro (si no venció
   los 30 min), llama a `engine.restore()` y vuelve a abrir el mismo peer ID. Los
   invitados se reconectan solos; el marcador y la ronda siguen donde estaban.
6. «Salir → Cerrar sala» borra el registro local. El TTL de 30 min también lo limpia.

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

## Límites reales (no se pueden evitar en un browser)

- **El host no puede estar apagado ni en segundo plano.** Al bloquear la pantalla,
  iOS/Android suspend la pestaña y el cronómetro se congela hasta que vuelvas. No es
  exclusivo de este modo: Firebase tampoco mueve el motor si el host duerme.
- **Sin migración de host en v1.** Si el anfitrión se va del todo, la sala termina.
- **IndexedDB puede ser expulsada** por el sistema si hace falta espacio. Si eso pasa,
  la partida sigue en RAM mientras la pestaña esté abierta.
- **PeerJS usa signaling público** para que los pares se encuentren. Es un servicio
  externo, pero no guarda ningún dato de la partida. Para «cero servicios» habría que
  auto-hostear signaling + TURN en un VPS.
- El TURN público es compartido y no tiene SLA: en horas pico puede tardar un poco más
  en establecerse el canal.

## Archivos tocados

- `src/environments/environment*.ts`: `syncProvider: 'peer'` + `peer.iceServers`.
- `src/app/core/sync/peer-hub-sync.provider.ts`: pasa `iceServers` a `new Peer(...)`.
- `src/app/core/sync/host-room-store.service.ts`: store IndexedDB con TTL de 30 min.
- `src/app/core/services/game-engine.service.ts`: `backup()` y `restore()` **aditivos**.
- `src/app/core/services/game-session.service.ts`: guarda al publicar `STATE`, recupera
  al arrancar, cierra y limpia a los 30 min.
- `src/app/core/sync/room-sync.provider.ts`: `PING` lleva `{ hostNow }`.

Firebase sigue en el código como respaldo: para activarlo hace falta cambiar
`syncProvider` a `'firebase'` **y** pegar la config web. Ver `FIREBASE_SETUP.md`.

## Verificación

1. `pnpm exec tsc -p tsconfig.app.json --noEmit`
2. `pnpm exec ng build`
3. `pnpm test --watch=false`
4. Crear sala en un celular por Wi-Fi, entrar desde otro con datos móviles.
5. Recargar la pestaña del host: deben volver la sala, el marcador y la ronda en curso.
6. Pulsar «Salir → Cerrar sala» y recargar: no debe reaparecer la sala.
7. Esperar 30 min (o bajar `roomTtlMs` en dev) y confirmar que la sala se limpia.
