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
