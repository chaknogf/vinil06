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
  pop: [
    'Maná', 'Juanes', 'Chayanne', 'Shakira', 'Ricky Martin', 'Enrique Iglesias',
    'Gloria Estefan', 'Luis Fonsi', 'Carlos Vives', 'Juan Luis Guerra',
    'Marc Anthony', 'Thalía', 'Paulina Rubio', 'pop en español', 'pop latino'
  ],
  rancheras: [
    'Vicente Fernández', 'Los Tigres del Norte', 'Banda MS', 'Alejandro Fernández',
    'Pepe Aguilar', 'Julión Álvarez', 'Gerardo Ortiz', 'Banda Los Recoditos',
    'Banda Carnaval', 'Los Ángeles Azules', 'rancheras', 'mariachi', 'corridos',
    'banda sinaloense', 'regional mexicano'
  ],
  baladas: [
    'Luis Miguel', 'Alejandro Sanz', 'José José', 'Juan Gabriel', 'Laura Pausini',
    'Rocío Dúrcal', 'Raphael', 'Camilo Sesto', 'Ricardo Arjona', 'Franco De Vita',
    'Gloria Estefan', 'baladas en español', 'balada romántica', 'canciones románticas'
  ],
  rock: [
    'Soda Stereo', 'Jarabe de Palo', 'Molotov', 'Los Enanitos Verdes', 'El Tri',
    'Caifanes', 'Héroes del Silencio', 'Bunbury', 'Andrés Calamaro', 'Charly García',
    'Fito Páez', 'Divididos', 'Los Auténticos Decadentes', 'rock en español',
    'rock alternativo español'
  ],
  'pop-en': [
    'Britney Spears', 'Justin Timberlake', 'Beyoncé', 'Lady Gaga', 'Katy Perry',
    'Taylor Swift', 'Rihanna', 'Ariana Grande', 'Ed Sheeran', 'Adele',
    'Bruno Mars', 'Maroon 5', 'Coldplay', 'OneRepublic', 'The Weeknd',
    'Billie Eilish', 'Dua Lipa', 'Harry Styles', 'Olivia Rodrigo', 'Sia',
    'Avril Lavigne', 'Shawn Mendes', 'Jennifer Lopez', 'David Guetta',
    'pop hits 2000s', 'pop hits 2010s', 'pop hits 2020s', 'english pop 2000s'
  ],
  latino: [
    'Marc Anthony', 'Gilberto Santa Rosa', 'El Gran Combo', 'Sonora Ponceña',
    'Willie Colón', 'Héctor Lavoe', 'Rubén Blades', 'Celía Cruz',
    'salsa', 'salsa romántica', 'Juan Luis Guerra', 'Wilfrido Vargas',
    'Los Hermanos Rosario', 'Olga Tañón', 'merengue', 'Daddy Yankee',
    'Don Omar', 'Wisin y Yandel', 'Bad Bunny', 'J Balvin', 'Karol G',
    'Ozuna', 'Rauw Alejandro', 'Farruko', 'Sech', 'reguetón', 'urbano latino'
  ],
  mix: [
    'pop en español', 'rancheras', 'baladas en español', 'rock en español',
    'pop latino', 'regional mexicano', 'merengue', 'salsa', 'cumbia',
    'Maná', 'Los Tigres del Norte', 'Soda Stereo', 'Shakira', 'Juanes',
    'Luis Miguel', 'Alejandro Sanz', 'Taylor Swift', 'Ed Sheeran', 'Lady Gaga',
    'The Weeknd', 'Dua Lipa', 'pop hits 2000s', 'pop hits 2010s',
    'salsa', 'merengue', 'reguetón', 'Daddy Yankee', 'Juan Luis Guerra',
    'Bad Bunny', 'Marc Anthony'
  ]
};

/** Pool amplio: 12 rondas × 4 cartas necesitan margen para no repetir. */
const MAX_TRACKS = 200;

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

/** iTunes devuelve la misma canción en varias ediciones con trackId distinto. */
function songKey(title, artist) {
  const clean = (value) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${clean(title)}|${clean(artist)}`;
}

function xml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgCover(title, artist) {
  const [from, to] = PALETTES[hash(title) % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${from}"/><circle cx="50" cy="42" r="18" fill="${to}"/><rect y="72" width="100" height="28" fill="rgba(9,11,16,.7)"/><text x="6" y="84" fill="#fff" font-size="7" font-family="Arial">${xml(title.slice(0, 18))}</text><text x="6" y="94" fill="#cbd5e1" font-size="5" font-family="Arial">${xml(artist.slice(0, 20))}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Descarta karaokes, tributos, instrumentales y compilaciones ajenas al pack. */
const BLOCKED_CATALOG =
  /ethnic\s+psy|world\s+lounge|karaoke|tribute|parodia|instrumental|remix|remaster|remasterizado|radio edit|en vivo|en directo|\blive\b/i;

function normalize(result) {
  if (!result.trackId || !result.trackName || !result.artistName) return null;
  if (BLOCKED_CATALOG.test(`${result.trackName} ${result.artistName}`)) return null;
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
    previewUrl
  };
}

async function search(term) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=100&country=US`;
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
    // Intercalamos las listas: si se concatenan, el tope se llena con los dos
    // primeros artistas y el "mix" deja de ser variado.
    const lists = batches
      .filter((batch) => batch.status === 'fulfilled')
      .map((batch) => batch.value);
    const longest = Math.max(0, ...lists.map((list) => list.length));
    const seen = new Set();
    const seenSongs = new Set();
    const tracks = [];

    for (let i = 0; i < longest && tracks.length < MAX_TRACKS; i++) {
      for (const list of lists) {
        const item = list[i];
        if (!item) continue;
        const track = normalize(item);
        if (!track || seen.has(track.id)) continue;
        // El pack de pop inglés empieza en 2000: iTunes mezcla clásicos de los
        // 90 en las búsquedas de artista (Britney, Backstreet Boys, etc.).
        if (pack === 'pop-en' && track.year < 2000) continue;
        const key = songKey(track.title, track.artist);
        if (seenSongs.has(key)) continue;
        seen.add(track.id);
        seenSongs.add(key);
        tracks.push(track);
        if (tracks.length >= MAX_TRACKS) break;
      }
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
