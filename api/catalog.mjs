/**
 * Vercel Function (Node runtime, sin persistencia).
 * Consulta metadatos públicos de iTunes (sin OAuth ni usuario) y devuelve
 * vinilos normalizados al esquema VinilTrack. El cliente hace fallback local
 * si esta función no existe o falla: la app nunca depende de ella para jugar.
 *
 * Es .mjs a propósito: el tsconfig del build de Angular usa `module: preserve`
 * y Vercel no puede cargar ese output CommonJS como función.
 */

const SEARCH_TERMS = {
  viral: ['bad bunny', 'the weeknd', 'dua lipa', 'karol g'],
  clasicos: ['michael jackson', 'queen', 'a-ha', 'soda stereo'],
  hits: ['coldplay', 'shakira', 'daft punk', 'bruno mars'],
  latina: ['daddy yankee', 'carlos vives', 'enrique iglesias', 'don omar'],
  mix: ['latin pop', 'rock classics', 'dance hits', 'pop hits']
};

const PALETTES = [
  ['#0ea5e9', '#1e1b4b'],
  ['#10b981', '#064e3b'],
  ['#6366f1', '#1e293b'],
  ['#f43f5e', '#31102f'],
  ['#f59e0b', '#451a03'],
  ['#ec4899', '#3b0764']
];

function hash(value) {
  return [...value].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function xml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgCover(title, artist) {
  const [from, to] = PALETTES[hash(title) % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${from}"/><circle cx="50" cy="42" r="18" fill="${to}"/><rect y="72" width="100" height="28" fill="rgba(9,11,16,.7)"/><text x="6" y="84" fill="#fff" font-size="7" font-family="Arial">${xml(title.slice(0, 18))}</text><text x="6" y="94" fill="#cbd5e1" font-size="5" font-family="Arial">${xml(artist.slice(0, 20))}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function normalize(result) {
  if (!result.trackId || !result.trackName || !result.artistName) return null;
  // Sin preview no hay juego: descartamos pistas que no se pueden escuchar.
  const previewUrl = result.previewUrl;
  if (typeof previewUrl !== 'string' || !previewUrl.startsWith('https://')) return null;
  const year = Number.parseInt((result.releaseDate ?? '').slice(0, 4), 10);
  const safeYear = Number.isFinite(year) && year > 1900 ? year : 2000;
  const id = `it-${result.trackId}`;
  const cover = (result.artworkUrl100 ?? '').replace('100x100bb', '600x600bb');
  const [from, to] = PALETTES[hash(id) % PALETTES.length];

  return {
    id,
    title: result.trackName,
    artist: result.artistName,
    genre: result.primaryGenreName || 'Pop',
    year: safeYear,
    decade: `${Math.floor(safeYear / 10) * 10}s`,
    bpm: 0,
    palette: [from, to],
    motif: hash(id) % 4,
    cover: cover.startsWith('https://') ? cover : svgCover(result.trackName, result.artistName),
    previewUrl,
    // Consulta lista para el modo YouTube del host (sin ID: se busca en vivo).
    youtubeQuery: `${result.artistName} ${result.trackName}`.trim()
  };
}

async function search(term) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=14&country=US`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return [];
  const body = await response.json();
  return body.results ?? [];
}

export default async function handler(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const requested = url.searchParams.get('pack') ?? 'mix';
  const pack = Object.hasOwn(SEARCH_TERMS, requested) ? requested : 'mix';
  const terms = SEARCH_TERMS[pack] ?? SEARCH_TERMS.mix;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Caché en el edge: 12h fresca, luego revalida sin bloquear respuestas.
  res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');

  try {
    const batches = await Promise.allSettled(terms.map(search));
    const seen = new Set();
    const tracks = [];

    for (const batch of batches) {
      if (batch.status !== 'fulfilled') continue;
      for (const item of batch.value) {
        const track = normalize(item);
        if (!track || seen.has(track.id)) continue;
        seen.add(track.id);
        tracks.push(track);
        if (tracks.length >= 32) break;
      }
      if (tracks.length >= 32) break;
    }

    if (tracks.length < 4) {
      res.writeHead(502, { 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'catálogo remoto no disponible' }));
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify(tracks));
  } catch {
    res.writeHead(502, { 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'catálogo remoto no disponible' }));
  }
}
