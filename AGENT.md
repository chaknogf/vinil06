# AGENT.md · Mapa de Vinil06

Guía operativa para agentes y personas que trabajen en este repositorio.
**Fuente de verdad:** el brief más reciente del usuario (app PWA, catálogo sincronizable,
modos 12 rondas / Karaoke / Mixto). `modelo.html` es la referencia visual, no código a editar.

## 1. Producto en una frase

Vinil06 es un party game musical **mobile-first**: el anfitrión controla una ruleta y un
tablero; los invitados entran con **código + apodo**, responden en su celular y compiten
en un ranking. **Sin backend propio ni base de datos**: el host autoriza Spotify (PKCE) y
YouTube (Google Identity Services) en su propia pestaña, corre el motor y guarda la sala en
**IndexedDB de su dispositivo**. Los invitados se conectan por WebRTC; un TURN público solo
relaya paquetes entre Wi-Fi y datos móviles, sin persistir nada. La sala se cierra con el botón
del host o a los 30 minutos. Firebase queda como respaldo opcional y desactivado.
Ver `PEER_LOCAL_SETUP.md`, `FIREBASE_SETUP.md` y `GOOGLE_CLOUD_SETUP.md`.

## 2. Stack y arranque

- Angular 22 (Standalone Components, Signals, control flow `@if/@for/@switch`, TS estricto).
- CSS puro con tokens en `src/styles.css`; animaciones `transform`/`opacity` a 60fps.
- PWA con `@angular/service-worker`, `manifest.webmanifest` y `ngsw-config.json`.
- Sin backend propio salvo `api/catalog.ts` (función serverless de Vercel, pública y efímera).
- PeerJS + IndexedDB en el host como transporte por defecto; TURN público para redes mixtas.
- Firebase Realtime Database como transporte opcional de respaldo; inactivo sin config.

**Gestor de paquetes: SOLO pnpm** (npm tiene riesgos de paquetes; no usar `npm`/`npx`).
`package.json` fija `pnpm@12.16.1`, `angular.json` usa `packageManager: "pnpm"` y
`pnpm-workspace.yaml` aprueba los scripts de build permitidos (`allowBuilds`).

```bash
pnpm install              # crea/usa pnpm-lock.yaml
pnpm start                # http://localhost:4200
pnpm run build            # dist/vinil06/browser
pnpm exec ng build        # equivalente directo
pnpm exec tsc -p tsconfig.app.json --noEmit
```

## 3. Mapa de carpetas

