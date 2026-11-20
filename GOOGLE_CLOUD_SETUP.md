# Configuración de Google Cloud para YouTube en Vinil06

El login de YouTube del host ya está implementado y configurado: usa **Google Identity Services (token model)** y el access token vive solo en memoria. Este documento registra lo que quedó hecho y lo único que todavía requiere tu acción en Google Cloud.

## Decisiones técnicas

- **No usamos Authorization Code + PKCE** como en Spotify. Google exige `client_secret` en el canje cuando el Client ID es de tipo *Aplicación web*, incluso enviando `code_verifier` (documentación oficial y reportes de la comunidad). Poner ese secreto en una SPA sería inseguro y una Vercel Function solo para hacer el POST sería backend de más.
- **Usamos el token model de GIS**, que es el flujo que Google recomienda para apps que corren en el navegador: abre su propia UX de cuenta/consentimiento, devuelve el `access_token` al callback de JavaScript, no usa `client_secret` y no redirige a ninguna ruta nuestra.
- Por lo tanto, los redirect URIs `http://localhost:4200/auth/callback` y `https://vinil06.vercel.app/auth/callback` que ya registraste **no se usan**. Podés dejarlos; no hacen falta ni tampoco hay que agregar nuevos.
- El `client_secret` del JSON descargado (`client_secret_…apps.googleusercontent.com.json`) **nunca se copió al proyecto**. No lo subas al repo.

## 1. Credenciales en el código (ya hecho)

`src/environments/environment.ts` y `src/environments/environment.production.ts`:

```ts
youtube: {
  clientId: '365995761449-0tl4rq1dd3rgi563rlh2g7g0kgsfctr5.apps.googleusercontent.com' as string,
  apiKey: 'AIzaSyCdWDdtylzp2DWIzrI-pBSwmqGAcRmkFYM' as string
}
```

- `clientId`: el OAuth Client ID web que generaste. Sus orígenes autorizados son `http://127.0.0.1:4200` y `https://vinil06.vercel.app`.
- `apiKey`: clave pública. Restringir en Google Cloud a:
  - API: **YouTube Data API v3**.
  - Sitios web: `http://127.0.0.1:4200/*` y `https://vinil06.vercel.app/*`.
  - Como fue compartida por chat, conviene **rotarla** y pegar la nueva en ambos archivos.

> En una SPA la API key es pública: la protección real son las restricciones de API y referrers. El access token de YouTube no se guarda en `localStorage`, `sessionStorage` ni IndexedDB.

## 2. Pantalla de consentimiento

Confirmar en Google Cloud:

- Tipo: **Externo** (o interno si todos son del mismo Workspace).
- Estado: **En producción** (o agregar tu cuenta como **Usuario de prueba** mientras desarrollás).
- Scope: `https://www.googleapis.com/auth/youtube.readonly`.

Sin esto Google puede devolver `403: access_denied` aunque el Client ID esté bien.

## 3. Verificación

1. `pnpm exec tsc -p tsconfig.app.json --noEmit`
2. `pnpm exec ng build`
3. `pnpm test --watch=false`
4. En la app: modo host → panel de audio → **YouTube → Conectar YouTube**.
5. Se abre la UX de Google, se autoriza, se cierra y el panel queda en **● YouTube conectado** con la lista de tus vídeos subidos.
6. Elegí un vídeo (o pegá un enlace/ID) → en la fase `LISTEN_8S` el host ve/oye el vídeo por la bocina; los invitados siguen oyendo el preview de iTunes. La sala no se recarga.

## Notas

- El SDK se precarga al iniciar la app; si no carga, el panel avisa y el pegado manual sigue funcionando.
- El scope es solo de **lectura**: el host no puede modificar su cuenta de YouTube.
- `forMine=true` lista los vídeos **subidos por la cuenta conectada**. Para cualquier vídeo público, pegá el enlace/ID manualmente.
- El token expira en ~1 hora: si venció, el panel pide volver a pulsar **Conectar YouTube**.
- El fallback manual y el modo `MANUAL` nunca bloquean la ronda.

## Actividades ya realizadas

- Implementado `pkceChallenge`/`randomBase64Url` compartidos con Spotify (`src/app/core/utils/pkce.ts`); Spotify sigue usando PKCE público, que sí funciona sin secreto.
- Cargado el OAuth Client ID y la API key en ambos environments.
- Reemplazado el flujo PKCE manual de YouTube por **Google Identity Services (token model)** en `youtube-host-audio.service.ts`: token solo en RAM, sin secreto, sin redirect, sin popup propio.
- Eliminado el componente/ruta `/youtube/callback` que ya no aplica.
- Integrado el servicio en `HostAudioControllerService` y en el panel de audio del host (login, lista de vídeos, selección, desconexión, estados y errores).
- Verificado: `tsc --noEmit`, `ng build`, `pnpm test --watch=false` (2/2) y smoke CDP a 390×844 y 360×740 sin overflow ni targets <44 px.
- Smoke CDP con GIS simulado: clic en **Conectar YouTube** → `requestAccessToken` con scope correcto → callback con token → **● YouTube conectado** + 2 vídeos + selección con `aria-pressed`, sin errores de JS.
- Auditoría UX completa (34 hallazgos) implementada y verificada en su totalidad; no quedó MD de UX pendiente.

## Pendiente

- [ ] API key rotada/restringida a YouTube Data API v3 + dominios.
- [ ] Confirmar pantalla de consentimiento en producción o usuarios de prueba.
- [ ] Smoke test del login real en local y en `https://vinil06.vercel.app/`.
- [ ] `git commit` / `push` y redeploy de Vercel (previamente confirmado con el usuario).
