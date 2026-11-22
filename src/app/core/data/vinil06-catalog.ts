import { Track, VinilTrack } from '../models/game.models';
import { TRACK_PACKS } from './catalog';

/**
 * Catálogo local de respaldo: 48 pistas en español (12 packs × 4), con preview
 * de iTunes verificado en cada una. Cada portada es un SVG embebido en
 * `data:image/svg+xml`: funciona sin red, sin almacenamiento y sin Spotify.
 */
export const CATALOG_PACKS = [
  {
    id: 'pop',
    label: 'Pop en Español / Bandas',
    shortLabel: 'Pop',
    icon: '🎸',
    terms: [
      'Maná', 'Juanes', 'Chayanne', 'Shakira', 'Ricky Martin', 'Enrique Iglesias',
      'Gloria Estefan', 'Luis Fonsi', 'Carlos Vives', 'Juan Luis Guerra',
      'Marc Anthony', 'Thalía', 'Paulina Rubio', 'pop en español', 'pop latino'
    ]
  },
  {
    id: 'rancheras',
    label: 'Rancheras y Banda',
    shortLabel: 'Rancheras',
    icon: '🤠',
    terms: [
      'Vicente Fernández', 'Los Tigres del Norte', 'Banda MS', 'Alejandro Fernández',
      'Pepe Aguilar', 'Julión Álvarez', 'Gerardo Ortiz', 'Banda Los Recoditos',
      'Banda Carnaval', 'Los Ángeles Azules', 'rancheras', 'mariachi', 'corridos',
      'banda sinaloense', 'regional mexicano'
    ]
  },
  {
    id: 'baladas',
    label: 'Baladas en Español',
    shortLabel: 'Baladas',
    icon: '💔',
    terms: [
      'Luis Miguel', 'Alejandro Sanz', 'José José', 'Juan Gabriel', 'Laura Pausini',
      'Rocío Dúrcal', 'Raphael', 'Camilo Sesto', 'Ricardo Arjona', 'Franco De Vita',
      'Gloria Estefan', 'baladas en español', 'balada romántica', 'canciones románticas'
    ]
  },
  {
    id: 'rock',
    label: 'Rock en Español',
    shortLabel: 'Rock',
    icon: '🥁',
    terms: [
      'Soda Stereo', 'Jarabe de Palo', 'Molotov', 'Los Enanitos Verdes', 'El Tri',
      'Caifanes', 'Héroes del Silencio', 'Bunbury', 'Andrés Calamaro', 'Charly García',
      'Fito Páez', 'Divididos', 'Los Auténticos Decadentes', 'rock en español',
      'rock alternativo español'
    ]
  },
  {
    id: 'pop-en',
    label: 'Pop inglés · 2000 → hoy',
    shortLabel: 'Pop inglés',
    icon: '🎧',
    terms: [
      'Britney Spears', 'Justin Timberlake', 'Beyoncé', 'Lady Gaga', 'Katy Perry',
      'Taylor Swift', 'Rihanna', 'Ariana Grande', 'Ed Sheeran', 'Adele',
      'Bruno Mars', 'Maroon 5', 'Coldplay', 'OneRepublic', 'The Weeknd',
      'Billie Eilish', 'Dua Lipa', 'Harry Styles', 'Olivia Rodrigo', 'Sia',
      'Avril Lavigne', 'Shawn Mendes', 'Jennifer Lopez', 'David Guetta',
      'pop hits 2000s', 'pop hits 2010s', 'pop hits 2020s', 'english pop 2000s'
    ]
  },
  {
    id: 'latino',
    label: 'Salsa, merengue y reguetón',
    shortLabel: 'Latino',
    icon: '💃',
    terms: [
      'Marc Anthony', 'Gilberto Santa Rosa', 'El Gran Combo', 'Sonora Ponceña',
      'Willie Colón', 'Héctor Lavoe', 'Rubén Blades', 'Celía Cruz',
      'salsa', 'salsa romántica', 'Juan Luis Guerra', 'Wilfrido Vargas',
      'Los Hermanos Rosario', 'Olga Tañón', 'merengue', 'Daddy Yankee',
      'Don Omar', 'Wisin y Yandel', 'Bad Bunny', 'J Balvin', 'Karol G',
      'Ozuna', 'Rauw Alejandro', 'Farruko', 'Sech', 'reguetón', 'urbano latino'
    ]
  },
  {
    id: 'mix',
    label: 'Mix Completo',
    shortLabel: 'Mix',
    icon: '✦',
    terms: [
      'pop en español', 'rancheras', 'baladas en español', 'rock en español',
      'pop latino', 'regional mexicano', 'merengue', 'salsa', 'cumbia',
      'Maná', 'Los Tigres del Norte', 'Soda Stereo', 'Shakira', 'Juanes',
      'Luis Miguel', 'Alejandro Sanz', 'Taylor Swift', 'Ed Sheeran', 'Lady Gaga',
      'The Weeknd', 'Dua Lipa', 'pop hits 2000s', 'pop hits 2010s',
      'salsa', 'merengue', 'reguetón', 'Daddy Yankee', 'Juan Luis Guerra',
      'Bad Bunny', 'Marc Anthony'
    ]
  }
] as const;

