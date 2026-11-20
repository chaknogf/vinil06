# Respaldo opcional: Firebase Realtime Database

**Estado actual: desactivado.** El modo por defecto es Peer + IndexedDB en el host
(ver `PEER_LOCAL_SETUP.md`): no hay base de datos ni servidor propio. Este provider
queda guardado como respaldo en caso de que necesites presencia administrada o
conectividad sin depender de TURN.

Para activarlo hay que cambiar `syncProvider` a `'firebase'` en ambos environments
**y** pegar la config web. Sin `databaseURL`, `app.config.ts` cae a PeerJS.

## Por qué el cambio

Con probistas mezclando Wi-Fi y datos móviles, el modelo anterior (host como hub WebRTC, PeerJS con signaling público y sin TURN) es frágil: el DataChannel directo falla seguido en NAT simétrico/CGNAT. Además, el estado vivía solo en la RAM del host, así que recargar su pestaña tiraba la sala.

Firebase Realtime Database resuelve las tres cosas a la vez:

1. **Transporte**: WebSocket sobre HTTPS. No hay NAT, TURN ni servidor de señalización propio; Wi-Fi y 4G usan el mismo camino y el SDK reconecta solo.
2. **Persistencia**: la sala queda en `/rooms/{code}` y sobrevive al reload del host.
3. **Presencia**: `onDisconnect` quita al jugador que se cae, sin el timeout de 12 s que antes borraba su puntaje.

El host **sigue siendo autoritativo**: publica el `RoomState` en `rooms/{code}/state`; los jugadores publican HELLO/ANSWER/WILDCARD/KARAOKE_DONE en `roomEvents/{code}`. Los eventos van en un nodo hermano (no dentro de `rooms/{code}`) para que `onValue` no re-descargue todo el historial en cada snapshot. El motor de juego y la UI no cambiaron: solo se cambió el proveedor detrás de `ROOM_SYNC_PROVIDER`.

## Duración y cierre de la sala

- La sala se crea con `expiresAt = ahora + 30 minutos` y se borra sola al llegar a esa hora (mientras quede algún cliente con la app abierta; si todos se fueron, se borra en el próximo acceso o con el botón).
- Botón **Salir** en el tablero del host → se abre una confirmación con tres opciones: **Cancelar**, **Salir sin borrar** y **Cerrar sala**.
  - *Salir sin borrar*: te desconectás, pero la sala sigue existiendo para los demás.
  - *Cerrar sala*: borra `rooms/{code}` y vuelve al lobby. Solo el host ve esta opción.
- El botón de cierre existe también con PeerJS, pero ahí solo desconecta (no hay nada persistido).

## Pasos para activarlo

### 1. Crear el proyecto en Firebase

1. Entrá a <https://console.firebase.google.com/> y creá un proyecto (podés reutilizar el proyecto de Google Cloud donde creaste el OAuth Client ID de YouTube).
2. En **Realtime Database** → **Crear base de datos**. Elegí la región más cercana (por ejemplo `europe-west1` o `us-central1`) y arrancá en **modo bloqueado**; después se ponen las reglas.
3. En **Configuración del proyecto → Tus aplicaciones → Aplicación web**, registrá la app y copiá el objeto `firebaseConfig`.

### 2. Reglas de seguridad

