import { Injectable, signal } from '@angular/core';
import {
  CatalogPackId,
  getLocalPack,
  isCatalogPackId,
  packLabel,
  svgCover
} from '../data/vinil06-catalog';
import { VinilTrack } from '../models/game.models';
import { parseYouTubeVideoId } from '../utils/youtube';

type CatalogSource = 'idle' | 'remote' | 'local';

/**
 * El edge cache puede servir respuestas antiguas: filtramos también aquí los
 * karaokes, tributos, instrumentales y compilaciones ajenas al pack.
 */
const BLOCKED_CATALOG =
  /ethnic\s+psy|world\s+lounge|karaoke|tribute|parodia|instrumental|remix|en vivo|\blive\b/i;

const PALETTES: readonly (readonly [string, string])[] = [
  ['#0ea5e9', '#1e1b4b'],
  ['#10b981', '#064e3b'],
  ['#6366f1', '#1e293b'],
  ['#f43f5e', '#31102f'],
  ['#f59e0b', '#451a03'],
  ['#ec4899', '#3b0764']
];

function hash(value: string): number {
  return [...value].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function paletteFor(id: string): readonly [string, string] {
  return PALETTES[hash(id) % PALETTES.length]!;
}

function normalizeRemote(value: unknown, packId: CatalogPackId): readonly VinilTrack[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tracks: VinilTrack[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const id = typeof raw['id'] === 'string' ? raw['id'].trim() : '';
    const title = typeof raw['title'] === 'string' ? raw['title'].trim() : '';
    const artist = typeof raw['artist'] === 'string' ? raw['artist'].trim() : '';
    if (!id || !title || !artist || seen.has(id)) continue;
    if (BLOCKED_CATALOG.test(`${title} ${artist}`)) continue;
    seen.add(id);

    const year = typeof raw['year'] === 'number' && raw['year'] > 1900 ? raw['year'] : 2000;
    const genre = typeof raw['genre'] === 'string' ? raw['genre'] : packLabel(packId);
    const decade =
      typeof raw['decade'] === 'string'
        ? raw['decade']
        : `${Math.floor(year / 10) * 10}s`;
    const palette = paletteFor(id);
    const motif = typeof raw['motif'] === 'number' ? raw['motif'] : hash(id) % 4;
    const remoteCover = typeof raw['cover'] === 'string' ? raw['cover'] : '';
    const cover = remoteCover.startsWith('https://') ? remoteCover : '';
    const rawUri = typeof raw['spotifyUri'] === 'string' ? raw['spotifyUri'].trim() : '';
    const spotifyUri = rawUri.startsWith('spotify:track:') ? rawUri : '';
    const rawPreview = typeof raw['previewUrl'] === 'string' ? raw['previewUrl'].trim() : '';
    const previewUrl = rawPreview.startsWith('https://') ? rawPreview : '';
    // Sin preview no hay juego: el host solo reproduce pistas que pueden sonar.
    if (!previewUrl) continue;
    const rawYtId = typeof raw['youtubeVideoId'] === 'string' ? raw['youtubeVideoId'].trim() : '';
    const youtubeVideoId = parseYouTubeVideoId(rawYtId);

    // Si la URL remota falla al cargar, AlbumArtComponent muestra su SVG local.
    tracks.push({
      id,
      title,
      artist,
      genre,
      year,
      decade,
      bpm: typeof raw['bpm'] === 'number' ? raw['bpm'] : 0,
      palette,
      motif,
      cover: cover || svgCover({ title, artist, palette, motif }),
      ...(spotifyUri ? { spotifyUri } : {}),
      previewUrl,
      ...(youtubeVideoId ? { youtubeVideoId } : {})
    });
  }
  return tracks;
}

/**
 * Carga el pack elegido desde `/api/catalog` y lo mantiene SOLO en Signals.
 * Si falla red/servidor, usa el catálogo local al instante. Nada se escribe en disco.
 */
@Injectable({ providedIn: 'root' })
export class CatalogSyncService {
  readonly packId = signal<CatalogPackId>('mix');
  readonly tracks = signal<readonly VinilTrack[]>(getLocalPack('mix'));
  readonly loading = signal(false);
  readonly source = signal<CatalogSource>('idle');

  #controller: AbortController | null = null;

  async loadPack(id: CatalogPackId): Promise<readonly VinilTrack[]> {
    const pack = isCatalogPackId(id) ? id : 'mix';
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    const timeout = setTimeout(() => controller.abort(), 4500);

    this.packId.set(pack);
    this.loading.set(true);
    try {
      const response = await fetch(`/api/catalog?pack=${encodeURIComponent(pack)}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remote = normalizeRemote(await response.json(), pack);
      if (remote.length < 4) throw new Error('Catálogo remoto vacío');
      this.tracks.set(remote);
      this.source.set('remote');
    } catch {
      this.tracks.set(getLocalPack(pack));
      this.source.set('local');
    } finally {
      clearTimeout(timeout);
      if (this.#controller === controller) this.#controller = null;
      this.loading.set(false);
    }
    return this.tracks();
  }
}
