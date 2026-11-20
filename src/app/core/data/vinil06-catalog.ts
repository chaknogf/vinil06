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
    terms: ['Maná', 'Juanes', 'Chayanne', 'pop en español']
  },
  {
    id: 'rancheras',
    label: 'Rancheras y Banda',
    shortLabel: 'Rancheras',
    icon: '🤠',
    terms: ['Vicente Fernández', 'Los Tigres del Norte', 'Banda MS', 'rancheras']
  },
  {
    id: 'baladas',
    label: 'Baladas en Español',
    shortLabel: 'Baladas',
    icon: '💔',
    terms: ['Luis Miguel', 'Alejandro Sanz', 'José José', 'baladas en español']
  },
  {
    id: 'rock',
    label: 'Rock en Español',
    shortLabel: 'Rock',
    icon: '🥁',
    terms: ['Soda Stereo', 'Jarabe de Palo', 'Molotov', 'rock en español']
  },
  {
    id: 'mix',
    label: 'Mix Completo',
    shortLabel: 'Mix',
    icon: '✦',
    terms: ['pop en español', 'rancheras', 'baladas en español', 'rock en español']
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
  return CATALOG_PACKS.find((pack) => pack.id === id)?.terms ?? CATALOG_PACKS[4]!.terms;
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