```
src/
  environments/
    environment.ts             # proveedor sync ('local' | 'cloud'), timings, flags
    environment.production.ts  # reemplazo en build prod (NO importa environment.ts)
  app/
    app.ts / app.html          # shell: router-outlet + modal + banner + install prompt
    app.config.ts              # elige ROOM_SYNC_PROVIDER según environment + service worker
    app.routes.ts              # '' y 'jugar/:code' -> LobbyComponent
    core/
      models/game.models.ts    # GamePhase, GameMode, RoomState, ShuffledOption, Player, Track, etc.
      data/
        catalog.ts             # TRACK_PACKS (12 packs x 4 = 48 pistas curadas)
        vinil06-catalog.ts      # VINIL06_CATALOG (VinilTrack con cover data:image/svg+xml)
      services/
        game-engine.service.ts # máquina de estados autoritativa del host (+usedTrackIds)
        game-session.service.ts# fachada: role, join, envío de snapshots, limpieza pagehide
        audio.service.ts       # Web Audio: pulso 8s, chimes, urgencia
        haptics.service.ts     # navigator.vibrate opcional
      catalog/
        catalog-sync.service.ts# pack remoto (/api/catalog) con fallback local + signals
      sync/
        room-sync.provider.ts  # interfaz, SyncEnvelope, ROOM_SYNC_PROVIDER
        room-sync.service.ts   # fachada (filtra mensajes propios, publica)
        local-broadcast-sync.provider.ts
        peer-hub-sync.provider.ts        # WebRTC host-hub + STUN/TURN (modo por defecto)
        host-room-store.service.ts       # IndexedDB del host: sala + TTL 30 min
        firebase-room-sync.provider.ts   # Realtime DB: respaldo opcional, inactivo
        realtime-cloud-sync.provider.ts  # WebSocket + adaptador Supabase Broadcast
      utils/random.ts          # Fisher-Yates, códigos, IDs efímeros
    features/
      lobby/                   # crear/unir, selector de pack, modo, bots, tablero manual
      session/                 # switch host <-> player
      host-board/              # control maestro, ruleta, acciones, podio
      player-card/             # PlayerCardComponent (wrapper) + VinylDeckArenaComponent
      karaoke/                 # legacy: KaraokeTurnComponent (reemplazado por la tarjeta nueva)
    shared/components/
      ephemeral-privacy-modal/ # bloqueante, consentimiento del host (acciones exactas)
      vinyl-deck-grid/         # 4 cartas naipe/tocadiscos, rotateY, estados y onError
      round-timer-bar/         # 8.0s / 6.0s con rAF + urgencia en los 2s finales
      leaderboard-panel/       # posiciones en vivo + podio de 12 rondas
      karaoke-roulette-card/   # turno, reto y comodín único por partida
      roulette/                # ruleta género/década/canción/turno
      album-art / podium / install-prompt
      (legacy sin usar: privacy-modal, timer-panel, vinyl-card, leaderboard, karaoke-turn)
  styles.css                   # tokens, glass, cartas 3D, urgencia, reduced-motion
public/                        # manifest, favicon, icons/*.svg + *.png (192/512/maskable)
api/catalog.ts                 # endpoint público con Cache-Control edge (iTunes, sin auth)
ngsw-config.json               # app shell offline
vercel.json                    # rewrites SPA (NO pisar /api/*) + headers PWA
pnpm-workspace.yaml            # allowBuilds (pnpm 11+/12)
AGENT.md                       # este archivo
```

## 4. Flujo de estado (importante)

`LOBBY → SPINNING → LISTEN_8S → FLIP_6S → ROUND_RESULT → (siguiente) … → PODIUM`

- **Karaoke:** `SPINNING → KARAOKE_TURN → ROUND_RESULT`. En `MIXED`, rondas 4, 8 y 12.
- El **host es autoritativo**: `GameEngineService` decide fases, tiempos y puntos.
  Publica `RoomState` completo (heartbeat 1 Hz) vía `RoomSyncService`.
- El **jugador** solo recibe snapshots y calcula el countdown con
  `phaseStartedAt + clockOffset` estimado de `hostNow`.
- El **tiempo de respuesta** se mide al **llegar al host**, no se confía en el reloj del cliente.
- `correctId` viaja **solo en `ROUND_RESULT`** para no filtrar la respuesta.
- Cada dispositivo aplica **Fisher-Yates propio** al entrar en `FLIP_6S`
  (`VinylDeckArenaComponent.options`, enriquecidas con `ShuffledOption`).
- La UI del jugador vive en `VinylDeckArenaComponent` (OnPush + Signals, conectado al
  motor vía `GameSessionService`); compone `RoundTimerBarComponent`,
  `VinylDeckGridComponent` y `KaraokeRouletteCardComponent`.
- Puntos: **+2** primer acierto, **+1** resto de aciertos, **0** fallo/tiempo.
- `usedTrackIds` impide repetir pistas; el catálogo local tiene 48 para 12 rondas.

## 5. Contrato de sincronización

`SyncPayloads`: `HELLO`, `STATE`, `ANSWER`, `WILDCARD`, `KARAOKE_DONE`, `BYE`, `PING`.
`SyncEnvelope = { kind, roomCode, clientId, role, sentAt, seq, payload }`.

- **Peer (por defecto):** WebRTC host-hub con PeerJS + STUN/TURN público. El host guarda
  `backup()` del motor en IndexedDB y `restore()` lo rehidrata al recargar. `STATE` solo
  cambia con eventos reales; el latido 1 Hz viaja como `PING` con `{ hostNow }`. TTL 30 min
  y botón «Cerrar sala» borran el registro local.
