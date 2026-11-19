import { PublicOption, RoundPack, Track, VinilTrack } from '../models/game.models';

type TrackSeed = readonly [
  id: string,
  title: string,
  artist: string,
  year: number,
  from: string,
  to: string
];

const T = (
  packId: string,
  genre: string,
  decade: string,
  seed: TrackSeed,
  index: number
): Track => ({
  id: seed[0] ?? `${packId}-${index}`,
  title: seed[1] ?? '',
  artist: seed[2] ?? '',
  genre,
  year: seed[3] ?? 2000,
  decade,
  bpm: 0,
  palette: [seed[4] ?? '#10b981', seed[5] ?? '#064e3b'],
  motif: index % 4
});

function makePack(
  id: string,
  genre: string,
  decade: string,
  label: string,
  bpm: number,
  seeds: readonly TrackSeed[]
): RoundPack {
  return {
    id,
    genre,
    decade,
    label,
    bpm,
    tracks: seeds.map((seed, i) => ({ ...T(id, genre, decade, seed, i), bpm }))
  };
}

/**
 * Catálogo 100% en memoria (48 pistas reales, 12 grupos de 4).
 * No se consulta Spotify: el anfitrión reproduce la canción en su propia app.
 * Cada ronda usa un grupo distinto -> ninguna pista se repite en 12 rondas.
 */