export type CatalogPackId = (typeof CATALOG_PACKS)[number]['id'];

export function isCatalogPackId(value: string): value is CatalogPackId {
  return CATALOG_PACKS.some((pack) => pack.id === value);
}

export function packLabel(id: string): string {
  return CATALOG_PACKS.find((pack) => pack.id === id)?.label ?? 'Mix Completo';
}

export function packTerms(id: string): readonly string[] {
  return (
    CATALOG_PACKS.find((pack) => pack.id === id)?.terms ??
    CATALOG_PACKS.find((pack) => pack.id === 'mix')!.terms
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** SVG limpio generado en memoria a partir de la paleta de la pista. */
export function svgCover(track: Pick<Track, 'title' | 'artist' | 'palette' | 'motif'>): string {
  const [from, to] = track.palette;
  const title = escapeXml(clip(track.title, 18));
  const artist = escapeXml(clip(track.artist, 20));
  const motif = track.motif % 4;
  const shapes = [
    '<circle cx="82" cy="24" r="26" fill="rgba(255,255,255,.16)"/>',
    '<polygon points="50,16 88,86 12,86" fill="rgba(255,255,255,.14)"/>',
    '<rect x="22" y="22" width="56" height="56" rx="14" transform="rotate(14 50 50)" fill="rgba(255,255,255,.14)"/>',
    '<circle cx="50" cy="46" r="30" stroke="rgba(255,255,255,.22)" stroke-width="6" fill="none"/>'
  ][motif]!;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="100" height="100" fill="url(#g)"/>${shapes}
<circle cx="50" cy="44" r="15" fill="rgba(9,11,16,.72)"/><circle cx="50" cy="44" r="5" fill="#fff"/>
<rect x="0" y="70" width="100" height="30" fill="rgba(9,11,16,.66)"/>
<text x="6" y="82" fill="#fff" font-family="Arial,sans-serif" font-size="7" font-weight="bold">${title}</text>
<text x="6" y="92" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="5.5">${artist}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Las 48 pistas locales, ya con portada SVG por pista. */
export const VINIL06_CATALOG: readonly VinilTrack[] = TRACK_PACKS.flatMap((pack) =>
  pack.tracks.map((track) => ({ ...track, cover: svgCover(track) }))
);

function belongsToPack(track: VinilTrack, id: CatalogPackId): boolean {
  const genre = track.genre.toLowerCase();
  switch (id) {
    case 'pop':
      return genre.includes('pop');
    case 'rancheras':
      return genre.includes('ranchera');
    case 'baladas':
      return genre.includes('balada');
    case 'rock':
      return genre.includes('rock');
    case 'pop-en':
      // El respaldo local solo tiene pistas en español: sin red se usa el
      // catálogo completo como fallback (el pack inglés necesita /api/catalog).
      return false;
    case 'latino':
      return genre.includes('latino');
    case 'mix':
      return true;
  }
}

/** Selección local para un pack (fallback instantáneo si `/api/catalog` falla). */
export function getLocalPack(id: CatalogPackId): readonly VinilTrack[] {
  const filtered = VINIL06_CATALOG.filter((track) => belongsToPack(track, id));
  // Un pack pequeño se completa con el resto del catálogo para 12 rondas sin repetir.
  if (filtered.length < 24) {
    const ids = new Set(filtered.map((track) => track.id));
    return [...filtered, ...VINIL06_CATALOG.filter((track) => !ids.has(track.id))];
  }
  return filtered;
}

export { KARAOKE_CHALLENGES } from './catalog';