- **Firebase (respaldo):** `rooms/{code}/state` guarda el snapshot del host y
  `roomEvents/{code}` los mensajes; `presence/{clientId}` + `onDisconnect` dan presencia real.
  Solo se activa con `syncProvider: 'firebase'` y config web pegada.
- **Local:** `BroadcastChannel('vinil06:<CODE>')`. Bots simulados en el host.
- **Cloud:** `environment.cloud.transport` = `websocket` o `supabase` (inyectar
  `CLOUD_REALTIME_CLIENT`). Si falla, `fallbackToLocal` usa BroadcastChannel.
- Los tokens de Spotify/YouTube nunca se persisten; solo el estado de juego del host va a
  IndexedDB. El SW cachea únicamente el app shell.

## 6. Catálogo y packs

- Pack selector del lobby: `viral`, `clasicos`, `hits`, `latina`, `mix`
  (`CATALOG_PACKS` en `data/vinil06-catalog.ts`). Al crear sala se llama a
  `CatalogSyncService.loadPack(id)` y las pistas se inyectan en el motor:
  `GameSessionService.requestHost({ ..., tracks })` → `GameEngineService.createRoom(..., tracks)`.
- `loadPack(id)` → `GET /api/catalog?pack=id` (iTunes público, sin auth,
  `Cache-Control: s-maxage=43200, stale-while-revalidate`). Timeout 4,5 s y
  fallback instantáneo a `getLocalPack(id)` si falla red/servidor. Todo en Signals/RAM.
- `VINIL06_CATALOG`: 48 pistas con portada `data:image/svg+xml` generada por `svgCover()`.
  Las portadas remotas son URLs reales; si fallan, `AlbumArtComponent` las cambia por su SVG local (`onError`).
- `usedTrackIds` marca las 4 cartas de cada ronda y las canciones de karaoke: una pista
  mostrada nunca vuelve a aparecer en la misma partida.

## 7. PWA

- `manifest.webmanifest`: `display: standalone`, `orientation: portrait-primary`,
  colores `#0b0d14`, iconos 192/512 + maskable (PNG generados desde los SVG con `sips`).
- `provideServiceWorker('ngsw-worker.js', ...)` en `app.config.ts`, activo solo en producción.
- `ngsw-config.json`: app shell + assets; **no** cachear señales de sala ni `/api`.
- `InstallPromptComponent`: escucha `beforeinstallprompt` y muestra un CTA sutil.
- `vercel.json`: `installCommand`/`buildCommand` con pnpm, rewrite SPA con exclusión
  `/api/*` y headers para manifest, `ngsw-worker.js`, `ngsw.json` e `index.html`.

## 8. Convenciones

- Español en UI y comentarios; inglés en identificadores.
- `input()` / `output()` en componentes; `computed()` para derivados; `OnPush` siempre.
- Nada de `localStorage`/`sessionStorage` para estado de juego.
- Estilos: tokens globales; estados de foco y `prefers-reduced-motion` obligatorios.
- Archivos nuevos: seguir la estructura anterior; no mezclar lógica de red en componentes.

## 9. Notas de mantenimiento

- Existen archivos huérfanos de una implementación paralela:
  `src/app/core/game/`, `src/app/core/sync/room-sync.models.ts` y
  `realtime-cloud-sync.provider_.ts`. Están **excluidos** en `tsconfig.app.json`
  para no romper el build; se conservan hasta que el usuario confirme su borrado.
  El fragmento de `VinylDeckArenaComponent` pegado por el usuario importaba de
  `core/game/game-engine.service`; se adaptó al motor activo
  (`core/services/game-engine.service.ts` + `GameSessionService`) sin activar esa rama.
  Tampoco se activan los proveedores signal-based de `room-sync.models.ts`:
  el transporte en uso es el RxJS de `room-sync.provider.ts`.
- Referencia visual: `modelo.html` (no modificar).