export const TRACK_PACKS: readonly RoundPack[] = [
  makePack('pk01', 'Pop/Rock', '2000s', 'Pop / Rock · 2000s', 118, [
    ['tr01', 'Clocks', 'Coldplay', 2002, '#0ea5e9', '#1e1b4b'],
    ['tr02', 'Somewhere Only We Know', 'Keane', 2003, '#10b981', '#064e3b'],
    ['tr03', 'Chasing Cars', 'Snow Patrol', 2005, '#6366f1', '#1e293b'],
    ['tr04', 'Mr. Brightside', 'The Killers', 2004, '#f43f5e', '#31102f']
  ]),
  makePack('pk02', 'Reggaetón', '2000s', 'Reggaetón Clásico · 2000s', 96, [
    ['tr05', 'Gasolina', 'Daddy Yankee', 2004, '#f97316', '#450a0a'],
    ['tr06', 'Dile', 'Don Omar', 2005, '#eab308', '#422006'],
    ['tr07', 'Rakata', 'Wisin & Yandel', 2002, '#ec4899', '#3b0764'],
    ['tr08', 'Baila Morena', 'Héctor & Tito', 2001, '#ef4444', '#1f2937']
  ]),
  makePack('pk03', 'Rock en Español', '90s', 'Rock en Español · 90s', 124, [
    ['tr09', 'De Música Ligera', 'Soda Stereo', 1990, '#3b82f6', '#0f172a'],
    ['tr10', 'La Flaca', 'Jarabe de Palo', 1996, '#f59e0b', '#451a03'],
    ['tr11', 'Lamento Boliviano', 'Enanitos Verdes', 1994, '#14b8a6', '#042f2e'],
    ['tr12', 'Rayando el Sol', 'Maná', 1990, '#8b5cf6', '#1e1b4b']
  ]),
  makePack('pk04', 'Pop', '80s', 'Pop · 80s', 117, [
    ['tr13', 'Billie Jean', 'Michael Jackson', 1982, '#e11d48', '#090d16'],
    ['tr14', 'Take On Me', 'a-ha', 1985, '#38bdf8', '#1e293b'],
    ['tr15', 'Like a Virgin', 'Madonna', 1984, '#d946ef', '#2e1065'],
    ['tr16', 'Sweet Dreams', 'Eurythmics', 1983, '#6366f1', '#172554']
  ]),
  makePack('pk05', 'Pop Latino', '2010s', 'Pop Latino · 2010s', 105, [
    ['tr17', 'La Bicicleta', 'Carlos Vives & Shakira', 2016, '#10b981', '#064e3b'],
    ['tr18', 'Bailando', 'Enrique Iglesias', 2014, '#f43f5e', '#4c0519'],
    ['tr19', 'Vivir Mi Vida', 'Marc Anthony', 2013, '#f59e0b', '#451a03'],
    ['tr20', 'Despacito', 'Luis Fonsi & Daddy Yankee', 2017, '#06b6d4', '#164e63']
  ]),
  makePack('pk06', 'Dance', '2010s', 'Pop / Dance · 2010s', 128, [
    ['tr21', 'Uptown Funk', 'Mark Ronson ft. Bruno Mars', 2014, '#eab308', '#3f2e05'],
    ['tr22', 'Get Lucky', 'Daft Punk', 2013, '#f97316', '#27150c'],
    ['tr23', "Can't Stop the Feeling!", 'Justin Timberlake', 2016, '#0ea5e9', '#0c4a6e'],
    ['tr24', 'Happy', 'Pharrell Williams', 2013, '#84cc16', '#1a2e05']
  ]),
  makePack('pk07', 'Rock', '80s', 'Rock Clásico · 80s', 112, [
    ['tr25', "Livin' on a Prayer", 'Bon Jovi', 1986, '#dc2626', '#1f1218'],
    ['tr26', "Sweet Child O' Mine", "Guns N' Roses", 1987, '#d97706', '#291807'],
    ['tr27', 'Another One Bites the Dust', 'Queen', 1980, '#7c3aed', '#1e1b4b'],
    ['tr28', 'Every Breath You Take', 'The Police', 1983, '#2563eb', '#0f172a']
  ]),
  makePack('pk08', 'Urbano', '2020s', 'Pop Urbano · 2020s', 100, [
    ['tr29', 'Tití Me Preguntó', 'Bad Bunny', 2022, '#ec4899', '#3b0764'],
    ['tr30', 'Provenza', 'Karol G', 2022, '#14b8a6', '#042f2e'],
    ['tr31', 'Hawái', 'Maluma', 2020, '#0284c7', '#082f49'],
    ['tr32', 'Pepas', 'Farruko', 2021, '#f97316', '#431407']
  ]),
  makePack('pk09', 'R&B', '2000s', 'Pop / R&B · 2000s', 99, [
    ['tr33', 'Crazy in Love', 'Beyoncé', 2003, '#f59e0b', '#451a03'],
    ['tr34', 'Umbrella', 'Rihanna', 2007, '#64748b', '#0f172a'],
    ['tr35', "Hips Don't Lie", 'Shakira', 2006, '#e11d48', '#4c0519'],
    ['tr36', 'Toxic', 'Britney Spears', 2003, '#06b6d4', '#083344']
  ]),
  makePack('pk10', 'Synth Pop', '2020s', 'Pop / Synth · 2020s', 171, [
    ['tr37', 'Blinding Lights', 'The Weeknd', 2020, '#ef4444', '#2a0808'],
    ['tr38', 'Levitating', 'Dua Lipa', 2020, '#8b5cf6', '#2e1065'],
    ['tr39', 'As It Was', 'Harry Styles', 2022, '#f43f5e', '#1e1b4b'],
    ['tr40', 'Save Your Tears', 'The Weeknd', 2021, '#3b82f6', '#172554']
  ]),
  makePack('pk11', 'Balada', '90s', 'Balada / Pop Español · 90s', 92, [
    ['tr41', 'Corazón Partío', 'Alejandro Sanz', 1997, '#d97706', '#311606'],
    ['tr42', 'La Incondicional', 'Luis Miguel', 1990, '#1d4ed8', '#0f172a'],
    ['tr43', 'Experiencia Religiosa', 'Enrique Iglesias', 1996, '#9333ea', '#270a3d'],
    ['tr44', 'Torero', 'Chayanne', 1999, '#dc2626', '#3b0712']
  ]),
  makePack('pk12', 'Rock Alternativo', '2000s', 'Rock Alternativo · 2000s', 132, [
    ['tr45', 'Seven Nation Army', 'The White Stripes', 2003, '#dc2626', '#09090b'],
    ['tr46', 'In the End', 'Linkin Park', 2001, '#475569', '#0f172a'],
    ['tr47', 'Feel Good Inc.', 'Gorillaz', 2005, '#10b981', '#064e3b'],
    ['tr48', 'Take Me Out', 'Franz Ferdinand', 2004, '#ea580c', '#2c1104']
  ])
];

export const GENRES: readonly string[] = [...new Set(TRACK_PACKS.map((p) => p.genre))];
export const DECADES: readonly string[] = [...new Set(TRACK_PACKS.map((p) => p.decade))];

export const KARAOKE_CHALLENGES: readonly string[] = [
  'Canta el estribillo con la misma energía que el original',
  'Canta una estrofa sin parar de respirar',
  'Imita el estilo vocal del artista durante 15 segundos',
  'Canta con el volumen al máximo y haz un gesto final',
  'Canta la canción como si fuera una balada lenta',
  'Canta y baila a la vez sin perder el ritmo'
];

export function trackToOption(track: Track | VinilTrack): PublicOption {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    palette: track.palette,
    motif: track.motif,
    ...('cover' in track && track.cover ? { cover: track.cover } : {}),
    ...(track.spotifyUri ? { spotifyUri: track.spotifyUri } : {})
  };
}