En **Realtime Database → Reglas**, dejá esto (el juego funciona por código de sala, igual que antes cualquiera con el código podía entrar):

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "$code.length === 6",
        ".write": "$code.length === 6",
        "state": { ".validate": "newData.exists() === false || newData.hasChildren()" }
      }
    },
    "roomEvents": {
      "$code": {
        ".read": "$code.length === 6",
        ".write": "$code.length === 6"
      }
    }
  }
}
```

> Es un acceso público por código, no una autenticación de usuarios. Es la misma apertura que tiene hoy el enlace de invitación. Para un proyecto más grande convendría Firebase Anonymous Auth + reglas por `auth.uid`; se puede agregar después sin tocar el motor.

### 3. Pegar la config

Reemplazá los campos vacíos en **ambos** archivos:

- `src/environments/environment.ts`
- `src/environments/environment.production.ts`

```ts
firebase: {
  apiKey: 'AIza…' as string,
  authDomain: 'TU-PROYECTO.firebaseapp.com' as string,
  databaseURL: 'https://TU-PROYECTO-default-rtdb.REGION.firebaseio.com' as string,
  projectId: 'TU-PROYECTO' as string,
  appId: '1:123…:web:abc…' as string
}
```

Con `databaseURL` no vacío, `app.config.ts` activa `FirebaseRoomSyncProvider` automáticamente. Para volver al modo anterior, dejá `databaseURL: ''` o cambiá `syncProvider` a `'peer'`.

### 4. Verificación

1. `pnpm exec tsc -p tsconfig.app.json --noEmit`
2. `pnpm exec ng build`
3. `pnpm test --watch=false`
4. Crear sala en un celular por Wi-Fi, entrar desde otro por datos móviles.
5. Recargar la pestaña del host: la sala y el marcador deben seguir.
6. Poner un celular en segundo plano y volver: no debe perder el puntaje.
7. Pulsar **Salir → Cerrar sala**: la sala debe desaparecer y los invitados deben volver al lobby o quedar sin señal.

## Costos y límites del plan gratuito (Spark)

| Recurso | Límite sin costo |
| --- | --- |
| Costo | **$0**, sin tarjeta de crédito |
| Conexiones simultáneas | **100** |
| Almacenamiento | **1 GB** |
| Descarga | **10 GB / mes** |
| Escrituras | **Sin cargo** (no se facturan por operación) |

Si se supera cualquiera de esos límites, Realtime Database se **apaga** hasta que el consumo baje o se pase a Blaze. Con Blaze los mismos montos siguen siendo gratis (1 GB storage y 360 MB/día de descarga), después se paga $5/GB almacenado y $1/GB descargado, con techo de 200K conexiones. Conviene crear una alerta de presupuesto aunque no se use Blaze.

**Consumo estimado (optimizado):** el host ya no publica el snapshot completo en cada latido del motor. `STATE` se envía solo cuando cambia algo real (fase, jugador, puntos; unas ~50 veces por partida) y el latido 1 Hz viaja como `PING` con solo `{ hostNow }` (~150 B). Con 10 jugadores y 30 min: ~3 MB de snapshots + ~3 MB de latidos ≈ **6 MB por sala**. Los 10 GB/mes alcanzan para unas **1.600 salas/mes (~50 por día)**.

Dos decisiones que sostienen ese número: los eventos van en `roomEvents/{code}` (nodo hermano de `rooms/{code}`) para que `onValue` no re-descargue el historial en cada cambio, y `PING` reemplaza al snapshot 1 Hz sin tocar el motor ni el cronómetro (los clientes siguen usando `phaseStartedAt` + `clockOffset`). El límite que **no** se puede subir en Spark es el de 100 conexiones simultáneas: alcanza para ~10 salas de 10 jugadores a la vez.

Cada sala vive como máximo 30 minutos. No hay job programado que limpie salas huérfanas sin clientes: se limpian cuando alguien vuelve a abrir la app o con el botón de cierre. Esos eventos se descartan al reconectar para no repetir respuestas.

## Estado del trabajo

**Hecho**
- `FirebaseRoomSyncProvider` detrás de `ROOM_SYNC_PROVIDER`, con selection automática y fallback a PeerJS si no hay config.
- Persistencia del `RoomState`, presencia con `onDisconnect`, expiración a 30 minutos y `closeRoom()`.
- Botón **Salir → Cerrar sala** en el tablero del host, con confirmación.
- Eliminado el timeout de 12 s cuando el proveedor da presencia real (con PeerJS se mantiene el comportamiento anterior).
- Dependencia `firebase` agregada con pnpm y builds aprobados en `pnpm-workspace.yaml`.
- Verificado: `tsc --noEmit`, build y tests (2/2).

**Pendiente**
- [ ] Config web de Firebase pegada en ambos environments.
- [ ] Reglas publicadas en Realtime Database.
- [ ] Prueba real con celulares en Wi-Fi y datos móviles, reload del host y cierre de sala.
- [ ] `git commit` / `push` y redeploy de Vercel (confirmación pendiente).
