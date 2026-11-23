/**
 * Deep link público a la búsqueda de Spotify.
 *
 * No usa OAuth, SDK ni la Web API: solo abre `open.spotify.com/search` en una
 * pestaña nueva para que el anfitrión encuentre y reproduzca la canción en su
 * propia sesión. La app nunca ve su cuenta ni controla su reproductor.
 */
export function spotifySearchUrl(title: string, artist: string): string {
  const query = [artist.trim(), title.trim()].filter(Boolean).join(' ');
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

/**
 * Un único texto accionable para cada fallo de Spotify, en el modal y en el
 * panel de audio. Siempre aclara que la partida NO se detiene: el preview de
 * iTunes del host sigue siendo la fuente de respaldo.
 */
export function spotifyMessage(status: string, raw = ''): string {
  let reason: string;
  switch (status) {
    case 'not-configured':
      reason = 'Spotify no está configurado en esta app.';
      break;
    case 'free':
      reason = 'Tu cuenta de Spotify es Free: no podemos controlar la reproducción.';
      break;
    case 'no-device':
      reason =
        'Spotify no tiene un dispositivo activo: abre la app en el móvil o conecta una bocina.';
      break;
    case 'connecting':
      reason = 'Conectando con Spotify…';
      break;
    case 'error':
      reason = 'No se pudo conectar con Spotify.';
      break;
    default:
      reason = 'Spotify no está disponible.';
  }
  const detail = raw.trim();
  return `${reason}${detail ? ` ${detail}.` : ''} La partida continúa con el preview de iTunes en el altavoz del host.`;
}
