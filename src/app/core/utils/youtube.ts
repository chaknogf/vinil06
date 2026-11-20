/**
 * Utilidades de YouTube solo para MINIATURAS de portada.
 *
 * El motor de juego ya no reproduce YouTube: el audio es el preview de iTunes
 * de la misma pista, en el altavoz del host. Aquí solo se parsea el ID de un
 * vídeo para construir la URL pública de su thumbnail; si falla, la carta usa
 * su portada SVG local. Sin login, OAuth ni claves de API.
 */

const VIDEO_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

function toUrl(value: string): URL | null {
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

/** ID de vídeo de 11 caracteres (watch, youtu.be, embed, shorts o ID suelto). */
export function parseYouTubeVideoId(raw: string): string {
  const value = raw.trim();
  if (VIDEO_ID.test(value)) return value;

  const url = toUrl(value);
  if (!url) return '';
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return '';

  let candidate = '';
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/').filter(Boolean)[0] ?? '';
  } else {
    candidate = url.searchParams.get('v') ?? '';
    if (!candidate) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'v') {
        candidate = parts[1] ?? '';
      }
    }
  }
  return VIDEO_ID.test(candidate) ? candidate : '';
}

/** Miniatura pública de un vídeo; el componente usa la SVG local si falla (offline). */
export function youtubeThumbnailUrl(videoId: string): string {
  const id = parseYouTubeVideoId(videoId);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}
